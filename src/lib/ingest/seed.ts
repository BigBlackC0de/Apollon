import { getDb, schema } from "../db";
import { PARTIES } from "../config/parties";

/** Insère / met à jour le référentiel des partis depuis la config. */
export function seedParties() {
  const db = getDb();
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
