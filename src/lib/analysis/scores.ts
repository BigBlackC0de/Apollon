import { eq } from "drizzle-orm";
import { getDb, getSqlite, nowIso, schema } from "../db";
import { THEMES } from "../config/themes";
import type { EvidenceItem } from "../db/schema";

/**
 * Calcule les positions "votées" par parti et par thème à partir des votes
 * de groupe (position majoritaire) et de la classification des scrutins.
 *
 *   stance(parti, thème) = Σ pos × direction × weight × salience / Σ weight × salience
 *   pos ∈ { pour: +1, contre: -1, abstention: 0 }
 *
 * Également : positions "déclarées" (programmes), "tweets", écart, et scores
 * individuels des parlementaires (avec taux de dissidence vs. leur groupe).
 */

const POS: Record<string, number> = { pour: 1, contre: -1, abstention: 0 };

interface Acc {
  num: number;
  den: number;
  n: number;
  evidence: EvidenceItem[];
}
const newAcc = (): Acc => ({ num: 0, den: 0, n: 0, evidence: [] });

export function computePartyScores(log?: (m: string) => void) {
  const db = getDb();
  const sqlite = getSqlite();
  const now = nowIso();

  type Row = {
    partyId: string;
    chamber: string;
    position: string | null;
    uid: string;
    title: string;
    date: string;
    themes: string;
    salience: number;
  };
  const rows = sqlite
    .prepare(
      `SELECT gv.party_id AS partyId, s.chamber, gv.position, s.uid, s.title, s.date, a.themes, a.salience
       FROM group_votes gv
       JOIN scrutins s ON s.uid = gv.scrutin_uid
       JOIN scrutin_analyses a ON a.scrutin_uid = gv.scrutin_uid
       WHERE gv.party_id IS NOT NULL AND a.is_procedural = 0 AND gv.position IS NOT NULL`,
    )
    .all() as Row[];

  const an = new Map<string, Acc>();
  const senat = new Map<string, Acc>();
  for (const r of rows) {
    const pos = POS[r.position ?? ""];
    if (pos === undefined) continue;
    const themes = JSON.parse(r.themes) as { theme: string; direction: number; weight: number }[];
    for (const t of themes) {
      if (!t.direction) continue;
      const key = `${r.partyId}|${t.theme}`;
      const map = r.chamber === "SENAT" ? senat : an;
      const acc = map.get(key) ?? newAcc();
      const w = t.weight * r.salience;
      acc.num += pos * t.direction * w;
      acc.den += w;
      acc.n += 1;
      if (pos !== 0 && r.salience >= 3 && acc.evidence.length < 40) {
        acc.evidence.push({ scrutinUid: r.uid, title: r.title, date: r.date, position: r.position!, direction: t.direction, salience: r.salience });
      }
      map.set(key, acc);
    }
  }

  // Positions déclarées : moyenne pondérée par confiance des analyses de programmes
  const declared = new Map<string, { num: number; den: number }>();
  const docRows = sqlite
    .prepare(
      `SELECT d.party_id AS partyId, da.theme, da.stance, da.confidence FROM document_analyses da JOIN documents d ON d.id = da.document_id WHERE da.stance IS NOT NULL`,
    )
    .all() as { partyId: string; theme: string; stance: number; confidence: number }[];
  for (const r of docRows) {
    const key = `${r.partyId}|${r.theme}`;
    const d = declared.get(key) ?? { num: 0, den: 0 };
    d.num += r.stance * r.confidence;
    d.den += r.confidence;
    declared.set(key, d);
  }

  // Positions "tweets"
  const postsAgg = new Map<string, { sum: number; n: number }>();
  const postRows = sqlite
    .prepare(`SELECT p.party_id AS partyId, pa.themes FROM post_analyses pa JOIN posts p ON p.id = pa.post_id WHERE p.party_id IS NOT NULL AND pa.is_political = 1`)
    .all() as { partyId: string; themes: string }[];
  for (const r of postRows) {
    for (const t of JSON.parse(r.themes) as { theme: string; stance: number }[]) {
      const key = `${r.partyId}|${t.theme}`;
      const a = postsAgg.get(key) ?? { sum: 0, n: 0 };
      a.sum += t.stance;
      a.n++;
      postsAgg.set(key, a);
    }
  }

  const parties = db.select({ id: schema.parties.id }).from(schema.parties).all();
  const upsert = sqlite.prepare(
    `INSERT INTO party_theme_scores (party_id, theme, declared_stance, declared_confidence, voted_stance, voted_n, voted_weight, senat_stance, senat_n, posts_stance, posts_n, gap, evidence, updated_at)
     VALUES (@partyId,@theme,@declared,@declaredConf,@voted,@votedN,@votedW,@senat,@senatN,@posts,@postsN,@gap,@evidence,@now)
     ON CONFLICT(party_id, theme) DO UPDATE SET declared_stance=excluded.declared_stance, declared_confidence=excluded.declared_confidence, voted_stance=excluded.voted_stance, voted_n=excluded.voted_n, voted_weight=excluded.voted_weight, senat_stance=excluded.senat_stance, senat_n=excluded.senat_n, posts_stance=excluded.posts_stance, posts_n=excluded.posts_n, gap=excluded.gap, evidence=excluded.evidence, updated_at=excluded.updated_at`,
  );
  let n = 0;
  sqlite.transaction(() => {
    for (const p of parties) {
      for (const t of THEMES) {
        const key = `${p.id}|${t.id}`;
        const a = an.get(key);
        const s = senat.get(key);
        const d = declared.get(key);
        const po = postsAgg.get(key);
        const voted = a && a.den > 0 ? a.num / a.den : null;
        const senatStance = s && s.den > 0 ? s.num / s.den : null;
        const decl = d && d.den > 0 ? d.num / d.den : null;
        const declConf = d && d.den > 0 ? Math.min(1, d.den) : null;
        const postsStance = po && po.n > 0 ? po.sum / po.n : null;
        const gap = voted !== null && decl !== null ? Math.abs(voted - decl) : null;
        const evidence = (a?.evidence ?? []).sort((x, y) => y.salience - x.salience || y.date.localeCompare(x.date)).slice(0, 25);
        upsert.run({
          partyId: p.id,
          theme: t.id,
          declared: decl,
          declaredConf: declConf,
          voted,
          votedN: a?.n ?? 0,
          votedW: a?.den ?? 0,
          senat: senatStance,
          senatN: s?.n ?? 0,
          posts: postsStance,
          postsN: po?.n ?? 0,
          gap,
          evidence: JSON.stringify(evidence),
          now,
        });
        n++;
      }
    }
  })();
  log?.(`Scores parti × thème recalculés (${n} cellules)`);
}

