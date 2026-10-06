/**
 * Taxonomie des thèmes politiques d'Apollon.
 *
 * Chaque thème est un AXE orienté de -1 à +1 :
 *   -1 = pôle "gauche" du thème (poleLeft)
 *   +1 = pôle "droite" du thème (poleRight)
 * Cette orientation est purement conventionnelle (elle permet de comparer
 * programmes, votes et tweets sur la même échelle) et n'est pas un jugement.
 *
 * `group` sert à construire la boussole 2D :
 *   eco      → axe horizontal (économie / social)
 *   societal → axe vertical (identité, sécurité, souveraineté, mœurs)
 *   other    → non projeté sur la boussole, mais comparé thème par thème.
 */
export type ThemeGroup = "eco" | "societal" | "other";

export interface Theme {
  id: string;
  label: string;
  emoji: string;
  group: ThemeGroup;
  /** Ce que signifie -1 */
  poleLeft: string;
  /** Ce que signifie +1 */
  poleRight: string;
  /** Guide pour le classifieur : de quoi parle ce thème. */
  scope: string;
}

export const THEMES: Theme[] = [
  {
    id: "economie-travail",
    label: "Économie & travail",
    emoji: "💼",
    group: "eco",
    poleLeft: "Protection des salariés, hausse du SMIC, régulation, nationalisations, 32h",
    poleRight: "Flexibilité du travail, moins de charges, dérégulation, liberté d'entreprendre",
    scope:
      "Droit du travail, salaires, SMIC, temps de travail, chômage et assurance chômage, entreprises, concurrence, industrie, nationalisations/privatisations, pouvoir d'achat par la régulation des prix.",
  },
  {
    id: "fiscalite-budget",
    label: "Fiscalité & budget",
    emoji: "🧾",
    group: "eco",
    poleLeft: "Hausse des impôts sur hauts revenus/capital/entreprises, ISF, redistribution, dépense publique",
    poleRight: "Baisse des impôts et prélèvements, réduction de la dépense publique, rigueur budgétaire",
    scope:
      "Impôts (IR, ISF/IFI, IS, TVA, taxes), niches fiscales, déficit, dette, lois de finances, crédits budgétaires, cotisations, taxation des superprofits.",
  },
  {
    id: "retraites",
    label: "Retraites",
    emoji: "👵",
    group: "eco",
    poleLeft: "Retraite à 60/62 ans, abrogation de la réforme 2023, revalorisation des pensions",
    poleRight: "Report de l'âge légal, allongement de la durée de cotisation, capitalisation",
    scope: "Âge de départ, durée de cotisation, niveau des pensions, régimes spéciaux, réforme des retraites, capitalisation.",
  },
  {
    id: "sante-social",
    label: "Santé & protection sociale",
    emoji: "🏥",
    group: "eco",
    poleLeft: "Renforcement de l'hôpital public, Sécurité sociale étendue, minima sociaux revalorisés",
    poleRight: "Maîtrise des dépenses sociales, conditionnalité des aides, place accrue du privé",
    scope:
      "Hôpital, Sécurité sociale, PLFSS, déserts médicaux, handicap, dépendance, RSA et minima sociaux, allocations, logement social, aide sociale.",
  },
  {
    id: "immigration",
    label: "Immigration & asile",
    emoji: "🛂",
    group: "societal",
    poleLeft: "Accueil, régularisations, droit du sol, accès aux soins (AME), voies légales",
    poleRight: "Restriction des flux, quotas, expulsions facilitées, préférence nationale, fin de l'AME",
    scope: "Titres de séjour, asile, OQTF, AME, naturalisation, droit du sol, regroupement familial, frontières, Schengen.",
  },
  {
    id: "securite-justice",
    label: "Sécurité & justice",
    emoji: "⚖️",
    group: "societal",
    poleLeft: "Prévention, police de proximité, garanties des libertés publiques, alternatives à la prison",
    poleRight: "Peines planchers, fermeté pénale, moyens accrus de police, vidéosurveillance, état d'urgence",
    scope: "Police, gendarmerie, justice pénale, prisons, terrorisme, narcotrafic, libertés publiques, surveillance, armes.",
  },
  {
    id: "societe-laicite",
    label: "Société, mœurs & laïcité",
    emoji: "🏳️",
    group: "societal",
    poleLeft: "Progressisme : droits LGBT+, IVG, fin de vie, PMA/GPA, laïcité libérale",
    poleRight: "Conservatisme : famille traditionnelle, limites à la fin de vie, laïcité restrictive, ordre moral",
    scope: "Fin de vie / aide à mourir, IVG, PMA, GPA, droits LGBT+, laïcité et religion, voile, famille, égalité femmes-hommes.",
  },
  {
    id: "europe-international",
    label: "Europe & international",
    emoji: "🌍",
    group: "societal",
    poleLeft: "Intégration européenne, multilatéralisme, respect des traités, OTAN/UE",
    poleRight: "Souveraineté nationale, primauté du droit national, critique de l'UE, non-alignement ou nationalisme",
    scope: "Union européenne, traités, OTAN, défense et armée, Ukraine, Israël/Palestine, francophonie, commerce international, aide au développement.",
  },
  {
    id: "ecologie-energie",
    label: "Écologie & énergie",
    emoji: "🌱",
    group: "other",
    poleLeft: "Transition rapide et contraignante, sortie des fossiles, renouvelables, normes environnementales",
    poleRight: "Priorité à la croissance et au pouvoir d'achat, nucléaire, allègement des normes, moratoire renouvelables",
    scope: "Climat, énergie (nucléaire, renouvelables, fossiles), agriculture et pesticides, biodiversité, eau, ZAN, normes environnementales, transports.",
  },
  {
    id: "institutions-democratie",
    label: "Institutions & démocratie",
    emoji: "🏛️",
    group: "other",
    poleLeft: "VIe République, RIC, proportionnelle, démocratie directe, limitation du 49.3",
    poleRight: "Stabilité des institutions, exécutif fort, statu quo constitutionnel",
    scope: "Constitution, 49.3, motions de censure, mode de scrutin, référendum, décentralisation, Corse, Nouvelle-Calédonie, transparence, cumul des mandats.",
  },
  {
    id: "education-culture",
    label: "Éducation & culture",
    emoji: "🎓",
    group: "other",
    poleLeft: "École publique renforcée, mixité sociale, moyens pour l'université, service public de l'audiovisuel",
    poleRight: "Autonomie des établissements, sélection, uniforme et autorité, soutien au privé, privatisation de l'audiovisuel",
    scope: "École, lycée, université, recherche, enseignement privé, culture, audiovisuel public, sport, jeunesse.",
  },
];

export const THEME_IDS = THEMES.map((t) => t.id) as [string, ...string[]];
export const THEME_BY_ID: Record<string, Theme> = Object.fromEntries(THEMES.map((t) => [t.id, t]));

export function themeLabel(id: string): string {
  return THEME_BY_ID[id]?.label ?? id;
}

/** Texte de référence injecté dans les prompts Claude (stable → mis en cache). */
export function themesPromptBlock(): string {
  return THEMES.map(
    (t) =>
      `- ${t.id} — ${t.label}\n    Périmètre : ${t.scope}\n    Pôle -1 : ${t.poleLeft}\n    Pôle +1 : ${t.poleRight}`,
  ).join("\n");
}
