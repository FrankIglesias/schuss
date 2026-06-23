// Apply a single SQL migration file directly. Workaround for drizzle-kit
// migrate hanging in some envs.
//
// Usage: bun scripts/apply-migration.ts db/migrations/0001_resort_conditions.sql

import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import postgres from "postgres";

config({ path: ".env.local" });

const path = process.argv[2];
if (!path) {
  console.error("usage: bun scripts/apply-migration.ts <path-to-sql>");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const raw = await readFile(path, "utf8");
const statements = raw
  .split(/--> statement-breakpoint/)
  .map((s) => s.trim())
  .filter(Boolean);

for (const stmt of statements) {
  console.log("→", stmt.slice(0, 80).replace(/\s+/g, " "), "…");
  await sql.unsafe(stmt);
}
console.log(`applied ${statements.length} statement(s)`);
await sql.end();
