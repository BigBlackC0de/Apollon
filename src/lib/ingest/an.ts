import { unzipSync, strFromU8 } from "fflate";
import { getDb, getSqlite, nowIso, schema } from "../db";
import { partyForAnGroup, partyForParpol } from "../config/parties";
import { fetchCached } from "./fetch-cache";
import type { JobContext } from "../jobs";

/**
 * Ingestion Assemblée nationale — open data officiel (data.assemblee-nationale.fr)
 *  - AMO10 : députés actifs, mandats, organes (groupes, partis déclarés)
 *  - Scrutins : tous les scrutins publics de la législature, votes nominatifs
 */

export const AN_LEGISLATURE = process.env.APOLLON_AN_LEGISLATURE ?? "17";
const BASE = `https://data.assemblee-nationale.fr/static/openData/repository/${AN_LEGISLATURE}`;
export const AN_URLS = {
  deputes: `${BASE}/amo/deputes_actifs_mandats_actifs_organes/AMO10_deputes_actifs_mandats_actifs_organes.json.zip`,
  scrutins: `${BASE}/loi/scrutins/Scrutins.json.zip`,
};

type AnyRec = Record<string, unknown>;
const asArray = <T>(x: T | T[] | null | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
const str = (x: unknown): string | null => {
  if (x == null) return null;
  if (typeof x === "object") {
    const t = (x as AnyRec)["#text"];
    return t == null ? null : String(t);
  }
  return String(x);
};
const num = (x: unknown): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

function readZipJson(buf: Buffer, filter: (name: string) => boolean): Map<string, AnyRec> {
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => filter(f.name) });
  const out = new Map<string, AnyRec>();
  for (const [name, data] of Object.entries(files)) {
    try {
      out.set(name, JSON.parse(strFromU8(data)) as AnyRec);
    } catch {
      /* fichier non JSON */
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Députés, groupes, partis                                            */
/* ------------------------------------------------------------------ */

export async function ingestAnDeputes(ctx: JobContext) {
  const db = getDb();
  ctx.log(`Assemblée nationale — législature ${AN_LEGISLATURE} — référentiel députés/organes`);
  const buf = await fetchCached(AN_URLS.deputes, { log: ctx.log });
  const files = readZipJson(buf, (n) => n.endsWith(".json"));

  // Organes : groupes politiques (GP) et partis (PARPOL)
  const parpol = new Map<string, string>();
  const groups: { ref: string; name: string; abbrev: string; legislature: string; dateStart: string | null; dateEnd: string | null }[] = [];
  for (const [name, json] of files) {
    if (!name.includes("/organe/")) continue;
    const o = (json.organe ?? json) as AnyRec;
    const codeType = str(o.codeType);
    if (codeType === "PARPOL") parpol.set(str(o.uid) ?? "", str(o.libelle) ?? "");
    if (codeType === "GP" && str(o.legislature) === AN_LEGISLATURE) {
      const vimode = (o.viMoDe ?? {}) as AnyRec;
      groups.push({
        ref: str(o.uid) ?? "",
        name: str(o.libelle) ?? "",
        abbrev: str(o.libelleAbrev) ?? "",
        legislature: String(o.legislature),
        dateStart: str(vimode.dateDebut),
        dateEnd: str(vimode.dateFin),
      });
    }
  }
  for (const g of groups) {
    db.insert(schema.anGroups)
      .values({ ...g, partyId: partyForAnGroup(g.abbrev) })
      .onConflictDoUpdate({ target: schema.anGroups.ref, set: { name: g.name, abbrev: g.abbrev, dateEnd: g.dateEnd, partyId: partyForAnGroup(g.abbrev) } })
      .run();
  }
  ctx.log(`${groups.length} groupes politiques, ${parpol.size} partis déclarés`);
  const groupByRef = new Map(groups.map((g) => [g.ref, g]));

  // Acteurs
  let n = 0;
  const upsert = getSqlite().prepare(
    `INSERT INTO politicians (id, chamber, first_name, last_name, full_name, party_id, group_ref, group_abbrev, group_name, parpol, department, circo, role, active, hatvp_url)
     VALUES (@id,'AN',@firstName,@lastName,@fullName,@partyId,@groupRef,@groupAbbrev,@groupName,@parpol,@department,@circo,@role,1,@hatvpUrl)
     ON CONFLICT(id) DO UPDATE SET first_name=excluded.first_name, last_name=excluded.last_name, full_name=excluded.full_name, party_id=excluded.party_id, group_ref=excluded.group_ref, group_abbrev=excluded.group_abbrev, group_name=excluded.group_name, parpol=excluded.parpol, department=excluded.department, circo=excluded.circo, role=excluded.role, active=1, hatvp_url=excluded.hatvp_url`,
  );

  const tx = getSqlite().transaction(() => {
    for (const [name, json] of files) {
      if (!name.includes("/acteur/")) continue;
      const a = (json.acteur ?? json) as AnyRec;
      const ident = ((a.etatCivil as AnyRec)?.ident ?? {}) as AnyRec;
      const mandats = asArray((a.mandats as AnyRec)?.mandat as AnyRec[]);
      const current = (type: string) => mandats.filter((m) => str(m.typeOrgane) === type && !str(m.dateFin));
      const gp = current("GP")[0];
      const pp = current("PARPOL")[0];
      const asn = current("ASSEMBLEE")[0];
      if (!asn) continue; // pas député en exercice
      const gpRef = gp ? str((gp.organes as AnyRec)?.organeRef) : null;
      const group = gpRef ? groupByRef.get(gpRef) : undefined;
      const ppLabel = pp ? parpol.get(str((pp.organes as AnyRec)?.organeRef) ?? "") ?? null : null;
      const lieu = ((asn.election as AnyRec)?.lieu ?? {}) as AnyRec;
      const quality = (gp?.infosQualite as AnyRec)?.libQualite;
      const partyId = partyForAnGroup(group?.abbrev) ?? partyForParpol(ppLabel);
      const firstName = str(ident.prenom) ?? "";
      const lastName = str(ident.nom) ?? "";
      upsert.run({
        id: str(a.uid) ?? "",
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`.trim(),
        partyId,
        groupRef: gpRef,
        groupAbbrev: group?.abbrev ?? null,
        groupName: group?.name ?? null,
        parpol: ppLabel,
        department: str(lieu.departement),
        circo: str(lieu.numCirco),
        role: str(quality),
        hatvpUrl: str(a.uri_hatvp),
      });
      n++;
    }
  });
  tx();
  ctx.log(`${n} députés en exercice importés`);
}

/* ------------------------------------------------------------------ */
/* Scrutins et votes nominatifs                                        */
/* ------------------------------------------------------------------ */

export async function ingestAnScrutins(ctx: JobContext) {
  const db = getDb();
  const sqlite = getSqlite();
  ctx.log(`Assemblée nationale — scrutins législature ${AN_LEGISLATURE}`);
  const buf = await fetchCached(AN_URLS.scrutins, { log: ctx.log });
  const files = readZipJson(buf, (n) => n.endsWith(".json"));
  ctx.log(`${files.size} scrutins dans le dump`);

  const existing = new Set(db.select({ uid: schema.scrutins.uid }).from(schema.scrutins).all().map((r) => r.uid));
  const groupParty = new Map(db.select().from(schema.anGroups).all().map((g) => [g.ref, g]));

  const insScrutin = sqlite.prepare(
    `INSERT INTO scrutins (uid, chamber, number, legislature, date, title, objet, demandeur, type_vote, sort, votants, exprimes, pour, contre, abstentions, url, dossier_ref, ingested_at)
     VALUES (@uid,'AN',@number,@legislature,@date,@title,@objet,@demandeur,@typeVote,@sort,@votants,@exprimes,@pour,@contre,@abstentions,@url,@dossierRef,@ingestedAt)
     ON CONFLICT(uid) DO UPDATE SET title=excluded.title, objet=excluded.objet, sort=excluded.sort, votants=excluded.votants, exprimes=excluded.exprimes, pour=excluded.pour, contre=excluded.contre, abstentions=excluded.abstentions`,
  );
  const insGroupVote = sqlite.prepare(
    `INSERT OR REPLACE INTO group_votes (scrutin_uid, group_ref, group_abbrev, party_id, position, pour, contre, abstentions, non_votants, members)
     VALUES (@scrutinUid,@groupRef,@groupAbbrev,@partyId,@position,@pour,@contre,@abstentions,@nonVotants,@members)`,
  );
  const insVote = sqlite.prepare(
    `INSERT OR REPLACE INTO votes (scrutin_uid, politician_id, position, par_delegation) VALUES (?,?,?,?)`,
  );

  let added = 0;
  let votesCount = 0;
  let i = 0;
  const total = files.size;
  const tx = sqlite.transaction((batch: AnyRec[]) => {
    for (const s of batch) {
      const uid = str(s.uid) ?? "";
      const synth = (s.syntheseVote ?? {}) as AnyRec;
      const decompte = (synth.decompte ?? {}) as AnyRec;
      const objet = (s.objet as AnyRec)?.libelle;
      const demandeur = (s.demandeur as AnyRec)?.texte;
      const sort = (s.sort as AnyRec)?.code;
      const typeVote = (s.typeVote as AnyRec)?.libelleTypeVote;
      const number = String(s.numero ?? "");
      insScrutin.run({
        uid,
        number,
        legislature: str(s.legislature),
        date: str(s.dateScrutin) ?? "",
        title: (str(s.titre) ?? "").trim(),
        objet: str(objet),
        demandeur: str(demandeur),
        typeVote: str(typeVote),
        sort: str(sort),
        votants: num(synth.nombreVotants),
        exprimes: num(synth.suffragesExprimes),
        pour: num(decompte.pour),
        contre: num(decompte.contre),
        abstentions: num(decompte.abstentions),
        url: `https://www.assemblee-nationale.fr/dyn/${AN_LEGISLATURE}/scrutins/${number}`,
        dossierRef: null,
        ingestedAt: nowIso(),
      });
      const organe = ((s.ventilationVotes as AnyRec)?.organe ?? {}) as AnyRec;
      const groupes = asArray(((organe.groupes as AnyRec)?.groupe ?? []) as AnyRec[]);
      for (const g of groupes) {
        const gRef = str(g.organeRef) ?? "";
        const vote = (g.vote ?? {}) as AnyRec;
        const dv = (vote.decompteVoix ?? {}) as AnyRec;
        const dn = (vote.decompteNominatif ?? {}) as AnyRec;
        const meta = groupParty.get(gRef);
        insGroupVote.run({
          scrutinUid: uid,
          groupRef: gRef,
          groupAbbrev: meta?.abbrev ?? null,
          partyId: meta?.partyId ?? null,
          position: str(vote.positionMajoritaire),
          pour: num(dv.pour),
          contre: num(dv.contre),
          abstentions: num(dv.abstentions),
          nonVotants: num(dv.nonVotants),
          members: num(g.nombreMembresGroupe),
        });
        const buckets: [string, string][] = [
          ["pours", "pour"],
          ["contres", "contre"],
          ["abstentions", "abstention"],
          ["nonVotants", "nonVotant"],
        ];
        for (const [key, pos] of buckets) {
          const votants = asArray(((dn[key] as AnyRec)?.votant ?? []) as AnyRec[]);
          for (const v of votants) {
            insVote.run(uid, str(v.acteurRef) ?? "", pos, str(v.parDelegation) === "true" ? 1 : 0);
            votesCount++;
          }
        }
      }
      if (!existing.has(uid)) added++;
    }
  });

  const all = [...files.values()].map((j) => (j.scrutin ?? j) as AnyRec);
  const BATCH = 200;
  for (let k = 0; k < all.length; k += BATCH) {
    tx(all.slice(k, k + BATCH));
    i = Math.min(all.length, k + BATCH);
    ctx.setProgress(i, total, `Scrutins AN importés : ${i}/${total}`);
    ctx.checkpoint();
  }
  ctx.log(`${all.length} scrutins traités (${added} nouveaux), ${votesCount} votes nominatifs`);
}
