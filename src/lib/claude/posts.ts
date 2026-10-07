import { sql, eq, inArray, desc } from "drizzle-orm";
import { getDb, getSqlite, nowIso, schema } from "../db";
import { themesPromptBlock, THEME_BY_ID } from "../config/themes";
import { APOLLON_PERSONA, pMap } from "./client";
import { llm, modelFor, engine } from "../llm";
import { PostBatchOutput, ClaimCheck } from "./schemas";
import { getUserByUsername, getUserTweets, getSetting, setSetting } from "../x/client";
import type { JobContext } from "../jobs";

/* ------------------------------------------------------------------ */
/* Ingestion X                                                         */
/* ------------------------------------------------------------------ */

export async function ingestX(ctx: JobContext) {
  const db = getDb();
  const parties = db.select().from(schema.parties).all();
  const politicians = db.select({ id: schema.politicians.id, xHandle: schema.politicians.xHandle, partyId: schema.politicians.partyId }).from(schema.politicians).all();
  const handleToPolitician = new Map(politicians.filter((p) => p.xHandle).map((p) => [p.xHandle!.toLowerCase().replace(/^@/, ""), p]));
  const maxReads = Number(process.env.X_MAX_READS_PER_REFRESH ?? 2000);
  let reads = 0;
  const targets: { handle: string; partyId: string | null; politicianId: string | null }[] = [];
  for (const p of parties) for (const h of p.xHandles) targets.push({ handle: h.replace(/^@/, ""), partyId: p.id, politicianId: handleToPolitician.get(h.toLowerCase().replace(/^@/, ""))?.id ?? null });
  for (const [h, pol] of handleToPolitician) if (!targets.some((t) => t.handle.toLowerCase() === h)) targets.push({ handle: h, partyId: pol.partyId, politicianId: pol.id });

  ctx.log(`${targets.length} comptes X à rafraîchir (plafond ${maxReads} lectures)`);
  ctx.setProgress(0, targets.length);
  let i = 0;
  let inserted = 0;
  for (const t of targets) {
    ctx.checkpoint();
    if (reads >= maxReads) {
      ctx.log(`Plafond de lectures atteint (${reads}) — arrêt`);
      break;
    }
    try {
      const user = await getUserByUsername(t.handle);
      const sinceId = getSetting(`x:since:${user.id}`) ?? undefined;
      const tweets = await getUserTweets(user.id, { sinceId, maxResults: Math.min(100, maxReads - reads) });
      reads += Math.max(1, tweets.length);
      if (tweets.length) {
        const newest = tweets.reduce((a, b) => (BigInt(a.id) > BigInt(b.id) ? a : b)).id;
        setSetting(`x:since:${user.id}`, newest);
        for (const tw of tweets) {
          db.insert(schema.posts)
            .values({
              id: tw.id,
              handle: user.username,
              partyId: t.partyId,
              politicianId: t.politicianId,
              text: tw.text,
              createdAt: tw.created_at,
              url: `https://x.com/${user.username}/status/${tw.id}`,
              likes: tw.public_metrics?.like_count ?? 0,
              reposts: tw.public_metrics?.retweet_count ?? 0,
              replies: tw.public_metrics?.reply_count ?? 0,
              views: tw.public_metrics?.impression_count ?? 0,
              source: "x-api",
              ingestedAt: nowIso(),
            })
            .onConflictDoNothing()
            .run();
          inserted++;
        }
      }
      ctx.log(`@${user.username} : ${tweets.length} nouveaux tweets`);
    } catch (e) {
      ctx.log(`@${t.handle} : ${(e as Error).message}`);
      if (/non configuré|401|403/.test((e as Error).message)) throw e;
    }
    ctx.setProgress(++i, targets.length, `${inserted} tweets importés — ${reads} lectures X (~${(reads * 0.005).toFixed(2)} $)`);
  }
  ctx.log(`Terminé : ${inserted} tweets, ${reads} lectures X (≈ ${(reads * 0.005).toFixed(2)} $ facturés par X)`);
}

