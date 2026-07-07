import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { config } from "../src/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface MigrationFile {
  name: string;
  sql: string;
}

function loadMigrations(): MigrationFile[] {
  // data/schema.sql is the fixed base schema (owned by the assignment, not us);
  // it always applies first as migration "0000". Everything under api/migrations/
  // is ours (indexes, materialized views, helper tables) and applies in file order.
  const schemaPath = path.resolve(__dirname, "../../data/schema.sql");
  const migrationsDir = path.resolve(__dirname, "../migrations");

  const ours = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ name: f.replace(/\.sql$/, ""), sql: readFileSync(path.join(migrationsDir, f), "utf8") }));

  return [{ name: "0000_base_schema", sql: readFileSync(schemaPath, "utf8") }, ...ours];
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: config.databaseUrl });

  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`
  );

  for (const migration of loadMigrations()) {
    const { rows } = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [migration.name]);
    if (rows.length > 0) {
      console.log(`skip  ${migration.name} (already applied)`);
      continue;
    }

    console.log(`apply ${migration.name}`);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(migration.sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migration.name]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  await pool.end();
  console.log("Migrations up to date.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
