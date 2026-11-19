import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { ensureDevData } from "@/lib/dev-seed";

export type Database = PostgresJsDatabase<typeof schema>;

/** postgres.js returns an array of rows; PGlite returns { rows }. Normalize. */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return (result as { rows?: T[] })?.rows ?? [];
}

function sslFor(url: string) {
  // Docker/compose databases run without TLS; set DB_SSL=false there.
  if (process.env.DB_SSL === "false") return false;
  return /(localhost|127\.0\.0\.1)/.test(url) ? false : "require";
}

type DbClient = { write: Database; read: Database };

async function postgresClients(): Promise<DbClient> {
  // Fallbacks keep `next build` working without secrets; any real query then
  // fails with a connection error and the API returns 503.
  const writeUrl = process.env.DATABASE_URL || "postgres://localhost:5432/placeholder";
  const readUrl = process.env.DATABASE_REPLICA_URL || writeUrl;
  const write = drizzle(postgres(writeUrl, { max: 1, prepare: false, ssl: sslFor(writeUrl), onnotice: () => {} }), { schema });
  const read = drizzle(postgres(readUrl, { max: 1, prepare: false, ssl: sslFor(readUrl), onnotice: () => {} }), { schema });
  return { write, read };
}

async function pgliteClient(): Promise<DbClient> {
  // Dev-only: an in-process Postgres. `PGLITE=1 npm start` needs no external
  // database; schema and demo data are created on each boot (in-memory).
  const client = new PGlite();
  const hasSchema = await client.query<{ exists: boolean }>(
    "SELECT to_regclass('public.users') IS NOT NULL AS exists",
  );
  if (!hasSchema.rows[0]?.exists) {
    let migration = await readFile(join(process.cwd(), "db", "migrations", "0000_init.sql"), "utf8");
    migration = migration.replace(/^CREATE EXTENSION.*\n/gm, "").replace(/\bcitext\b/g, "text");
    await client.exec(migration);
  }
  const db = drizzlePglite(client, { schema }) as unknown as Database;
  await ensureDevData(db);
  return { write: db, read: db };
}

const isPglite = process.env.PGLITE === "1";
// During `next build`, only module shape is needed; skip PGlite init (and its
// data-dir lock) so build workers do not fight over the dev database.
const isBuild = process.env.NEXT_PHASE === "phase-production-build";

async function placeholderClients(): Promise<DbClient> {
  const dummy = drizzle(postgres("postgres://localhost:5432/placeholder", { max: 1, prepare: false, ssl: false }), { schema });
  return { write: dummy, read: dummy };
}

const { write, read: replica } = isBuild
  ? await placeholderClients()
  : isPglite
    ? await pgliteClient()
    : await postgresClients();

export const writeDb: Database = write;
export const readDb: Database = replica;

type GlobalWithBreaker = typeof globalThis & { __replicaDownUntil?: number };
const globalForBreaker = globalThis as GlobalWithBreaker;

export type ReadMeta = {
  source: "replica" | "primary";
  dataAsOf: string;
  replicaLagMs: number | null;
};

async function replicaLagMs(db: Database): Promise<number | null> {
  try {
    const result = await db.execute(sql`
      SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) * 1000 AS lag_ms
    `);
    const first = rowsOf<{ lag_ms: number | null }>(result)[0];
    return first?.lag_ms == null ? null : Math.round(Number(first.lag_ms));
  } catch {
    return null;
  }
}

/**
 * Replica read with one retry, then a 30-second fallback to the primary.
 * The fallback is reported to the caller so it can set X-Data-Source.
 */
export async function read<T>(run: (db: Database) => Promise<T>): Promise<{ data: T; meta: ReadMeta }> {
  const now = Date.now();
  if (now < (globalForBreaker.__replicaDownUntil ?? 0) || isPglite) {
    return {
      data: await run(writeDb),
      meta: { source: "primary", dataAsOf: new Date().toISOString(), replicaLagMs: null },
    };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = await run(readDb);
      return {
        data,
        meta: {
          source: "replica",
          dataAsOf: new Date().toISOString(),
          replicaLagMs: await replicaLagMs(readDb),
        },
      };
    } catch (error) {
      if (attempt === 1) {
        globalForBreaker.__replicaDownUntil = Date.now() + 30_000;
        console.error("replica_unavailable", error instanceof Error ? error.message : "unknown");
        return {
          data: await run(writeDb),
          meta: { source: "primary", dataAsOf: new Date().toISOString(), replicaLagMs: null },
        };
      }
    }
  }

  throw new Error("unreachable");
}
