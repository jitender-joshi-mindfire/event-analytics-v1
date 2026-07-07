-- Event Analytics — base schema (FIXED).
-- You may ADD indexes, materialized views, and helper tables.
-- Do NOT change the meaning of existing columns.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users / accounts. signup_at drives retention cohorts.
CREATE TABLE IF NOT EXISTS users (
    user_id     TEXT PRIMARY KEY,
    signup_at   TIMESTAMPTZ NOT NULL,
    country     TEXT,
    plan        TEXT
);

-- Raw event stream. event_id is the idempotency key.
-- payload is arbitrary JSON: e.g. { "page": "/pricing", "amount": 49.9,
--   "latency_ms": 220, "product_id": "p_12", "country": "us" }.
CREATE TABLE IF NOT EXISTS events (
    event_id     UUID PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(user_id),
    session_id   TEXT,
    event_type   TEXT NOT NULL,
    occurred_at  TIMESTAMPTZ NOT NULL,
    payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
    ingested_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NOTE: we deliberately ship MINIMAL indexes. Part of the assignment is
-- choosing the right indexes for the analytical workload and justifying them
-- with EXPLAIN (ANALYZE, BUFFERS). The PK on event_id exists; little else does.
--
-- Candidate indexes go in YOUR migrations, not here. Examples you might consider
-- (decide for yourself — don't just copy these):
--   - btree on (occurred_at)
--   - composite on (event_type, occurred_at)
--   - btree on (user_id, occurred_at)
--   - expression / GIN indexes on payload fields you filter or rank on
