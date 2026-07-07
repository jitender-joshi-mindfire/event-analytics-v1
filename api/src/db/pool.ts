import { Pool } from "pg";
import { config } from "../config.js";

export function createPool(): Pool {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: config.db.maxPoolSize,
    idleTimeoutMillis: config.db.idleTimeoutMs,
    statement_timeout: config.db.statementTimeoutMs,
    // date_trunc on a timestamptz uses the session timezone; every bucketing
    // query in the analytical endpoints assumes UTC boundaries. Setting it via
    // the connection startup options (rather than a query on the 'connect'
    // event) applies before any query can run on the client, so there's no
    // race between setup and the first real query on a freshly-opened connection.
    options: "-c timezone=UTC",
  });

  pool.on("error", (err) => {
    // Errors on idle clients (e.g. connection dropped) must not crash the process.
    console.error("Unexpected error on idle Postgres client", err);
  });

  return pool;
}
