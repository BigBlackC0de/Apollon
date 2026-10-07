import { and, eq } from "drizzle-orm";
import { getDb, getSqlite, nowIso, schema } from "../db";
import { THEMES, THEME_BY_ID } from "../config/themes";
import { APOLLON_PERSONA, pMap } from "./client";
import { llm, modelFor, engine } from "../llm";
import { CoherenceSynthesis } from "./schemas";
import type { JobContext } from "../jobs";
import type { EvidenceItem } from "../db/schema";

/**
 * Synthèse de cohérence « dire / faire » pour chaque parti × thème :
 * programme (déclaré) vs votes (fait) vs tweets, avec verdict et preuves.
 */

const SYSTEM = `${APOLLON_PERSONA}

Tâche : pour un parti et un thème donnés, confronter ce que le parti DÉCLARE (programme, tweets) à ce qu'il VOTE au Parlement, et rendre un verdict de cohérence.

Verdicts :
- coherent : les votes vont dans le sens des engagements ;
- nuance : globalement cohérent, avec des exceptions ou une intensité différente ;
- ecart : décalage net entre discours et votes (ex. promesse forte, votes tièdes ou absents) ;
- contradiction : votes opposés aux engagements sur des points importants ;
- insuffisant : trop peu de votes ou de matière déclarée pour conclure.

Règles :
- Appuie-toi sur les scrutins fournis, cite-les précisément (date, objet) et dans key_evidence (uid). N'invente aucun vote.
- Tiens compte de la logique parlementaire : un groupe d'opposition vote souvent CONTRE des textes gouvernementaux même proches de ses idées (ou l'inverse) ; signale-le quand cela explique un écart, sans l'excuser systématiquement.
- Un parti sans député (positions votées absentes) → insuffisant, en le disant.
- Rédige en français, pour un citoyen, sans jargon, 4 à 8 phrases.
- Réponds uniquement avec le JSON demandé.`;

