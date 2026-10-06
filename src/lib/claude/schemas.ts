import { z } from "zod";
import { THEME_IDS } from "../config/themes";

const ThemeId = z.enum(THEME_IDS);

/* ---- Classification des scrutins ---- */
export const ScrutinClassification = z.object({
  uid: z.string(),
  summary: z.string().describe("Résumé en une phrase, en français, de ce sur quoi porte le vote (sans jargon)."),
  stakes: z.string().describe("Enjeu concret pour les citoyens en une phrase. Vide si purement procédural."),
  is_procedural: z.boolean().describe("true si vote de procédure sans portée politique de fond (renvoi, ordre du jour, motion de rejet préalable technique...)."),
  salience: z.number().int().min(1).max(5).describe("Importance politique : 1 amendement mineur … 5 texte structurant / motion de censure / budget / réforme majeure."),
  themes: z
    .array(
      z.object({
        theme: ThemeId,
        direction: z
          .number()
          .int()
          .min(-1)
          .max(1)
          .describe("Sens d'un vote POUR sur l'axe du thème : +1 si voter POUR rapproche du pôle +1, -1 si voter POUR rapproche du pôle -1, 0 si le vote n'oriente pas l'axe."),
        weight: z.number().min(0).max(1).describe("Part du thème dans ce vote (le principal ≈ 1)."),
      }),
    )
    .max(3)
    .describe("1 à 3 thèmes, le principal en premier. Tableau vide si purement procédural ou hors taxonomie."),
});
export const ScrutinBatchOutput = z.object({ results: z.array(ScrutinClassification) });

/* ---- Analyse d'un programme ---- */
export const ProgrammeAnalysis = z.object({
  title: z.string().describe("Titre du document tel qu'identifié."),
  party_confirmed: z.boolean().describe("true si le document est bien un programme/plateforme officiel du parti indiqué."),
  period: z.string().describe("Élection ou période visée (ex. 'Législatives 2024', 'Présidentielle 2027')."),
  overall_summary: z.string().describe("Résumé en 5 à 8 phrases des grandes orientations."),
  themes: z.array(
    z.object({
      theme: ThemeId,
      addressed: z.boolean(),
      stance: z.number().min(-1).max(1).describe("Position sur l'axe du thème, de -1 (pôle gauche) à +1 (pôle droite). 0 = centre ou équilibré."),
      confidence: z.number().min(0).max(1),
      summary: z.string().describe("Position du parti sur ce thème en 2-3 phrases."),
      measures: z.array(z.string()).describe("Mesures concrètes, formulées précisément (chiffres, âges, montants)."),
      quotes: z.array(z.string()).describe("Citations courtes et littérales du document (max 3)."),
    }),
  ),
});

/* ---- Découverte des sources de programme ---- */
export const DiscoveredSources = z.object({
  sources: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      kind: z.enum(["programme", "manifeste", "communique", "autre"]),
      is_pdf: z.boolean(),
      is_official: z.boolean().describe("true si hébergé par le parti ou sa campagne officielle."),
      period: z.string(),
      why: z.string(),
    }),
  ),
});

/* ---- Analyse de tweets ---- */
export const PostAnalysis = z.object({
  id: z.string(),
  is_political: z.boolean(),
  tone: z.enum(["factuel", "attaque", "promesse", "emotion", "autopromotion", "autre"]),
  themes: z.array(z.object({ theme: ThemeId, stance: z.number().min(-1).max(1) })).max(3),
  claims: z
    .array(
      z.object({
        claim: z.string().describe("Affirmation reformulée de façon neutre et vérifiable."),
        theme: ThemeId.nullable(),
        kind: z.enum(["fait", "promesse", "vote-revendique", "attaque", "autre"]),
        checkable: z.boolean().describe("true si vérifiable avec des votes parlementaires ou un programme."),
      }),
    )
    .max(3),
});
export const PostBatchOutput = z.object({ results: z.array(PostAnalysis) });

/* ---- Synthèse de cohérence parti × thème ---- */
export const CoherenceSynthesis = z.object({
  verdict: z.enum(["coherent", "nuance", "ecart", "contradiction", "insuffisant"]),
  narrative: z.string().describe("Analyse en 4 à 8 phrases : ce que le parti dit, ce qu'il vote, l'écart, avec des exemples de scrutins précis (date + objet)."),
  key_evidence: z.array(z.object({ scrutinUid: z.string(), note: z.string() })).max(6),
});

/* ---- Vérification d'affirmation ---- */
export const ClaimCheck = z.object({
  verdict: z.enum(["confirme", "nuance", "contredit", "inverifiable"]),
  explanation: z.string(),
  evidence: z.array(z.object({ scrutinUid: z.string(), note: z.string() })).max(5),
});

export type ScrutinClassificationT = z.infer<typeof ScrutinClassification>;
export type ProgrammeAnalysisT = z.infer<typeof ProgrammeAnalysis>;
export type PostAnalysisT = z.infer<typeof PostAnalysis>;
