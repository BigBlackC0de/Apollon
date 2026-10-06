import { sqliteTable, text, integer, real, index, primaryKey } from "drizzle-orm/sqlite-core";

/* ------------------------------------------------------------------ */
/* Référentiels                                                        */
/* ------------------------------------------------------------------ */

export const parties = sqliteTable("parties", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  color: text("color").notNull(),
  family: text("family").notNull(),
  lrIndex: integer("lr_index").notNull(),
  website: text("website"),
  anGroups: text("an_groups", { mode: "json" }).$type<string[]>().notNull(),
  parpolNames: text("parpol_names", { mode: "json" }).$type<string[]>().notNull(),
  senatGroups: text("senat_groups", { mode: "json" }).$type<string[]>().notNull(),
  xHandles: text("x_handles", { mode: "json" }).$type<string[]>().notNull(),
  leaders: text("leaders", { mode: "json" }).$type<string[]>().notNull(),
  notes: text("notes"),
});

export const anGroups = sqliteTable("an_groups", {
  ref: text("ref").primaryKey(), // ex. PO845401
  name: text("name").notNull(),
  abbrev: text("abbrev").notNull(),
  legislature: text("legislature").notNull(),
  dateStart: text("date_start"),
  dateEnd: text("date_end"),
  partyId: text("party_id"),
});

export const politicians = sqliteTable(
  "politicians",
  {
    id: text("id").primaryKey(), // AN: PAxxxx — Sénat: slug NosParlementaires
    chamber: text("chamber").notNull(), // 'AN' | 'SENAT'
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    fullName: text("full_name").notNull(),
    partyId: text("party_id"),
    groupRef: text("group_ref"),
    groupAbbrev: text("group_abbrev"),
    groupName: text("group_name"),
    parpol: text("parpol"),
    department: text("department"),
    circo: text("circo"),
    xHandle: text("x_handle"),
    role: text("role"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    hatvpUrl: text("hatvp_url"),
    rawJson: text("raw_json"),
  },
  (t) => [index("politicians_party_idx").on(t.partyId), index("politicians_chamber_idx").on(t.chamber)],
);

/* ------------------------------------------------------------------ */
/* Scrutins et votes                                                   */
/* ------------------------------------------------------------------ */

export const scrutins = sqliteTable(
  "scrutins",
  {
    uid: text("uid").primaryKey(), // AN: VTANR5L17Vxxxx — Sénat: SEN-2025-99
    chamber: text("chamber").notNull(),
    number: text("number").notNull(),
    legislature: text("legislature"),
    date: text("date").notNull(), // YYYY-MM-DD
    title: text("title").notNull(),
    objet: text("objet"),
    demandeur: text("demandeur"),
    typeVote: text("type_vote"),
    sort: text("sort"), // adopté / rejeté
    votants: integer("votants"),
    exprimes: integer("exprimes"),
    pour: integer("pour"),
    contre: integer("contre"),
    abstentions: integer("abstentions"),
    url: text("url"),
    dossierRef: text("dossier_ref"),
    ingestedAt: text("ingested_at").notNull(),
  },
  (t) => [index("scrutins_date_idx").on(t.date), index("scrutins_chamber_idx").on(t.chamber)],
);

export const groupVotes = sqliteTable(
  "group_votes",
  {
    scrutinUid: text("scrutin_uid").notNull(),
    groupRef: text("group_ref").notNull(),
    groupAbbrev: text("group_abbrev"),
    partyId: text("party_id"),
    position: text("position"), // pour | contre | abstention | null
    pour: integer("pour").notNull().default(0),
    contre: integer("contre").notNull().default(0),
    abstentions: integer("abstentions").notNull().default(0),
    nonVotants: integer("non_votants").notNull().default(0),
    members: integer("members"),
  },
  (t) => [
    primaryKey({ columns: [t.scrutinUid, t.groupRef] }),
    index("group_votes_party_idx").on(t.partyId),
  ],
);

export const votes = sqliteTable(
  "votes",
  {
    scrutinUid: text("scrutin_uid").notNull(),
    politicianId: text("politician_id").notNull(),
    position: text("position").notNull(), // pour | contre | abstention | nonVotant
    parDelegation: integer("par_delegation", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.scrutinUid, t.politicianId] }),
    index("votes_politician_idx").on(t.politicianId),
  ],
);

export const scrutinAnalyses = sqliteTable(
  "scrutin_analyses",
  {
    scrutinUid: text("scrutin_uid").primaryKey(),
    primaryTheme: text("primary_theme"),
    /** [{ theme, direction: -1|0|1, weight: 0..1 }] — direction = sens d'un vote POUR sur l'axe du thème */
    themes: text("themes", { mode: "json" }).$type<ThemeDirection[]>().notNull(),
    summary: text("summary").notNull(),
    stakes: text("stakes"),
    isProcedural: integer("is_procedural", { mode: "boolean" }).notNull().default(false),
    salience: integer("salience").notNull().default(1), // 1..5
    model: text("model").notNull(),
    analyzedAt: text("analyzed_at").notNull(),
  },
  (t) => [index("scrutin_analyses_theme_idx").on(t.primaryTheme)],
);

export interface ThemeDirection {
  theme: string;
  direction: -1 | 0 | 1;
  weight: number;
}

/* ------------------------------------------------------------------ */
/* Programmes et documents                                             */
/* ------------------------------------------------------------------ */