/** Import manuel (export X, copier-coller JSON/CSV simplifié). */
export function importPosts(items: { id?: string; handle: string; text: string; createdAt: string; url?: string; partyId?: string | null; politicianId?: string | null }[]) {
  const db = getDb();
  let n = 0;
  for (const it of items) {
    const id = it.id ?? `import-${Buffer.from(`${it.handle}|${it.createdAt}|${it.text.slice(0, 40)}`).toString("base64url").slice(0, 32)}`;
    db.insert(schema.posts)
      .values({ id, handle: it.handle.replace(/^@/, ""), partyId: it.partyId ?? null, politicianId: it.politicianId ?? null, text: it.text, createdAt: it.createdAt, url: it.url ?? null, source: "import", ingestedAt: nowIso() })
      .onConflictDoNothing()
      .run();
    n++;
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* Analyse des tweets                                                  */
/* ------------------------------------------------------------------ */

const SYSTEM_POSTS = `${APOLLON_PERSONA}

Tâche : analyser des messages publiés sur X par des responsables ou partis politiques français.

TAXONOMIE DES THÈMES (axes orientés de -1 à +1) :
${themesPromptBlock()}

Pour chaque message :
- is_political : false pour les messages personnels, vœux, sport, etc.
- tone : factuel / attaque (contre un adversaire) / promesse / emotion / autopromotion / autre.
- themes : 0 à 3 thèmes avec la stance exprimée (-1 à +1) sur l'axe du thème. N'attribue une stance que si le message prend position.
- claims : jusqu'à 3 affirmations vérifiables, reformulées de façon neutre. kind="vote-revendique" quand l'auteur affirme avoir voté / s'être opposé à quelque chose ("nous avons voté contre…", "nous sommes les seuls à avoir…"). checkable=true si des votes parlementaires ou un programme pourraient confirmer ou infirmer.
Réponds uniquement avec le JSON demandé.`;

const BATCH = 30;

export async function analyzePosts(ctx: JobContext, opts?: { limit?: number }) {
  const db = getDb();
  const pending = db
    .select({ id: schema.posts.id, handle: schema.posts.handle, text: schema.posts.text, createdAt: schema.posts.createdAt, partyId: schema.posts.partyId })
    .from(schema.posts)
    .where(sql`${schema.posts.id} NOT IN (SELECT post_id FROM post_analyses)`)
    .orderBy(desc(schema.posts.createdAt))
    .limit(opts?.limit ?? 100000)
    .all();
  const model = modelFor("bulk");
  ctx.log(`${pending.length} tweets à analyser (${engine()}, ${model})`);
  if (!pending.length) return;
  const parties = new Map(db.select().from(schema.parties).all().map((p) => [p.id, p.name]));
  const batches: typeof pending[] = [];
  for (let i = 0; i < pending.length; i += BATCH) batches.push(pending.slice(i, i + BATCH));
  let done = 0;
  ctx.setProgress(0, pending.length);
  await pMap(batches, engine() === "claude-code" ? 2 : 4, async (batch) => {
    ctx.checkpoint();
    const text = batch.map((p) => `### ${p.id}\nAuteur : @${p.handle}${p.partyId ? ` (${parties.get(p.partyId)})` : ""} — ${p.createdAt.slice(0, 10)}\n${p.text}`).join("\n\n");
    const res = await llm({ task: "analyze-posts", system: SYSTEM_POSTS, prompt: `Analyse ces ${batch.length} messages. Réponds pour chaque id.\n\n${text}`, schema: PostBatchOutput, model: "bulk", effort: "medium", ctx });
    if (!res.output) {
      ctx.log(`Lot ignoré : ${res.error ?? "sortie vide"}`);
      return;
    }
    const wanted = new Set(batch.map((b) => b.id));
    const rows = res.output.results
      .filter((r) => wanted.has(r.id))
      .map((r) => ({
        postId: r.id,
        themes: r.themes.map((t) => ({ theme: t.theme, stance: t.stance })),
        claims: r.claims.map((c) => ({ claim: c.claim, theme: c.theme, kind: c.kind, checkable: c.checkable })),
        tone: r.tone,
        isPolitical: r.is_political,
        model,
        analyzedAt: nowIso(),
      }));
    if (rows.length) {
      db.delete(schema.postAnalyses).where(inArray(schema.postAnalyses.postId, rows.map((r) => r.postId))).run();
      db.insert(schema.postAnalyses).values(rows).run();
    }
    done += batch.length;
    ctx.setProgress(done, pending.length, `Tweets analysés : ${done}/${pending.length} — ${ctx.costUsd().toFixed(2)} $ équiv.`);
  });
}

/* ------------------------------------------------------------------ */
/* Vérification des affirmations contre les votes                      */
/* ------------------------------------------------------------------ */

const SYSTEM_CLAIMS = `${APOLLON_PERSONA}

Tâche : vérifier une affirmation politique à partir des votes parlementaires fournis. Sois strict : "confirme" seulement si les votes le montrent clairement, "inverifiable" si les preuves fournies ne permettent pas de conclure. Réponds uniquement avec le JSON demandé.`;

export async function checkClaims(ctx: JobContext, opts?: { limit?: number }) {
  const db = getDb();
  const sqlite = getSqlite();
  type Row = { postId: string; claims: string; partyId: string | null; handle: string; createdAt: string; text: string };
  const rows = sqlite
    .prepare(
      `SELECT pa.post_id AS postId, pa.claims, p.party_id AS partyId, p.handle, p.created_at AS createdAt, p.text
       FROM post_analyses pa JOIN posts p ON p.id = pa.post_id
       WHERE pa.claims != '[]' AND pa.post_id NOT IN (SELECT post_id FROM claim_checks)
       ORDER BY p.created_at DESC LIMIT ?`,
    )
    .all(opts?.limit ?? 200) as Row[];
  const tasks: { row: Row; claim: { claim: string; theme: string | null; kind: string; checkable: boolean } }[] = [];
  for (const r of rows) for (const c of JSON.parse(r.claims) as { claim: string; theme: string | null; kind: string; checkable: boolean }[]) if (c.checkable && c.theme && (c.kind === "vote-revendique" || c.kind === "fait" || c.kind === "promesse")) tasks.push({ row: r, claim: c });
  ctx.log(`${tasks.length} affirmations vérifiables à confronter aux votes`);
  if (!tasks.length) return;
  const parties = new Map(db.select().from(schema.parties).all().map((p) => [p.id, p]));
  const model = modelFor("main");
  let done = 0;
  ctx.setProgress(0, tasks.length);
  await pMap(tasks, engine() === "claude-code" ? 2 : 3, async ({ row, claim }) => {
    ctx.checkpoint();
    const party = row.partyId ? parties.get(row.partyId) : null;
    const theme = THEME_BY_ID[claim.theme!];
    const evidence = sqlite
      .prepare(
        `SELECT s.uid, s.date, s.title, s.chamber, a.summary, a.salience, a.themes, gv.position, gv.pour, gv.contre, gv.abstentions
         FROM scrutin_analyses a JOIN scrutins s ON s.uid = a.scrutin_uid
         LEFT JOIN group_votes gv ON gv.scrutin_uid = s.uid AND gv.party_id = ?
         WHERE a.is_procedural = 0 AND (a.primary_theme = ? OR a.themes LIKE ?)
         ORDER BY a.salience DESC, s.date DESC LIMIT 25`,
      )
      .all(row.partyId ?? "", claim.theme, `%"${claim.theme}"%`) as { uid: string; date: string; title: string; chamber: string; summary: string; salience: number; position: string | null; pour: number; contre: number; abstentions: number }[];
    const score = row.partyId ? db.select().from(schema.partyThemeScores).where(sql`${schema.partyThemeScores.partyId} = ${row.partyId} AND ${schema.partyThemeScores.theme} = ${claim.theme}`).get() : null;
    const context = evidence
      .map((e) => `- [${e.uid}] ${e.date} ${e.chamber} — ${e.summary} (importance ${e.salience}) — position du groupe ${party?.shortName ?? "?"} : ${e.position ?? "absent"} (${e.pour} pour / ${e.contre} contre / ${e.abstentions} abst.)`)
      .join("\n");
    const prompt = `Affirmation publiée sur X par @${row.handle}${party ? ` (${party.name})` : ""} le ${row.createdAt.slice(0, 10)} :
« ${claim.claim} »
Message original : « ${row.text} »

Thème : ${theme.label} (axe -1 = ${theme.poleLeft} ; +1 = ${theme.poleRight}).
${score?.votedStance != null ? `Position VOTÉE du parti sur ce thème (calculée sur ${score.votedN} votes de groupe) : ${score.votedStance.toFixed(2)}.` : ""}
${score?.declaredStance != null ? `Position DÉCLARÉE (programme) : ${score.declaredStance.toFixed(2)}.` : ""}

Scrutins pertinents et positions du groupe :
${context || "(aucun scrutin trouvé sur ce thème)"}

Confronte l'affirmation aux votes. Verdict : confirme / nuance / contredit / inverifiable. Cite les scrutins (uid) utilisés.`;
    const res = await llm({ task: "check-claims", system: SYSTEM_CLAIMS, prompt, schema: ClaimCheck, model: "main", effort: "medium", ctx });
    const out = res.output;
    if (out) {
      const evMap = new Map(evidence.map((e) => [e.uid, e]));
      db.insert(schema.claimChecks)
        .values({
          postId: row.postId,
          claim: claim.claim,
          theme: claim.theme,
          verdict: out.verdict,
          explanation: out.explanation,
          evidence: out.evidence
            .filter((e) => evMap.has(e.scrutinUid))
            .map((e) => {
              const s = evMap.get(e.scrutinUid)!;
              return { scrutinUid: s.uid, title: s.title, date: s.date, position: s.position ?? "absent", direction: 0, salience: s.salience, note: e.note };
            }),
          model,
          checkedAt: nowIso(),
        })
        .run();
    }
    done++;
    ctx.setProgress(done, tasks.length, `Affirmations vérifiées : ${done}/${tasks.length} — ${ctx.costUsd().toFixed(2)} $ équiv.`);
  });
}

export function postsForParty(partyId: string, limit = 50) {
  return getDb().select().from(schema.posts).where(eq(schema.posts.partyId, partyId)).orderBy(desc(schema.posts.createdAt)).limit(limit).all();
}
