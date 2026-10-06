import { eq, desc, sql, and } from "drizzle-orm";
import { getDb, getSqlite, schema } from "./db";
import { THEMES } from "./config/themes";
import { compassFromScores } from "./analysis/scores";

/** Lectures pour les pages (Server Components). */

export function allParties() {
  return getDb().select().from(schema.parties).orderBy(schema.parties.lrIndex).all();
}
export function getParty(id: string) {
  return getDb().select().from(schema.parties).where(eq(schema.parties.id, id)).get();
}

export function dataStatus() {
  const s = getSqlite();
  const one = (q: string) => (s.prepare(q).get() as { n: number }).n;
  return {
    deputes: one(`SELECT COUNT(*) n FROM politicians WHERE chamber='AN' AND active=1`),
    senateurs: one(`SELECT COUNT(*) n FROM politicians WHERE chamber='SENAT' AND active=1`),
    scrutinsAN: one(`SELECT COUNT(*) n FROM scrutins WHERE chamber='AN'`),
    scrutinsSenat: one(`SELECT COUNT(*) n FROM scrutins WHERE chamber='SENAT'`),
    votes: one(`SELECT COUNT(*) n FROM votes`),
    classified: one(`SELECT COUNT(*) n FROM scrutin_analyses`),
    documents: one(`SELECT COUNT(*) n FROM documents`),
    documentsAnalyzed: one(`SELECT COUNT(*) n FROM documents WHERE status='analyzed'`),
    posts: one(`SELECT COUNT(*) n FROM posts`),
    postsAnalyzed: one(`SELECT COUNT(*) n FROM post_analyses`),
    claims: one(`SELECT COUNT(*) n FROM claim_checks`),
    syntheses: one(`SELECT COUNT(*) n FROM party_theme_scores WHERE narrative IS NOT NULL`),
    lastScrutin: (s.prepare(`SELECT MAX(date) d FROM scrutins`).get() as { d: string | null }).d,
    costTotal: (s.prepare(`SELECT COALESCE(SUM(cost_usd),0) c FROM usage_log`).get() as { c: number }).c,
    cost30d: (s.prepare(`SELECT COALESCE(SUM(cost_usd),0) c FROM usage_log WHERE ts >= datetime('now','-30 days')`).get() as { c: number }).c,
  };
}

export interface PartyOverview {
  id: string;
  name: string;
  shortName: string;
  color: string;
  family: string;
  lrIndex: number;
  deputes: number;
  senateurs: number;
  scores: (typeof schema.partyThemeScores.$inferSelect)[];
  compass: ReturnType<typeof compassFromScores>;
  avgGap: number | null;
  verdicts: Record<string, number>;
}

export function partyOverviews(): PartyOverview[] {
  const db = getDb();
  const s = getSqlite();
  const parties = allParties();
  const scores = db.select().from(schema.partyThemeScores).all();
  const counts = s.prepare(`SELECT party_id, chamber, COUNT(*) n FROM politicians WHERE active=1 AND party_id IS NOT NULL GROUP BY party_id, chamber`).all() as { party_id: string; chamber: string; n: number }[];
  return parties.map((p) => {
    const sc = scores.filter((x) => x.partyId === p.id);
    const gaps = sc.map((x) => x.gap).filter((g): g is number => g !== null);
    const verdicts: Record<string, number> = {};
    for (const x of sc) if (x.verdict) verdicts[x.verdict] = (verdicts[x.verdict] ?? 0) + 1;
    return {
      id: p.id,
      name: p.name,
      shortName: p.shortName,
      color: p.color,
      family: p.family,
      lrIndex: p.lrIndex,
      deputes: counts.find((c) => c.party_id === p.id && c.chamber === "AN")?.n ?? 0,
      senateurs: counts.find((c) => c.party_id === p.id && c.chamber === "SENAT")?.n ?? 0,
      scores: sc,
      compass: compassFromScores(sc),
      avgGap: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
      verdicts,
    };
  });
}

