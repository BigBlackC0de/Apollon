import { getDb, getSqlite, schema } from "../db";
import { PARTIES } from "../config/parties";

/** Insère / met à jour le référentiel des partis depuis la config, et retire ceux qui n'y figurent plus. */
export function seedParties() {
  const db = getDb();
  const keep = PARTIES.map((p) => p.id);
  const sqlite = getSqlite();
  const placeholders = keep.map(() => "?").join(",");
  sqlite.transaction(() => {
    sqlite.prepare(`UPDATE politicians SET party_id = NULL WHERE party_id IS NOT NULL AND party_id NOT IN (${placeholders})`).run(...keep);
    sqlite.prepare(`UPDATE an_groups SET party_id = NULL WHERE party_id IS NOT NULL AND party_id NOT IN (${placeholders})`).run(...keep);
    sqlite.prepare(`UPDATE group_votes SET party_id = NULL WHERE party_id IS NOT NULL AND party_id NOT IN (${placeholders})`).run(...keep);
    sqlite.prepare(`UPDATE posts SET party_id = NULL WHERE party_id IS NOT NULL AND party_id NOT IN (${placeholders})`).run(...keep);
    sqlite.prepare(`DELETE FROM party_theme_scores WHERE party_id NOT IN (${placeholders})`).run(...keep);
    sqlite.prepare(`DELETE FROM parties WHERE id NOT IN (${placeholders})`).run(...keep);
  })();
  for (const p of PARTIES) {
    db.insert(schema.parties)
      .values({
        id: p.id,
        name: p.name,
        shortName: p.shortName,
        color: p.color,
        family: p.family,
        lrIndex: p.lrIndex,
        website: p.website ?? null,
        anGroups: p.anGroups,
        parpolNames: p.parpolNames,
        senatGroups: p.senatGroups,
        xHandles: p.xHandles,
        leaders: p.leaders,
        notes: p.notes ?? null,
      })
      .onConflictDoUpdate({
        target: schema.parties.id,
        set: {
          name: p.name,
          shortName: p.shortName,
          color: p.color,
          family: p.family,
          lrIndex: p.lrIndex,
          website: p.website ?? null,
          anGroups: p.anGroups,
          parpolNames: p.parpolNames,
          senatGroups: p.senatGroups,
          leaders: p.leaders,
          notes: p.notes ?? null,
          // xHandles volontairement non écrasés : modifiables dans l'UI
        },
      })
      .run();
  }
}
