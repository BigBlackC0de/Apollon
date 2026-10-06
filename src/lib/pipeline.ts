import { startJob, type JobContext, isJobRunning } from "./jobs";
import { seedParties } from "./ingest/seed";
import { ingestAnDeputes, ingestAnScrutins } from "./ingest/an";
import { ingestSenat } from "./ingest/senat";
import { classifyScrutins } from "./claude/classify-scrutins";
import { discoverProgrammes, processProgrammes } from "./claude/programmes";
import { ingestX, analyzePosts, checkClaims } from "./claude/posts";
import { synthesizeCoherence } from "./claude/synthesize";
import { computeAllScores } from "./analysis/scores";

/**
 * Catalogue des jobs lançables depuis l'UI ou le CLI.
 * Chaque job est idempotent / incrémental : relancer ne refait que le manquant.
 */
export const JOB_KINDS = {
  "ingest-an": { label: "Importer l'Assemblée nationale", desc: "Députés, groupes, 8 000+ scrutins et votes nominatifs (open data officiel). Gratuit.", claude: false },
  "ingest-senat": { label: "Importer le Sénat", desc: "Sénateurs, scrutins publics et votes individuels (NosParlementaires / data.senat.fr). Gratuit.", claude: false },
  "classify-scrutins": { label: "Classifier les scrutins", desc: "Claude attribue thèmes, sens et importance à chaque scrutin non encore analysé. ≈ 15–40 $ pour la législature complète en Opus 5 (incrémental ensuite).", claude: true },
  "discover-programmes": { label: "Trouver les programmes", desc: "Claude cherche sur le web les programmes officiels actuels de chaque parti. ≈ 1–3 $.", claude: true },
  "process-programmes": { label: "Analyser les programmes", desc: "Récupère les documents trouvés (PDF/pages) et les positionne thème par thème. ≈ 1–2 $ par document.", claude: true },
  "ingest-x": { label: "Rafraîchir X", desc: "Lit les nouveaux tweets des comptes suivis (facturé par X à l'usage).", claude: false },
  "analyze-posts": { label: "Analyser les tweets", desc: "Thèmes, ton, affirmations vérifiables. ≈ 0,03 $ par tweet en Opus 5.", claude: true },
  "check-claims": { label: "Vérifier les affirmations", desc: "Confronte les affirmations des tweets aux votes réels. ≈ 0,05 $ par affirmation.", claude: true },
  "compute-scores": { label: "Recalculer les scores", desc: "Positions votées / déclarées / écarts, par parti et par parlementaire. Gratuit, instantané.", claude: false },
  "synthesize": { label: "Synthèses dire / faire", desc: "Claude rédige, pour chaque parti × thème, le verdict de cohérence avec preuves. ≈ 0,15 $ par cellule (≈ 150 cellules).", claude: true },
  "refresh-all": { label: "Tout rafraîchir", desc: "Enchaîne : import AN + Sénat → classification des nouveaux scrutins → X → tweets → scores → synthèses manquantes.", claude: true },
} as const;
export type JobKind = keyof typeof JOB_KINDS;

const RUNNERS: Record<JobKind, (ctx: JobContext, params?: Record<string, unknown>) => Promise<void>> = {
  "ingest-an": async (ctx) => {
    seedParties();
    await ingestAnDeputes(ctx);
    await ingestAnScrutins(ctx);
    computeAllScores(ctx.log);
  },
  "ingest-senat": async (ctx) => {
    seedParties();
    await ingestSenat(ctx);
    computeAllScores(ctx.log);
  },
  "classify-scrutins": async (ctx, params) => {
    await classifyScrutins(ctx, { limit: params?.limit ? Number(params.limit) : undefined, chamber: params?.chamber as "AN" | "SENAT" | undefined });
    computeAllScores(ctx.log);
  },
  "discover-programmes": async (ctx, params) => {
    seedParties();
    await discoverProgrammes(ctx, params?.partyIds as string[] | undefined);
  },
  "process-programmes": async (ctx) => {
    await processProgrammes(ctx);
    computeAllScores(ctx.log);
  },
  "ingest-x": async (ctx) => {
    seedParties();
    await ingestX(ctx);
  },
  "analyze-posts": async (ctx, params) => {
    await analyzePosts(ctx, { limit: params?.limit ? Number(params.limit) : undefined });
    computeAllScores(ctx.log);
  },
  "check-claims": async (ctx, params) => {
    await checkClaims(ctx, { limit: params?.limit ? Number(params.limit) : undefined });
  },
  "compute-scores": async (ctx) => {
    seedParties();
    computeAllScores(ctx.log);
  },
  synthesize: async (ctx, params) => {
    computeAllScores(ctx.log);
    await synthesizeCoherence(ctx, { partyIds: params?.partyIds as string[] | undefined, themes: params?.themes as string[] | undefined, force: !!params?.force });
  },
  "refresh-all": async (ctx) => {
    seedParties();
    await ingestAnDeputes(ctx);
    await ingestAnScrutins(ctx);
    try {
      await ingestSenat(ctx);
    } catch (e) {
      ctx.log(`Sénat ignoré : ${(e as Error).message}`);
    }
    await classifyScrutins(ctx);
    try {
      await ingestX(ctx);
      await analyzePosts(ctx);
      await checkClaims(ctx, { limit: 100 });
    } catch (e) {
      ctx.log(`X ignoré : ${(e as Error).message}`);
    }
    computeAllScores(ctx.log);
    await synthesizeCoherence(ctx);
  },
};

export function launchJob(kind: JobKind, params?: Record<string, unknown>, budgetUsd?: number): { id?: string; error?: string } {
  if (!RUNNERS[kind]) return { error: `Job inconnu : ${kind}` };
  if (isJobRunning(kind)) return { error: `Un job « ${JOB_KINDS[kind].label} » est déjà en cours` };
  const id = startJob(kind, (ctx) => RUNNERS[kind](ctx, params), { budgetUsd });
  return { id };
}
