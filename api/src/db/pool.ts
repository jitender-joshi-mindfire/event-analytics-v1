import { Pool } from "pg";
import { config } from "../config.js";

export function createPool(): Pool {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: config.db.maxPoolSize,
    idleTimeoutMillis: config.db.idleTimeoutMs,
    statement_timeout: config.db.statementTimeoutMs,
  });

  pool.on("error", (err) => {
    // Errors on idle clients (e.g. connection dropped) must not crash the process.
    console.error("Unexpected error on idle Postgres client", err);
  });

  return pool;
}
