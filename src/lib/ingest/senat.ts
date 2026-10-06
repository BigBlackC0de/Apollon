import { gunzipSync } from "node:zlib";
import { getDb, getSqlite, nowIso, schema } from "../db";
import { partyForSenatGroup } from "../config/parties";
import { fetchCached } from "./fetch-cache";
import type { JobContext } from "../jobs";

/**
 * Ingestion Sénat via NosParlementaires (Licence Ouverte 2.0), qui normalise
 * l'open data officiel data.senat.fr (fourni en dump PostgreSQL, peu pratique).
 *  - senateurs.json        : sénateurs (actifs + historiques) et groupe
 *  - scrutins_senat.json   : scrutins publics depuis 2006/2017
 *  - votes_senat.json.gz   : positions individuelles
 */
export const SENAT_URLS = {
  senateurs: "https://nosparlementaires.fr/opendata/senateurs.json",
  scrutins: "https://nosparlementaires.fr/opendata/scrutins_senat.json",
  votes: "https://nosparlementaires.fr/opendata/votes_senat.json.gz",
};

/** On ne garde que les scrutins à partir de cette date (cohérence avec la XVIIe législature AN). */
export const SENAT_MIN_DATE = process.env.APOLLON_SENAT_MIN_DATE ?? "2024-07-01";

type AnyRec = Record<string, unknown>;
const str = (x: unknown): string | null => (x == null ? null : String(x));
const num = (x: unknown): number => (Number.isFinite(Number(x)) ? Number(x) : 0);
const asList = (j: unknown): AnyRec[] => (Array.isArray(j) ? j : ((j as AnyRec)?.data as AnyRec[]) ?? []);

