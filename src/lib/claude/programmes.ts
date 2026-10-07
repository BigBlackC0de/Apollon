import crypto from "node:crypto";
import { eq, and } from "drizzle-orm";
import { getDb, nowIso, schema } from "../db";
import { themesPromptBlock } from "../config/themes";
import { APOLLON_PERSONA } from "./client";
import { llm, modelFor, engine } from "../llm";
import { DiscoveredSources, ProgrammeAnalysis } from "./schemas";
import type { JobContext } from "../jobs";

/**
 * Programmes politiques :
 *  1. découverte des sources officielles par Claude + recherche web (temps réel)
 *  2. récupération du contenu (PDF natif ; HTML → texte)
 *  3. analyse structurée thème par thème
 */

const MAX_PDF_BYTES = 30 * 1024 * 1024;

/* ------------------------------------------------------------------ */
/* 1. Découverte                                                       */
/* ------------------------------------------------------------------ */

export async function discoverProgrammes(ctx: JobContext, partyIds?: string[]) {
  const db = getDb();
  const parties = db.select().from(schema.parties).all().filter((p) => !partyIds || partyIds.includes(p.id));
  const year = new Date().getFullYear();
  ctx.setProgress(0, parties.length, "Recherche des programmes officiels…");
  ctx.log(`Recherche web via ${engine()} (${modelFor("main")})`);
  let i = 0;
  for (const p of parties) {
    ctx.checkpoint();
    ctx.log(`Recherche web : programme de ${p.name}`);
    const prompt = `Trouve les documents de PROGRAMME officiels et actuels du parti politique français « ${p.name} » (${p.shortName}${p.leaders.length ? `, dirigé par ${p.leaders.join(", ")}` : ""}).
Nous sommes en ${year}. Cherche en priorité :
1. le programme ou projet pour la prochaine élection présidentielle (2027) ou législative, s'il est publié ;
2. à défaut, le dernier programme complet (législatives 2024, présidentielle 2022) ;
3. une plateforme/charte/projet de fond publié sur le site officiel du parti${p.website ? ` (${p.website})` : ""} ou de sa campagne.
Privilégie les PDF complets et les pages officielles hébergées par le parti. Évite les articles de presse, Wikipédia, et les sites tiers.
Donne pour chaque source : URL exacte, titre, type, s'il s'agit d'un PDF, si elle est officielle, période visée, et pourquoi tu la retiens. Maximum 4 sources, les plus complètes d'abord. Termine par la liste des URL retenues, une par ligne.`;

    const search = await llm({ task: "discover-programmes", system: APOLLON_PERSONA, prompt, tools: ["web"], model: "main", effort: "medium", ctx });
    if (!search.text) {
      ctx.log(`${p.shortName} : recherche sans résultat (${search.error ?? "vide"})`);
      ctx.setProgress(++i, parties.length);
      continue;
    }
    const parsed = await llm({
      task: "discover-programmes-parse",
      system: "Tu extrais des données structurées à partir d'un texte, sans rien inventer. Réponds uniquement avec le JSON demandé.",
      prompt: `Extrais la liste des sources de programme mentionnées dans ce texte (URL exactes) :\n\n${search.text}`,
      schema: DiscoveredSources,
      model: "main",
      effort: "low",
      ctx,
    });
    const sources = parsed.output?.sources ?? [];
    let added = 0;
    for (const s of sources) {
      if (!/^https?:\/\//.test(s.url)) continue;
      const exists = db.select().from(schema.documents).where(and(eq(schema.documents.partyId, p.id), eq(schema.documents.url, s.url))).get();
      if (exists) continue;
      db.insert(schema.documents)
        .values({
          partyId: p.id,
          kind: s.kind === "autre" ? "manifeste" : s.kind,
          title: `${s.title}${s.period ? ` (${s.period})` : ""}`,
          url: s.url,
          discoveredBy: "claude-web-search",
          status: "pending",
          error: s.is_official ? null : "Source non officielle selon la recherche — à vérifier",
        })
        .run();
      added++;
    }
    ctx.log(`${p.shortName} : ${sources.length} sources trouvées, ${added} nouvelles`);
    ctx.setProgress(++i, parties.length);
  }
}

/* ------------------------------------------------------------------ */
/* 2. Récupération                                                     */
/* ------------------------------------------------------------------ */

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&eacute;/g, "é")
    .replace(/&egrave;/g, "è")
    .replace(/&agrave;/g, "à")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

