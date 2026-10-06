import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

declare global {
  var __apollonDb: { db: Db; sqlite: Database.Database } | undefined;
}

function open(): { db: Db; sqlite: Database.Database } {
  const file = process.env.APOLLON_DB_PATH ?? path.join(process.cwd(), "data", "apollon.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("cache_size = -64000");
  const db = drizzle(sqlite, { schema });
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  if (fs.existsSync(migrationsFolder)) {
    migrate(db, { migrationsFolder });
  }
  return { db, sqlite };
}

export function getDb(): Db {
  if (!globalThis.__apollonDb) globalThis.__apollonDb = open();
  return globalThis.__apollonDb.db;
}

export function getSqlite(): Database.Database {
  getDb();
  return globalThis.__apollonDb!.sqlite;
}

export { schema };
export const nowIso = () => new Date().toISOString();