export function partyDetail(id: string) {
  const db = getDb();
  const s = getSqlite();
  const party = getParty(id);
  if (!party) return null;
  const scores = db.select().from(schema.partyThemeScores).where(eq(schema.partyThemeScores.partyId, id)).all();
  const docs = db.select().from(schema.documents).where(eq(schema.documents.partyId, id)).all();
  const docAnalyses = s
    .prepare(`SELECT da.*, d.title AS doc_title, d.url AS doc_url FROM document_analyses da JOIN documents d ON d.id = da.document_id WHERE d.party_id = ?`)
    .all(id) as (typeof schema.documentAnalyses.$inferSelect & { doc_title: string; doc_url: string | null; measures: string; quotes: string })[];
  const members = db.select().from(schema.politicians).where(and(eq(schema.politicians.partyId, id), eq(schema.politicians.active, true))).orderBy(schema.politicians.lastName).all();
  const recentVotes = s
    .prepare(
      `SELECT s.uid, s.date, s.chamber, s.title, s.sort, a.summary, a.salience, a.primary_theme AS theme, gv.position, gv.pour, gv.contre, gv.abstentions
       FROM group_votes gv JOIN scrutins s ON s.uid = gv.scrutin_uid LEFT JOIN scrutin_analyses a ON a.scrutin_uid = s.uid
       WHERE gv.party_id = ? AND COALESCE(a.salience, 0) >= 4 AND gv.position IS NOT NULL ORDER BY s.date DESC LIMIT 40`,
    )
    .all(id) as { uid: string; date: string; chamber: string; title: string; sort: string | null; summary: string | null; salience: number | null; theme: string | null; position: string; pour: number; contre: number; abstentions: number }[];
  const posts = s
    .prepare(`SELECT p.*, pa.themes AS a_themes, pa.tone, pa.claims FROM posts p LEFT JOIN post_analyses pa ON pa.post_id = p.id WHERE p.party_id = ? ORDER BY p.created_at DESC LIMIT 30`)
    .all(id) as (typeof schema.posts.$inferSelect & { a_themes: string | null; tone: string | null; claims: string | null })[];
  const claims = s
    .prepare(`SELECT c.*, p.handle, p.url AS post_url, p.created_at FROM claim_checks c JOIN posts p ON p.id = c.post_id WHERE p.party_id = ? ORDER BY c.checked_at DESC LIMIT 30`)
    .all(id) as (typeof schema.claimChecks.$inferSelect & { handle: string; post_url: string | null; created_at: string; evidence: string })[];
  const summaries = s.prepare(`SELECT key, value FROM settings WHERE key LIKE 'doc-summary:%'`).all() as { key: string; value: string }[];
  return { party, scores, docs, docAnalyses, members, recentVotes, posts, claims, docSummaries: Object.fromEntries(summaries.map((r) => [r.key.split(":")[1], JSON.parse(r.value) as { period: string; summary: string }])) };
}

export function themeDetail(themeId: string) {
  const s = getSqlite();
  const rows = s
    .prepare(`SELECT p.id, p.name, p.short_name, p.color, p.lr_index, sc.* FROM parties p LEFT JOIN party_theme_scores sc ON sc.party_id = p.id AND sc.theme = ? ORDER BY p.lr_index`)
    .all(themeId) as (typeof schema.partyThemeScores.$inferSelect & { id: string; name: string; short_name: string; color: string; lr_index: number; evidence: string | null })[];
  const scrutins = s
    .prepare(
      `SELECT s.uid, s.date, s.chamber, s.title, s.sort, a.summary, a.salience, a.themes FROM scrutin_analyses a JOIN scrutins s ON s.uid = a.scrutin_uid
       WHERE a.is_procedural = 0 AND (a.primary_theme = ? OR a.themes LIKE ?) ORDER BY a.salience DESC, s.date DESC LIMIT 60`,
    )
    .all(themeId, `%"${themeId}"%`) as { uid: string; date: string; chamber: string; title: string; sort: string | null; summary: string; salience: number; themes: string }[];
  const gv = s.prepare(`SELECT party_id, position FROM group_votes WHERE scrutin_uid = ? AND party_id IS NOT NULL`);
  return {
    parties: rows,
    scrutins: scrutins.map((sc) => ({ ...sc, direction: (JSON.parse(sc.themes) as { theme: string; direction: number }[]).find((t) => t.theme === themeId)?.direction ?? 0, positions: Object.fromEntries((gv.all(sc.uid) as { party_id: string; position: string | null }[]).map((g) => [g.party_id, g.position])) })),
  };
}