export async function fetchDocument(docId: number, log?: (m: string) => void) {
  const db = getDb();
  const doc = db.select().from(schema.documents).where(eq(schema.documents.id, docId)).get();
  if (!doc?.url) return;
  try {
    const res = await fetch(doc.url, { headers: { "user-agent": "Mozilla/5.0 (compatible; Apollon/0.1; analyse citoyenne)" }, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    const buf = Buffer.from(await res.arrayBuffer());
    const isPdf = mime === "application/pdf" || buf.subarray(0, 5).toString() === "%PDF-";
    if (isPdf) {
      if (buf.length > MAX_PDF_BYTES) throw new Error(`PDF trop volumineux (${(buf.length / 1e6).toFixed(0)} Mo)`);
      db.update(schema.documents)
        .set({ mime: "application/pdf", pdfBase64: buf.toString("base64"), text: null, sha: sha(buf), fetchedAt: nowIso(), status: "fetched", error: null })
        .where(eq(schema.documents.id, docId))
        .run();
      log?.(`PDF récupéré : ${doc.title} (${(buf.length / 1e6).toFixed(1)} Mo)`);
    } else {
      const text = htmlToText(buf.toString("utf8"));
      if (text.length < 500) throw new Error("Page trop courte ou vide (JavaScript requis ?)");
      db.update(schema.documents)
        .set({ mime: mime || "text/html", text, pdfBase64: null, sha: sha(buf), fetchedAt: nowIso(), status: "fetched", error: null })
        .where(eq(schema.documents.id, docId))
        .run();
      log?.(`Page récupérée : ${doc.title} (${text.length} caractères)`);
    }
  } catch (e) {
    db.update(schema.documents).set({ status: "error", error: (e as Error).message }).where(eq(schema.documents.id, docId)).run();
    log?.(`Échec ${doc.title} : ${(e as Error).message}`);
  }
}

const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");

/* ------------------------------------------------------------------ */
/* 3. Analyse                                                          */
/* ------------------------------------------------------------------ */

const SYSTEM_ANALYSE = `${APOLLON_PERSONA}

Tâche : analyser un programme / document de fond d'un parti politique français et le positionner, thème par thème, sur les axes suivants.

TAXONOMIE DES THÈMES (axes orientés de -1 à +1) :
${themesPromptBlock()}

Consignes :
- Pour CHAQUE thème de la taxonomie, indique s'il est abordé ; si oui, la position (stance) de -1 à +1 et une confiance.
- La stance mesure l'orientation des MESURES proposées, pas le ton. Des mesures mixtes → stance proche de 0 avec confiance moyenne.
- Les "measures" doivent être concrètes et vérifiables plus tard contre des votes (âge, montant, abrogation de telle loi...).
- Les "quotes" sont des citations littérales courtes du document.
- Si le document n'est pas un programme du parti indiqué (page d'accueil, article), mets party_confirmed=false et reste prudent.
- Réponds uniquement avec le JSON demandé.`;

export async function analyzeDocument(ctx: JobContext, docId: number) {
  const db = getDb();
  const doc = db.select().from(schema.documents).where(eq(schema.documents.id, docId)).get();
  if (!doc || doc.status !== "fetched") return;
  const party = db.select().from(schema.parties).where(eq(schema.parties.id, doc.partyId)).get();
  if (!doc.pdfBase64 && !doc.text) return;
  ctx.log(`Analyse : ${doc.title}`);
  const model = modelFor("main");
  const res = await llm({
    task: "analyze-programme",
    system: SYSTEM_ANALYSE,
    prompt: `Parti : ${party?.name ?? doc.partyId}. Document : « ${doc.title} »${doc.url ? ` (${doc.url})` : ""}.\nAnalyse ce document selon la taxonomie.`,
    schema: ProgrammeAnalysis,
    model: "main",
    effort: "high",
    maxTokens: 32000,
    pdf: doc.pdfBase64 ? { base64: doc.pdfBase64, title: doc.title } : undefined,
    textDoc: !doc.pdfBase64 && doc.text ? { text: doc.text, title: doc.title } : undefined,
    ctx,
  });
  const parsed = res.output;
  if (!parsed) {
    db.update(schema.documents).set({ status: "error", error: res.error ?? "Sortie vide" }).where(eq(schema.documents.id, docId)).run();
    return;
  }
  db.delete(schema.documentAnalyses).where(eq(schema.documentAnalyses.documentId, docId)).run();
  const rows = parsed.themes
    .filter((t) => t.addressed)
    .map((t) => ({
      documentId: docId,
      theme: t.theme,
      stance: t.stance,
      confidence: parsed.party_confirmed ? t.confidence : t.confidence * 0.3,
      summary: t.summary,
      measures: t.measures,
      quotes: t.quotes,
      model,
      analyzedAt: nowIso(),
    }));
  if (rows.length) db.insert(schema.documentAnalyses).values(rows).run();
  db.update(schema.documents)
    .set({
      status: "analyzed",
      title: parsed.party_confirmed ? doc.title : `${doc.title} [non confirmé comme programme]`,
      error: parsed.party_confirmed ? null : "Claude n'a pas confirmé qu'il s'agit d'un programme officiel du parti : confiance réduite.",
    })
    .where(eq(schema.documents.id, docId))
    .run();
  const summary = JSON.stringify({ period: parsed.period, summary: parsed.overall_summary });
  db.insert(schema.settings)
    .values({ key: `doc-summary:${docId}`, value: summary, updatedAt: nowIso() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: summary, updatedAt: nowIso() } })
    .run();
  ctx.log(`${doc.title} : ${rows.length} thèmes positionnés (${parsed.party_confirmed ? "programme confirmé" : "NON confirmé"})`);
}

/** Pipeline complet : récupère les documents en attente puis les analyse. */
export async function processProgrammes(ctx: JobContext) {
  const db = getDb();
  const pending = db.select().from(schema.documents).where(eq(schema.documents.status, "pending")).all();
  ctx.log(`${pending.length} documents à récupérer`);
  for (const d of pending) {
    ctx.checkpoint();
    await fetchDocument(d.id, ctx.log);
  }
  const fetched = db.select().from(schema.documents).where(eq(schema.documents.status, "fetched")).all();
  ctx.log(`${fetched.length} documents à analyser`);
  let i = 0;
  ctx.setProgress(0, fetched.length);
  for (const d of fetched) {
    ctx.checkpoint();
    try {
      await analyzeDocument(ctx, d.id);
    } catch (e) {
      ctx.log(`Erreur sur ${d.title} : ${(e as Error).message}`);
      db.update(schema.documents).set({ status: "error", error: (e as Error).message.slice(0, 300) }).where(eq(schema.documents.id, d.id)).run();
    }
    ctx.setProgress(++i, fetched.length, `Programmes analysés : ${i}/${fetched.length} — ${ctx.costUsd().toFixed(2)} $ équiv.`);
  }
}

/** Ajout manuel d'une source (URL ou texte collé). */
export function addManualDocument(input: { partyId: string; title: string; url?: string; text?: string; kind?: string }) {
  const db = getDb();
  const hasText = !!input.text && input.text.trim().length > 200;
  const r = db
    .insert(schema.documents)
    .values({
      partyId: input.partyId,
      kind: input.kind ?? "programme",
      title: input.title,
      url: input.url ?? null,
      text: hasText ? input.text!.trim() : null,
      mime: hasText ? "text/plain" : null,
      discoveredBy: "manual",
      fetchedAt: hasText ? nowIso() : null,
      status: hasText ? "fetched" : "pending",
    })
    .run();
  return Number(r.lastInsertRowid);
}