export function computePoliticianScores(log?: (m: string) => void) {
  const sqlite = getSqlite();
  const now = nowIso();
  type Row = { politicianId: string; position: string; groupPos: string | null; themes: string; salience: number };
  const rows = sqlite
    .prepare(
      `SELECT v.politician_id AS politicianId, v.position, gv.position AS groupPos, a.themes, a.salience
       FROM votes v
       JOIN scrutin_analyses a ON a.scrutin_uid = v.scrutin_uid
       JOIN politicians p ON p.id = v.politician_id
       LEFT JOIN group_votes gv ON gv.scrutin_uid = v.scrutin_uid AND gv.group_ref = p.group_ref
       WHERE a.is_procedural = 0 AND v.position != 'nonVotant'`,
    )
    .all() as Row[];
  const acc = new Map<string, { num: number; den: number; n: number; dissent: number; compared: number }>();
  for (const r of rows) {
    const pos = POS[r.position];
    if (pos === undefined) continue;
    const themes = JSON.parse(r.themes) as { theme: string; direction: number; weight: number }[];
    for (const t of themes) {
      if (!t.direction) continue;
      const key = `${r.politicianId}|${t.theme}`;
      const a = acc.get(key) ?? { num: 0, den: 0, n: 0, dissent: 0, compared: 0 };
      const w = t.weight * r.salience;
      a.num += pos * t.direction * w;
      a.den += w;
      a.n++;
      if (r.groupPos && r.groupPos !== "abstention") {
        a.compared++;
        if (r.position !== r.groupPos) a.dissent++;
      }
      acc.set(key, a);
    }
  }
  const postsAgg = new Map<string, { sum: number; n: number }>();
  const postRows = sqlite
    .prepare(`SELECT p.politician_id AS politicianId, pa.themes FROM post_analyses pa JOIN posts p ON p.id = pa.post_id WHERE p.politician_id IS NOT NULL AND pa.is_political = 1`)
    .all() as { politicianId: string; themes: string }[];
  for (const r of postRows) {
    for (const t of JSON.parse(r.themes) as { theme: string; stance: number }[]) {
      const key = `${r.politicianId}|${t.theme}`;
      const a = postsAgg.get(key) ?? { sum: 0, n: 0 };
      a.sum += t.stance;
      a.n++;
      postsAgg.set(key, a);
    }
  }
  const upsert = sqlite.prepare(
    `INSERT OR REPLACE INTO politician_theme_scores (politician_id, theme, voted_stance, voted_n, posts_stance, posts_n, dissent_rate, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
  );
  const keys = new Set([...acc.keys(), ...postsAgg.keys()]);
  sqlite.transaction(() => {
    for (const key of keys) {
      const [pid, theme] = key.split("|");
      const a = acc.get(key);
      const po = postsAgg.get(key);
      upsert.run(
        pid,
        theme,
        a && a.den > 0 ? a.num / a.den : null,
        a?.n ?? 0,
        po ? po.sum / po.n : null,
        po?.n ?? 0,
        a && a.compared > 0 ? a.dissent / a.compared : null,
        now,
      );
    }
  })();
  log?.(`Scores individuels recalculés (${keys.size} cellules)`);
}

export function computeAllScores(log?: (m: string) => void) {
  computePartyScores(log);
  computePoliticianScores(log);
}

/** Petit utilitaire : moyenne des stances d'un groupe de thèmes (boussole). */
export function compassFromScores(scores: { theme: string; declaredStance: number | null; votedStance: number | null }[]) {
  const groups = { eco: THEMES.filter((t) => t.group === "eco").map((t) => t.id), societal: THEMES.filter((t) => t.group === "societal").map((t) => t.id) };
  const mean = (ids: string[], pick: (s: (typeof scores)[number]) => number | null) => {
    const vals = scores.filter((s) => ids.includes(s.theme)).map(pick).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  return {
    declared: { x: mean(groups.eco, (s) => s.declaredStance), y: mean(groups.societal, (s) => s.declaredStance) },
    voted: { x: mean(groups.eco, (s) => s.votedStance), y: mean(groups.societal, (s) => s.votedStance) },
  };
}

export function partyScoreRows(partyId: string) {
  return getDb().select().from(schema.partyThemeScores).where(eq(schema.partyThemeScores.partyId, partyId)).all();
}