export async function synthesizeCoherence(ctx: JobContext, opts?: { partyIds?: string[]; themes?: string[]; force?: boolean }) {
  const db = getDb();
  const sqlite = getSqlite();
  const parties = db.select().from(schema.parties).all().filter((p) => !opts?.partyIds || opts.partyIds.includes(p.id));
  const themes = THEMES.filter((t) => !opts?.themes || opts.themes.includes(t.id));
  const cells: { partyId: string; theme: string }[] = [];
  for (const p of parties) for (const t of themes) {
    const s = db.select().from(schema.partyThemeScores).where(and(eq(schema.partyThemeScores.partyId, p.id), eq(schema.partyThemeScores.theme, t.id))).get();
    if (!s) continue;
    if (!opts?.force && s.narrative) continue;
    if (s.votedN === 0 && s.declaredStance === null && s.postsN === 0) continue;
    cells.push({ partyId: p.id, theme: t.id });
  }
  ctx.log(`${cells.length} synthèses parti × thème à produire (${engine()}, ${modelFor("main")})`);
  ctx.setProgress(0, cells.length);
  let done = 0;
  await pMap(cells, engine() === "claude-code" ? 2 : 3, async (cell) => {
    ctx.checkpoint();
    const party = parties.find((p) => p.id === cell.partyId)!;
    const theme = THEME_BY_ID[cell.theme];
    const score = db.select().from(schema.partyThemeScores).where(and(eq(schema.partyThemeScores.partyId, cell.partyId), eq(schema.partyThemeScores.theme, cell.theme))).get()!;
    const docs = sqlite
      .prepare(`SELECT d.title, da.stance, da.confidence, da.summary, da.measures, da.quotes FROM document_analyses da JOIN documents d ON d.id = da.document_id WHERE d.party_id = ? AND da.theme = ?`)
      .all(cell.partyId, cell.theme) as { title: string; stance: number; confidence: number; summary: string; measures: string; quotes: string }[];
    const ev = sqlite
      .prepare(
        `SELECT s.uid, s.date, s.title, s.chamber, s.sort, a.summary, a.salience, a.themes, gv.position, gv.pour, gv.contre, gv.abstentions, gv.non_votants AS nonVotants
         FROM group_votes gv JOIN scrutins s ON s.uid = gv.scrutin_uid JOIN scrutin_analyses a ON a.scrutin_uid = s.uid
         WHERE gv.party_id = ? AND a.is_procedural = 0 AND (a.primary_theme = ? OR a.themes LIKE ?) AND gv.position IS NOT NULL
         ORDER BY a.salience DESC, s.date DESC LIMIT 40`,
      )
      .all(cell.partyId, cell.theme, `%"${cell.theme}"%`) as { uid: string; date: string; title: string; chamber: string; sort: string | null; summary: string; salience: number; themes: string; position: string; pour: number; contre: number; abstentions: number; nonVotants: number }[];
    const tweets = sqlite
      .prepare(`SELECT p.handle, p.created_at AS createdAt, p.text FROM post_analyses pa JOIN posts p ON p.id = pa.post_id WHERE p.party_id = ? AND pa.themes LIKE ? ORDER BY p.created_at DESC LIMIT 12`)
      .all(cell.partyId, `%"${cell.theme}"%`) as { handle: string; createdAt: string; text: string }[];

    const prompt = `PARTI : ${party.name} (${party.shortName}) — ${party.family}${party.notes ? `\nNote : ${party.notes}` : ""}
THÈME : ${theme.label}
Axe : -1 = ${theme.poleLeft} | +1 = ${theme.poleRight}

== CE QUE LE PARTI DÉCLARE ==
${docs.length ? docs.map((d) => `Source « ${d.title} » — stance ${d.stance.toFixed(2)} (confiance ${d.confidence.toFixed(2)})\n${d.summary}\nMesures : ${(JSON.parse(d.measures) as string[]).join(" ; ")}\nCitations : ${(JSON.parse(d.quotes) as string[]).map((q) => `« ${q} »`).join(" ")}`).join("\n\n") : "(aucun programme analysé pour ce thème)"}
${tweets.length ? `\nTweets récents sur le thème :\n${tweets.map((t) => `- @${t.handle} ${t.createdAt.slice(0, 10)} : ${t.text.replace(/\s+/g, " ").slice(0, 280)}`).join("\n")}` : ""}

== CE QUE LE PARTI VOTE ==
Position votée calculée : ${score.votedStance != null ? score.votedStance.toFixed(2) : "n/a"} sur ${score.votedN} votes de groupe à l'Assemblée${score.senatStance != null ? ` ; Sénat : ${score.senatStance.toFixed(2)} sur ${score.senatN} votes` : ""}.
Position déclarée calculée : ${score.declaredStance != null ? score.declaredStance.toFixed(2) : "n/a"}.
Scrutins les plus importants (position du groupe) :
${ev.length ? ev.map((e) => `- [${e.uid}] ${e.date} ${e.chamber} — ${e.summary} — importance ${e.salience} — groupe : ${e.position.toUpperCase()} (${e.pour} pour / ${e.contre} contre / ${e.abstentions} abst. / ${e.nonVotants} NV) — résultat : ${e.sort ?? "?"}`).join("\n") : "(aucun vote de groupe sur ce thème)"}

Rends ton verdict et ton analyse.`;

    const res = await llm({ task: "synthesize", system: SYSTEM, prompt, schema: CoherenceSynthesis, model: "main", effort: "high", ctx });
    const out = res.output;
    if (out) {
      const evMap = new Map(ev.map((e) => [e.uid, e]));
      const existing = (score.evidence ?? []) as EvidenceItem[];
      const noted: EvidenceItem[] = out.key_evidence
        .filter((k) => evMap.has(k.scrutinUid))
        .map((k) => {
          const e = evMap.get(k.scrutinUid)!;
          const dir = (JSON.parse(e.themes) as { theme: string; direction: number }[]).find((t) => t.theme === cell.theme)?.direction ?? 0;
          return { scrutinUid: e.uid, title: e.title, date: e.date, position: e.position, direction: dir, salience: e.salience, note: k.note };
        });
      const merged = [...noted, ...existing.filter((e) => !noted.some((n) => n.scrutinUid === e.scrutinUid))].slice(0, 30);
      db.update(schema.partyThemeScores)
        .set({ narrative: out.narrative, verdict: out.verdict, evidence: merged, updatedAt: nowIso() })
        .where(and(eq(schema.partyThemeScores.partyId, cell.partyId), eq(schema.partyThemeScores.theme, cell.theme)))
        .run();
    } else ctx.log(`${party.shortName} × ${theme.label} : ${res.error ?? "pas de sortie"}`);
    done++;
    ctx.setProgress(done, cells.length, `Synthèses : ${done}/${cells.length} — ${ctx.costUsd().toFixed(2)} $ équiv.`);
  });
}
