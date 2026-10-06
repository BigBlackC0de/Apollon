/**
 * Référentiel des partis politiques français suivis par Apollon.
 *
 * Classés de l'extrême gauche à l'extrême droite (lrIndex 0 → 100), uniquement
 * pour l'ORDRE D'AFFICHAGE. Les positions réelles sont calculées à partir des
 * programmes, des votes et des tweets.
 *
 * Mapping vers les données parlementaires :
 *  - anGroups     : abréviations des groupes à l'Assemblée (XVIIe législature)
 *  - parpolNames  : libellés "parti politique" déclarés par les députés (open data AN)
 *  - senatGroups  : abréviations des groupes au Sénat (approximation : un groupe
 *                   sénatorial peut agréger plusieurs partis — signalé dans l'UI)
 *  - xHandles     : comptes X à suivre (parti + figures). À VÉRIFIER / compléter dans l'UI.
 */
export interface PartyConfig {
  id: string;
  name: string;
  shortName: string;
  color: string;
  family: string;
  lrIndex: number;
  website?: string;
  anGroups: string[];
  parpolNames: string[];
  senatGroups: string[];
  xHandles: string[];
  leaders: string[];
  notes?: string;
}

export const PARTIES: PartyConfig[] = [
  {
    id: "lfi",
    name: "La France insoumise",
    shortName: "LFI",
    color: "#C9462C",
    family: "Gauche radicale",
    lrIndex: 8,
    website: "https://lafranceinsoumise.fr",
    anGroups: ["LFI-NFP"],
    parpolNames: ["La France Insoumise"],
    senatGroups: [],
    xHandles: ["FranceInsoumise", "JLMelenchon", "mbompard", "MathildePanot"],
    leaders: ["Jean-Luc Mélenchon", "Manuel Bompard", "Mathilde Panot"],
  },
  {
    id: "pcf",
    name: "Parti communiste français",
    shortName: "PCF",
    color: "#B5121B",
    family: "Gauche",
    lrIndex: 15,
    website: "https://www.pcf.fr",
    anGroups: ["GDR"],
    parpolNames: ["Parti communiste français"],
    senatGroups: ["CRCE-K", "CRCE"],
    xHandles: ["PCF", "Fabien_Roussel"],
    leaders: ["Fabien Roussel"],
    notes: "Le groupe GDR à l'Assemblée inclut aussi des élus ultramarins non communistes.",
  },
  {
    id: "eelv",
    name: "Les Écologistes",
    shortName: "Écolos",
    color: "#2E9E49",
    family: "Gauche",
    lrIndex: 25,
    website: "https://lesecologistes.fr",
    anGroups: ["ECOS"],
    parpolNames: ["Les Écologistes - EELV"],
    senatGroups: ["GEST"],
    xHandles: ["lesecologistes", "marinetondelier"],
    leaders: ["Marine Tondelier"],
  },
  {
    id: "ps",
    name: "Parti socialiste",
    shortName: "PS",
    color: "#E4318F",
    family: "Gauche",
    lrIndex: 32,
    website: "https://parti-socialiste.fr",
    anGroups: ["SOC"],
    parpolNames: ["Parti socialiste"],
    senatGroups: ["SER", "SOCR"],
    xHandles: ["partisocialiste", "faureolivier", "BorisVallaud"],
    leaders: ["Olivier Faure", "Boris Vallaud"],
  },
  {
    id: "renaissance",
    name: "Renaissance",
    shortName: "RE",
    color: "#F2B705",
    family: "Centre",
    lrIndex: 50,
    website: "https://parti-renaissance.fr",
    anGroups: ["EPR"],
    parpolNames: ["Ensemble ! (majorité présidentielle)", "Renaissance"],
    senatGroups: ["RDPI"],
    xHandles: ["Renaissance", "GabrielAttal", "EmmanuelMacron"],
    leaders: ["Gabriel Attal"],
  },
  {
    id: "modem",
    name: "Mouvement démocrate",
    shortName: "MoDem",
    color: "#FF8C00",
    family: "Centre",
    lrIndex: 52,
    website: "https://www.mouvementdemocrate.fr",
    anGroups: ["DEM"],
    parpolNames: ["Mouvement Démocrate"],
    senatGroups: ["UC"],
    xHandles: ["MoDem", "bayrou"],
    leaders: ["François Bayrou"],
    notes: "Le groupe UC au Sénat agrège MoDem, UDI et centristes divers.",
  },
  {
    id: "horizons",
    name: "Horizons",
    shortName: "HOR",
    color: "#1E6FB8",
    family: "Centre droit",
    lrIndex: 58,
    website: "https://horizonsleparti.fr",
    anGroups: ["HOR"],
    parpolNames: ["Horizons"],
    senatGroups: ["LIRT", "INDEP", "Les Indépendants"],
    xHandles: ["HorizonsLeParti", "EPhilippe_LH"],
    leaders: ["Édouard Philippe"],
  },
  {
    id: "liot",
    name: "LIOT (Libertés, Indépendants, Outre-mer et Territoires)",
    shortName: "LIOT",
    color: "#8A6D3B",
    family: "Divers / territoires",
    lrIndex: 55,
    anGroups: ["LIOT"],
    parpolNames: ["Régions et peuples solidaires", "Union des démocrates européens, centristes et indépendants"],
    senatGroups: ["RDSE"],
    xHandles: [],
    leaders: [],
    notes: "Groupe parlementaire hétérogène (PRG, UDI, régionalistes) — pas un parti à proprement parler.",
  },
  {
    id: "lr",
    name: "Les Républicains",
    shortName: "LR",
    color: "#0A3D91",
    family: "Droite",
    lrIndex: 70,
    website: "https://republicains.fr",
    anGroups: ["DR"],
    parpolNames: ["Les Républicains"],
    senatGroups: ["LR", "Les Républicains"],
    xHandles: ["lesRepublicains", "BrunoRetailleau", "LaurentWauquiez"],
    leaders: ["Bruno Retailleau", "Laurent Wauquiez"],
  },
  {
    id: "udr",
    name: "Union des droites pour la République",
    shortName: "UDR",
    color: "#2F2F7A",
    family: "Droite nationale",
    lrIndex: 84,
    anGroups: ["UDDPLR", "UDR"],
    parpolNames: ["UDR - Union des Droites pour la République"],
    senatGroups: [],
    xHandles: ["ECiotti"],
    leaders: ["Éric Ciotti"],
  },
  {
    id: "rn",
    name: "Rassemblement national",
    shortName: "RN",
    color: "#0D1B4C",
    family: "Extrême droite",
    lrIndex: 90,
    website: "https://rassemblementnational.fr",
    anGroups: ["RN"],
    parpolNames: ["Rassemblement national"],
    senatGroups: [],
    xHandles: ["RNational_off", "J_Bardella", "MLP_officiel"],
    leaders: ["Jordan Bardella", "Marine Le Pen"],
  },
  {
    id: "reconquete",
    name: "Reconquête",
    shortName: "REC",
    color: "#6A1B9A",
    family: "Extrême droite",
    lrIndex: 96,
    website: "https://www.parti-reconquete.fr",
    anGroups: [],
    parpolNames: ["Reconquête"],
    senatGroups: [],
    xHandles: ["Reconquete_off", "ZemmourEric", "Sarah_Knafo"],
    leaders: ["Éric Zemmour", "Sarah Knafo"],
    notes: "Aucun député : positions calculables uniquement depuis le programme et les prises de parole.",
  },
  {
    id: "dlf",
    name: "Debout la France",
    shortName: "DLF",
    color: "#1F4E79",
    family: "Droite souverainiste",
    lrIndex: 86,
    website: "https://www.debout-la-france.fr",
    anGroups: [],
    parpolNames: ["Debout la France"],
    senatGroups: [],
    xHandles: ["dupontaignan"],
    leaders: ["Nicolas Dupont-Aignan"],
  },
];

export const PARTY_BY_ID: Record<string, PartyConfig> = Object.fromEntries(PARTIES.map((p) => [p.id, p]));

/** Groupe AN (abréviation) → parti */
export function partyForAnGroup(abbrev: string | null | undefined): string | null {
  if (!abbrev) return null;
  const a = abbrev.toUpperCase();
  for (const p of PARTIES) if (p.anGroups.map((g) => g.toUpperCase()).includes(a)) return p.id;
  return null;
}

/** Libellé PARPOL (parti déclaré par le député) → parti */
export function partyForParpol(label: string | null | undefined): string | null {
  if (!label) return null;
  const l = label.trim().toLowerCase();
  for (const p of PARTIES) if (p.parpolNames.some((n) => n.toLowerCase() === l)) return p.id;
  return null;
}

/** Groupe Sénat (abréviation) → parti (approximatif) */
export function partyForSenatGroup(abbrev: string | null | undefined): string | null {
  if (!abbrev) return null;
  const a = abbrev.toUpperCase();
  for (const p of PARTIES) if (p.senatGroups.map((g) => g.toUpperCase()).includes(a)) return p.id;
  return null;
}
