import { sql, inArray } from "drizzle-orm";
import { getDb, nowIso, schema } from "../db";
import { themesPromptBlock } from "../config/themes";
import { APOLLON_PERSONA, pMap } from "./client";
import { llm, modelFor, engine } from "../llm";
import { ScrutinBatchOutput } from "./schemas";
import type { JobContext } from "../jobs";
import { computePartyScores } from "../analysis/scores";

/**
 * Classifie chaque scrutin : thèmes, sens d'un vote POUR sur l'axe, importance.
 * Incrémental : ne traite que les scrutins sans analyse.
 * Lots de BATCH scrutins par requête pour amortir le prompt système.
 */
const BATCH = 25;

const SYSTEM = `${APOLLON_PERSONA}

Tâche : classifier des scrutins parlementaires français (Assemblée nationale ou Sénat) selon la taxonomie ci-dessous.

TAXONOMIE DES THÈMES (axes orientés de -1 à +1) :
${themesPromptBlock()}

Consignes :
- Pour chaque scrutin, indique les thèmes concernés (1 à 3, principal en premier) et pour chacun le sens d'un vote POUR :
  +1 si voter POUR rapproche de la position "pôle +1", -1 si voter POUR rapproche du "pôle -1", 0 si le vote n'oriente pas cet axe.
- Attention aux inversions : voter POUR une "motion de rejet" ou POUR la "suppression d'un article" va dans le sens CONTRAIRE du texte visé. Voter POUR un amendement de suppression d'une mesure restrictive = sens -1 sur immigration, etc.
- Une motion de censure contre un gouvernement est de nature institutionnelle (institutions-democratie, direction 0) sauf si elle vise clairement une réforme précise (ex. retraites via 49.3 → retraites, direction selon le sens).
- Les votes purement procéduraux (ordre du jour, renvoi en commission sans enjeu, seconde délibération technique) sont is_procedural=true avec themes=[].
- Les lois de finances / PLFSS : fiscalite-budget ou sante-social ; les crédits d'une mission → thème de la mission.
- salience : 1 = amendement mineur, 2 = amendement notable, 3 = article important, 4 = ensemble d'un texte, 5 = texte majeur / censure / budget.
- Reste fidèle à l'intitulé ; si l'objet est trop vague pour trancher, direction 0 et weight faible.
- Réponds uniquement avec le JSON demandé, un résultat par uid, sans commentaire.`;

export async function classifyScrutins(ctx: JobContext, opts?: { chamber?: "AN" | "SENAT"; limit?: number }) {
  const db = getDb();
  const pending = db
    .select({ uid: schema.scrutins.uid, chamber: schema.scrutins.chamber, title: schema.scrutins.title, objet: schema.scrutins.objet, date: schema.scrutins.date, demandeur: schema.scrutins.demandeur, sort: schema.scrutins.sort, typeVote: schema.scrutins.typeVote })
    .from(schema.scrutins)
    .where(sql`${schema.scrutins.uid} NOT IN (SELECT scrutin_uid FROM scrutin_analyses)${opts?.chamber ? sql` AND ${schema.scrutins.chamber} = ${opts.chamber}` : sql``}`)
    .orderBy(sql`${schema.scrutins.date} DESC`)
    .limit(opts?.limit ?? 100000)
    .all();

  const model = modelFor("bulk");
  ctx.log(`${pending.length} scrutins à classifier (moteur ${engine()}, modèle ${model}, lots de ${BATCH})`);
  if (pending.length === 0) return;

  const batches: typeof pending[] = [];
  for (let i = 0; i < pending.length; i += BATCH) batches.push(pending.slice(i, i + BATCH));
  let done = 0;
  let failed = 0;
  let batchesDone = 0;
  ctx.setProgress(0, pending.length, "Classification des scrutins…");
  const concurrency = engine() === "claude-code" ? 2 : 4;

  await pMap(batches, concurrency, async (batch) => {
    ctx.checkpoint();
    const userText = batch
      .map(
        (s) =>
          `### ${s.uid}\nChambre : ${s.chamber === "AN" ? "Assemblée nationale" : "Sénat"} — Date : ${s.date} — Résultat : ${s.sort ?? "?"}${s.typeVote ? ` — Type : ${s.typeVote}` : ""}\nIntitulé : ${s.title}${s.objet && s.objet !== s.title ? `\nObjet : ${s.objet}` : ""}${s.demandeur ? `\nDemandeur : ${s.demandeur}` : ""}`,
      )
      .join("\n\n");
    const res = await llm({
      task: "classify-scrutins",
      system: SYSTEM,
      prompt: `Classifie les ${batch.length} scrutins suivants. Réponds pour chaque uid.\n\n${userText}`,
      schema: ScrutinBatchOutput,
      model: "bulk",
      effort: "medium",
      ctx,
    });
    if (!res.output) {
      failed += batch.length;
      ctx.log(`Lot ignoré (${batch[0].uid}…) : ${res.error ?? "sortie vide"}`);
      return;
    }
    const wanted = new Set(batch.map((b) => b.uid));
    const rows = res.output.results
      .filter((r) => wanted.has(r.uid))
      .map((r) => ({
        scrutinUid: r.uid,
        primaryTheme: r.themes[0]?.theme ?? null,
        themes: r.themes.map((t) => ({ theme: t.theme, direction: t.direction as -1 | 0 | 1, weight: t.weight })),
        summary: r.summary,
        stakes: r.stakes || null,
        isProcedural: r.is_procedural,
        salience: r.salience,
        model,
        analyzedAt: nowIso(),
      }));
    if (rows.length) {
      db.delete(schema.scrutinAnalyses).where(inArray(schema.scrutinAnalyses.scrutinUid, rows.map((r) => r.scrutinUid))).run();
      db.insert(schema.scrutinAnalyses).values(rows).run();
    }
    done += rows.length;
    ctx.setProgress(done + failed, pending.length, `Scrutins classifiés : ${done}/${pending.length} — ${ctx.costUsd().toFixed(2)} $ équiv.`);
    // Rafraîchit les positions en cours de route pour que l'interface et le chat suivent.
    if (++batchesDone % 8 === 0) {
      try {
        computePartyScores();
      } catch (e) {
        ctx.log(`Recalcul intermédiaire ignoré : ${(e as Error).message}`);
      }
    }
  });
  ctx.log(`Classification terminée : ${done} scrutins${failed ? `, ${failed} en échec (relancer le job)` : ""} — ${ctx.costUsd().toFixed(2)} $ équivalent`);
}