export const documents = sqliteTable(
  "documents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    partyId: text("party_id").notNull(),
    kind: text("kind").notNull(), // programme | manifeste | communique | manual
    title: text("title").notNull(),
    url: text("url"),
    mime: text("mime"),
    text: text("text"),
    pdfBase64: text("pdf_base64"),
    sha: text("sha"),
    discoveredBy: text("discovered_by"), // 'claude-web-search' | 'manual'
    fetchedAt: text("fetched_at"),
    status: text("status").notNull().default("pending"), // pending | fetched | analyzed | error
    error: text("error"),
  },
  (t) => [index("documents_party_idx").on(t.partyId)],
);

export const documentAnalyses = sqliteTable(
  "document_analyses",
  {
    documentId: integer("document_id").notNull(),
    theme: text("theme").notNull(),
    stance: real("stance"), // -1..1, null si non abordé
    confidence: real("confidence").notNull().default(0),
    summary: text("summary").notNull(),
    measures: text("measures", { mode: "json" }).$type<string[]>().notNull(),
    quotes: text("quotes", { mode: "json" }).$type<string[]>().notNull(),
    model: text("model").notNull(),
    analyzedAt: text("analyzed_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.theme] })],
);

/* ------------------------------------------------------------------ */
/* Réseaux sociaux (X)                                                 */
/* ------------------------------------------------------------------ */

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(), // tweet id
    handle: text("handle").notNull(),
    partyId: text("party_id"),
    politicianId: text("politician_id"),
    text: text("text").notNull(),
    createdAt: text("created_at").notNull(),
    url: text("url"),
    likes: integer("likes").default(0),
    reposts: integer("reposts").default(0),
    replies: integer("replies").default(0),
    views: integer("views").default(0),
    source: text("source").notNull().default("x-api"), // x-api | import
    ingestedAt: text("ingested_at").notNull(),
  },
  (t) => [index("posts_party_idx").on(t.partyId), index("posts_handle_idx").on(t.handle), index("posts_date_idx").on(t.createdAt)],
);

export const postAnalyses = sqliteTable("post_analyses", {
  postId: text("post_id").primaryKey(),
  /** [{ theme, stance }] */
  themes: text("themes", { mode: "json" }).$type<{ theme: string; stance: number }[]>().notNull(),
  /** Affirmations vérifiables extraites */
  claims: text("claims", { mode: "json" }).$type<PostClaim[]>().notNull(),
  tone: text("tone"), // factuel | attaque | promesse | émotion | autopromotion
  isPolitical: integer("is_political", { mode: "boolean" }).notNull().default(true),
  model: text("model").notNull(),
  analyzedAt: text("analyzed_at").notNull(),
});

export interface PostClaim {
  claim: string;
  theme: string | null;
  kind: "fait" | "promesse" | "vote-revendique" | "attaque" | "autre";
  checkable: boolean;
}

/* ------------------------------------------------------------------ */
/* Scores calculés et synthèses                                        */
/* ------------------------------------------------------------------ */

export const partyThemeScores = sqliteTable(
  "party_theme_scores",
  {
    partyId: text("party_id").notNull(),
    theme: text("theme").notNull(),
    declaredStance: real("declared_stance"),
    declaredConfidence: real("declared_confidence"),
    votedStance: real("voted_stance"),
    votedN: integer("voted_n").notNull().default(0),
    votedWeight: real("voted_weight").notNull().default(0),
    senatStance: real("senat_stance"),
    senatN: integer("senat_n").notNull().default(0),
    postsStance: real("posts_stance"),
    postsN: integer("posts_n").notNull().default(0),
    gap: real("gap"), // |declared - voted|
    narrative: text("narrative"),
    /** [{ scrutinUid, title, date, position, direction, salience }] */
    evidence: text("evidence", { mode: "json" }).$type<EvidenceItem[]>(),
    verdict: text("verdict"), // coherent | nuance | ecart | contradiction | insuffisant
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.partyId, t.theme] })],
);

export interface EvidenceItem {
  scrutinUid: string;
  title: string;
  date: string;
  position: string;
  direction: number;
  salience: number;
  note?: string;
}

export const politicianThemeScores = sqliteTable(
  "politician_theme_scores",
  {
    politicianId: text("politician_id").notNull(),
    theme: text("theme").notNull(),
    votedStance: real("voted_stance"),
    votedN: integer("voted_n").notNull().default(0),
    postsStance: real("posts_stance"),
    postsN: integer("posts_n").notNull().default(0),
    /** écart avec la ligne du groupe : part des votes divergents */
    dissentRate: real("dissent_rate"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.politicianId, t.theme] })],
);

export const claimChecks = sqliteTable("claim_checks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postId: text("post_id").notNull(),
  claim: text("claim").notNull(),
  theme: text("theme"),
  verdict: text("verdict").notNull(), // confirme | nuance | contredit | invérifiable
  explanation: text("explanation").notNull(),
  evidence: text("evidence", { mode: "json" }).$type<EvidenceItem[]>().notNull(),
  model: text("model").notNull(),
  checkedAt: text("checked_at").notNull(),
});

/* ------------------------------------------------------------------ */
/* Exploitation                                                        */
/* ------------------------------------------------------------------ */

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  status: text("status").notNull(), // queued | running | done | error | cancelled
  progress: integer("progress").notNull().default(0),
  total: integer("total").notNull().default(0),
  message: text("message"),
  log: text("log").notNull().default(""),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const usageLog = sqliteTable("usage_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ts: text("ts").notNull(),
  jobId: text("job_id"),
  task: text("task").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull(),
  costUsd: real("cost_usd").notNull(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: text("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
});
