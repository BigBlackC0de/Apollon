import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import crypto from "node:crypto";
import { eq, and } from "drizzle-orm";
import { getDb, nowIso, schema } from "../db";
import { themesPromptBlock } from "../config/themes";
import { claude, MODEL, APOLLON_PERSONA, trackUsage } from "./client";
import { DiscoveredSources, ProgrammeAnalysis } from "./schemas";
import type { JobContext } from "../jobs";

/**
 * Programmes politiques :
 *  1. découverte des sources officielles par Claude + recherche web (temps réel)
 *  2. récupération du contenu (PDF natif → envoyé tel quel à Claude ; HTML → texte)
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
Donne pour chaque source : URL exacte, titre, type, s'il s'agit d'un PDF, si elle est officielle, période visée, et pourquoi tu la retiens. Maximum 4 sources, les plus complètes d'abord.`;

    const res = await claude().messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: APOLLON_PERSONA,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8, user_location: { type: "approximate", country: "FR", timezone: "Europe/Paris" } }],
      messages: [{ role: "user", content: prompt }],
    });
    trackUsage("discover-programmes", MODEL, res.usage, ctx);
    if (res.stop_reason === "refusal") {
      ctx.log(`Refus du modèle pour ${p.name}`);
      continue;
    }
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    // Les résultats de recherche sont chiffrés ; les URL citées figurent dans le texte.
    const parsed = await claude().messages.parse({
      model: MODEL,
      max_tokens: 8000,
      output_config: { format: zodOutputFormat(DiscoveredSources), effort: "low" },
      messages: [{ role: "user", content: `Extrais la liste des sources de programme mentionnées dans ce texte (URL exactes) :\n\n${text}` }],
    });
    trackUsage("discover-programmes-parse", MODEL, parsed.usage, ctx);
    const sources = parsed.parsed_output?.sources ?? [];
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
- Si le document n'est pas un programme du parti indiqué (page d'accueil, article), mets party_confirmed=false et reste prudent.`;

export async function analyzeDocument(ctx: JobContext, docId: number) {
  const db = getDb();
  const doc = db.select().from(schema.documents).where(eq(schema.documents.id, docId)).get();
  if (!doc || doc.status !== "fetched") return;
  const party = db.select().from(schema.parties).where(eq(schema.parties.id, doc.partyId)).get();
  const content: Anthropic.ContentBlockParam[] = [];
  if (doc.pdfBase64) {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: doc.pdfBase64 }, title: doc.title });
  } else if (doc.text) {
    content.push({ type: "document", source: { type: "text", media_type: "text/plain", data: doc.text.slice(0, 1_500_000) }, title: doc.title });
  } else return;
  content.push({
    type: "text",
    text: `Parti : ${party?.name ?? doc.partyId}. Document : « ${doc.title} »${doc.url ? ` (${doc.url})` : ""}.\nAnalyse ce document selon la taxonomie.`,
  });

  ctx.log(`Analyse Claude : ${doc.title}`);
  const stream = claude().messages.stream({
    model: MODEL,
    max_tokens: 32000,
    system: [{ type: "text", text: SYSTEM_ANALYSE, cache_control: { type: "ephemeral" } }],
    output_config: { format: zodOutputFormat(ProgrammeAnalysis), effort: "high" },
    messages: [{ role: "user", content }],
  });
  const res = await stream.finalMessage();
  trackUsage("analyze-programme", MODEL, res.usage, ctx);
  if (res.stop_reason === "refusal") {
    db.update(schema.documents).set({ status: "error", error: "Refus du modèle" }).where(eq(schema.documents.id, docId)).run();
    return;
  }
  const textBlock = res.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  let parsed: ReturnType<typeof ProgrammeAnalysis.parse> | null = null;
  try {
    parsed = ProgrammeAnalysis.parse(JSON.parse(textBlock?.text ?? ""));
  } catch (e) {
    db.update(schema.documents).set({ status: "error", error: `Sortie non parsable : ${(e as Error).message.slice(0, 200)}` }).where(eq(schema.documents.id, docId)).run();
    return;
  }
  db.delete(schema.documentAnalyses).where(eq(schema.documentAnalyses.documentId, docId)).run();
  const rows = parsed.themes
    .filter((t) => t.addressed)
    .map((t) => ({
      documentId: docId,
      theme: t.theme,
      stance: t.stance,
      confidence: parsed!.party_confirmed ? t.confidence : t.confidence * 0.3,
      summary: t.summary,
      measures: t.measures,
      quotes: t.quotes,
      model: MODEL,
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
  // Résumé global stocké dans settings pour affichage
  db.insert(schema.settings)
    .values({ key: `doc-summary:${docId}`, value: JSON.stringify({ period: parsed.period, summary: parsed.overall_summary }), updatedAt: nowIso() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: JSON.stringify({ period: parsed.period, summary: parsed.overall_summary }), updatedAt: nowIso() } })
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
    ctx.setProgress(++i, fetched.length, `Programmes analysés : ${i}/${fetched.length} — ${ctx.costUsd().toFixed(2)} $`);
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
