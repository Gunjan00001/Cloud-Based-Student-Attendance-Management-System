import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("MIGRATION_DATABASE_URL (or DATABASE_URL) is required.");
  process.exit(1);
}

// PGlite (dev in-memory Postgres) has no citext/pgcrypto extensions.
const isPglite = /(localhost|127\.0\.0\.1):5434/.test(url);

const sql = postgres(url, { max: 1, prepare: false, ssl: process.env.DB_SSL === "false" ? false : sslRequired(url) });

function sslRequired(url) {
  return /(localhost|127\.0\.0\.1)/.test(url) ? false : "require";
}

try {
  await sql`CREATE TABLE IF NOT EXISTS _migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;

  const dir = join(process.cwd(), "db", "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied = new Set((await sql`SELECT name FROM _migrations`).map((r) => r.name));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file}`);
      continue;
    }
    let body = await readFile(join(dir, file), "utf8");
    if (isPglite) {
      body = body.replace(/^CREATE EXTENSION.*\n/gm, "").replace(/\bcitext\b/g, "text");
    }
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO _migrations (name) VALUES (${file})`;
    });
    console.log(`apply ${file}`);
  }
  console.log("Migrations complete.");
} catch (error) {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