export function listScrutins(opts: { q?: string; theme?: string; chamber?: string; page?: number; party?: string; position?: string; minSalience?: number }) {
  const s = getSqlite();
  const conds: string[] = ["1=1"];
  const params: unknown[] = [];
  if (opts.q) for (const w of opts.q.split(/\s+/).filter((w) => w.length > 1).slice(0, 6)) {
    conds.push("(s.title LIKE ? OR a.summary LIKE ? OR s.objet LIKE ?)");
    params.push(`%${w}%`, `%${w}%`, `%${w}%`);
  }
  if (opts.theme) {
    conds.push("(a.primary_theme = ? OR a.themes LIKE ?)");
    params.push(opts.theme, `%"${opts.theme}"%`);
  }
  if (opts.chamber) {
    conds.push("s.chamber = ?");
    params.push(opts.chamber);
  }
  if (opts.minSalience) {
    conds.push("COALESCE(a.salience,0) >= ?");
    params.push(opts.minSalience);
  }
  if (opts.party) {
    conds.push("EXISTS (SELECT 1 FROM group_votes g WHERE g.scrutin_uid = s.uid AND g.party_id = ?" + (opts.position ? " AND g.position = ?" : "") + ")");
    params.push(opts.party);
    if (opts.position) params.push(opts.position);
  }
  const page = Math.max(1, opts.page ?? 1);
  const PAGE = 40;
  const where = conds.join(" AND ");
  const total = (s.prepare(`SELECT COUNT(*) n FROM scrutins s LEFT JOIN scrutin_analyses a ON a.scrutin_uid = s.uid WHERE ${where}`).get(...params) as { n: number }).n;
  const rows = s
    .prepare(
      `SELECT s.uid, s.date, s.chamber, s.title, s.sort, s.pour, s.contre, s.abstentions, a.summary, a.salience, a.primary_theme AS theme, a.is_procedural AS procedural
       FROM scrutins s LEFT JOIN scrutin_analyses a ON a.scrutin_uid = s.uid WHERE ${where} ORDER BY s.date DESC, s.uid DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, PAGE, (page - 1) * PAGE) as { uid: string; date: string; chamber: string; title: string; sort: string | null; pour: number; contre: number; abstentions: number; summary: string | null; salience: number | null; theme: string | null; procedural: number | null }[];
  const gv = s.prepare(`SELECT party_id, group_abbrev, position FROM group_votes WHERE scrutin_uid = ?`);
  return { total, page, pageSize: PAGE, rows: rows.map((r) => ({ ...r, groups: gv.all(r.uid) as { party_id: string | null; group_abbrev: string | null; position: string | null }[] })) };
}

export function scrutinDetail(uid: string) {
  const db = getDb();
  const s = getSqlite();
  const scrutin = db.select().from(schema.scrutins).where(eq(schema.scrutins.uid, uid)).get();
  if (!scrutin) return null;
  const analysis = db.select().from(schema.scrutinAnalyses).where(eq(schema.scrutinAnalyses.scrutinUid, uid)).get();
  const groups = s
    .prepare(`SELECT gv.*, g.name AS group_name, p.name AS party_name, p.color, p.lr_index FROM group_votes gv LEFT JOIN an_groups g ON g.ref = gv.group_ref LEFT JOIN parties p ON p.id = gv.party_id WHERE gv.scrutin_uid = ? ORDER BY COALESCE(p.lr_index, 999)`)
    .all(uid) as (typeof schema.groupVotes.$inferSelect & { group_name: string | null; party_name: string | null; color: string | null; lr_index: number | null })[];
  const votes = s
    .prepare(`SELECT v.position, v.par_delegation, p.id, p.full_name, p.group_abbrev, p.party_id, p.department FROM votes v JOIN politicians p ON p.id = v.politician_id WHERE v.scrutin_uid = ? ORDER BY p.group_abbrev, p.last_name`)
    .all(uid) as { position: string; par_delegation: number; id: string; full_name: string; group_abbrev: string | null; party_id: string | null; department: string | null }[];
  return { scrutin, analysis, groups, votes };
}

export function politicianDetail(id: string) {
  const db = getDb();
  const s = getSqlite();
  const p = db.select().from(schema.politicians).where(eq(schema.politicians.id, id)).get();
  if (!p) return null;
  const party = p.partyId ? getParty(p.partyId) : null;
  const scores = db.select().from(schema.politicianThemeScores).where(eq(schema.politicianThemeScores.politicianId, id)).all();
  const partyScores = p.partyId ? db.select().from(schema.partyThemeScores).where(eq(schema.partyThemeScores.partyId, p.partyId)).all() : [];
  const votes = s
    .prepare(
      `SELECT v.position, v.par_delegation, s.uid, s.date, s.chamber, s.title, s.sort, a.summary, a.salience, a.primary_theme AS theme, gv.position AS group_position
       FROM votes v JOIN scrutins s ON s.uid = v.scrutin_uid LEFT JOIN scrutin_analyses a ON a.scrutin_uid = s.uid
       LEFT JOIN group_votes gv ON gv.scrutin_uid = s.uid AND gv.group_ref = ?
       WHERE v.politician_id = ? ORDER BY COALESCE(a.salience,0) DESC, s.date DESC LIMIT 80`,
    )
    .all(p.groupRef ?? "", id) as { position: string; par_delegation: number; uid: string; date: string; chamber: string; title: string; sort: string | null; summary: string | null; salience: number | null; theme: string | null; group_position: string | null }[];
  const stats = s
    .prepare(
      `SELECT COUNT(*) total, SUM(CASE WHEN v.position='nonVotant' THEN 1 ELSE 0 END) absents, SUM(CASE WHEN gv.position IS NOT NULL AND v.position != 'nonVotant' AND v.position != gv.position THEN 1 ELSE 0 END) dissent, SUM(CASE WHEN gv.position IS NOT NULL AND v.position != 'nonVotant' THEN 1 ELSE 0 END) compared
       FROM votes v LEFT JOIN group_votes gv ON gv.scrutin_uid = v.scrutin_uid AND gv.group_ref = ? WHERE v.politician_id = ?`,
    )
    .get(p.groupRef ?? "", id) as { total: number; absents: number; dissent: number; compared: number };
  const posts = db.select().from(schema.posts).where(eq(schema.posts.politicianId, id)).orderBy(desc(schema.posts.createdAt)).limit(20).all();
  return { politician: p, party, scores, partyScores, votes, stats, posts };
}

export function searchPoliticians(q: string, limit = 50) {
  const s = getSqlite();
  const words = q.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const conds = words.map(() => "(full_name LIKE ? OR department LIKE ?)").join(" AND ");
  const params = words.flatMap((w) => [`%${w}%`, `%${w}%`]);
  return s.prepare(`SELECT p.*, pa.color, pa.short_name FROM politicians p LEFT JOIN parties pa ON pa.id = p.party_id WHERE active=1 AND ${conds} ORDER BY chamber, last_name LIMIT ?`).all(...params, limit) as (typeof schema.politicians.$inferSelect & { color: string | null; short_name: string | null })[];
}

export function themeStats() {
  const s = getSqlite();
  const rows = s.prepare(`SELECT primary_theme theme, COUNT(*) n, SUM(CASE WHEN salience>=4 THEN 1 ELSE 0 END) major FROM scrutin_analyses WHERE is_procedural=0 AND primary_theme IS NOT NULL GROUP BY primary_theme`).all() as { theme: string; n: number; major: number }[];
  return THEMES.map((t) => ({ ...t, n: rows.find((r) => r.theme === t.id)?.n ?? 0, major: rows.find((r) => r.theme === t.id)?.major ?? 0 }));
}

export function usageByTask() {
  return getSqlite().prepare(`SELECT task, model, COUNT(*) calls, SUM(input_tokens) input, SUM(output_tokens) output, SUM(cache_read_tokens) cache, SUM(cost_usd) cost FROM usage_log GROUP BY task, model ORDER BY cost DESC`).all() as { task: string; model: string; calls: number; input: number; output: number; cache: number; cost: number }[];
}

export const sqlCount = (q: string) => (getSqlite().prepare(q).get() as { n: number }).n;
export { sql };