export async function ingestSenat(ctx: JobContext) {
  const db = getDb();
  const sqlite = getSqlite();
  ctx.log("Sénat — sénateurs (NosParlementaires / data.senat.fr)");
  const sen = asList(JSON.parse((await fetchCached(SENAT_URLS.senateurs, { log: ctx.log })).toString("utf8")));
  let nSen = 0;
  const upsertSen = sqlite.prepare(
    `INSERT INTO politicians (id, chamber, first_name, last_name, full_name, party_id, group_ref, group_abbrev, group_name, department, active)
     VALUES (@id,'SENAT',@firstName,@lastName,@fullName,@partyId,@groupRef,@groupAbbrev,@groupName,@department,@active)
     ON CONFLICT(id) DO UPDATE SET first_name=excluded.first_name, last_name=excluded.last_name, full_name=excluded.full_name, party_id=excluded.party_id, group_abbrev=excluded.group_abbrev, group_name=excluded.group_name, department=excluded.department, active=excluded.active`,
  );
  sqlite.transaction(() => {
    for (const s of sen) {
      const rawAbbrev = str(s.group_short);
      const abbrev = rawAbbrev && rawAbbrev !== "Aucun" ? rawAbbrev : null;
      upsertSen.run({
        id: `SEN-${s.slug}`,
        firstName: str(s.first_name) ?? "",
        lastName: str(s.last_name) ?? "",
        fullName: str(s.full_name) ?? `${s.first_name} ${s.last_name}`,
        partyId: partyForSenatGroup(abbrev),
        groupRef: abbrev ? `SENAT-${abbrev}` : null,
        groupAbbrev: abbrev,
        groupName: abbrev ? str(s.group_label) : null,
        department: str(s.department_label),
        active: s.active ? 1 : 0,
      });
      nSen++;
    }
  })();
  ctx.log(`${nSen} sénateurs importés (${sen.filter((s) => s.active).length} actifs)`);

  ctx.log("Sénat — scrutins publics");
  const scr = asList(JSON.parse((await fetchCached(SENAT_URLS.scrutins, { log: ctx.log })).toString("utf8")));
  const kept = scr.filter((s) => (str(s.date) ?? "") >= SENAT_MIN_DATE);
  const keptIds = new Set(kept.map((s) => String(s.id)));
  const insScr = sqlite.prepare(
    `INSERT INTO scrutins (uid, chamber, number, legislature, date, title, objet, votants, exprimes, pour, contre, abstentions, url, dossier_ref, ingested_at)
     VALUES (@uid,'SENAT',@number,NULL,@date,@title,NULL,@votants,@exprimes,@pour,@contre,@abstentions,@url,@dossierRef,@ingestedAt)
     ON CONFLICT(uid) DO UPDATE SET title=excluded.title, votants=excluded.votants, pour=excluded.pour, contre=excluded.contre`,
  );
  sqlite.transaction(() => {
    for (const s of kept) {
      const votants = num(s.votants);
      const exprimes = num(s.suffrages_exprimes);
      insScr.run({
        uid: `SEN-${s.id}`,
        number: String(s.id),
        date: (str(s.date) ?? "").slice(0, 10),
        title: `Scrutin ${s.id} ${str(s.title) ?? ""}`.trim(),
        votants,
        exprimes,
        pour: num(s.pour),
        contre: num(s.contre),
        abstentions: Math.max(0, votants - exprimes),
        url: str(s.url),
        dossierRef: str(s.dossier_ref),
        ingestedAt: nowIso(),
      });
    }
  })();
  ctx.log(`${kept.length} scrutins Sénat depuis ${SENAT_MIN_DATE} (sur ${scr.length})`);

  ctx.log("Sénat — votes individuels");
  const gz = await fetchCached(SENAT_URLS.votes, { log: ctx.log });
  const votes = asList(JSON.parse((gz[0] === 0x1f && gz[1] === 0x8b ? gunzipSync(gz) : gz).toString("utf8")));
  const posMap: Record<string, string> = { POUR: "pour", CONTRE: "contre", ABSTENTION: "abstention", NONVOTANT: "nonVotant" };
  const insVote = sqlite.prepare(`INSERT OR REPLACE INTO votes (scrutin_uid, politician_id, position, par_delegation) VALUES (?,?,?,0)`);
  let nv = 0;
  const senatorGroup = new Map(
    db
      .select({ id: schema.politicians.id, groupRef: schema.politicians.groupRef, partyId: schema.politicians.partyId, abbrev: schema.politicians.groupAbbrev })
      .from(schema.politicians)
      .all()
      .filter((p) => p.id.startsWith("SEN-"))
      .map((p) => [p.id, p]),
  );
  // Agrégats par groupe (reconstruits, le Sénat ne publie pas de "position majoritaire")
  const agg = new Map<string, { pour: number; contre: number; abstentions: number; nonVotants: number; abbrev: string | null; partyId: string | null }>();
  sqlite.transaction(() => {
    for (const v of votes) {
      const sid = String(v.scrutin_id);
      if (!keptIds.has(sid)) continue;
      const pid = `SEN-${v.senator_slug}`;
      const pos = posMap[String(v.position)] ?? "nonVotant";
      insVote.run(`SEN-${sid}`, pid, pos);
      nv++;
      const meta = senatorGroup.get(pid);
      if (meta?.groupRef) {
        const key = `SEN-${sid}|${meta.groupRef}`;
        const a = agg.get(key) ?? { pour: 0, contre: 0, abstentions: 0, nonVotants: 0, abbrev: meta.abbrev, partyId: meta.partyId };
        if (pos === "pour") a.pour++;
        else if (pos === "contre") a.contre++;
        else if (pos === "abstention") a.abstentions++;
        else a.nonVotants++;
        agg.set(key, a);
      }
    }
  })();
  const insGV = sqlite.prepare(
    `INSERT OR REPLACE INTO group_votes (scrutin_uid, group_ref, group_abbrev, party_id, position, pour, contre, abstentions, non_votants, members)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  sqlite.transaction(() => {
    for (const [key, a] of agg) {
      const [scrutinUid, groupRef] = key.split("|");
      const expressed = a.pour + a.contre + a.abstentions;
      let position: string | null = null;
      if (expressed > 0) {
        const max = Math.max(a.pour, a.contre, a.abstentions);
        position = max === a.pour ? "pour" : max === a.contre ? "contre" : "abstention";
      }
      insGV.run(scrutinUid, groupRef, a.abbrev, a.partyId, position, a.pour, a.contre, a.abstentions, a.nonVotants, expressed + a.nonVotants);
    }
  })();
  ctx.log(`${nv} votes individuels Sénat, ${agg.size} agrégats de groupe`);
}
