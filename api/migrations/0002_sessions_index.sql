-- /v1/sessions/active window-functions (LAG, running SUM) partition and
-- order by (user_id, occurred_at) per user; this index lets Postgres feed
-- each partition already sorted instead of sorting the range-filtered rows
-- in memory/on disk.
CREATE INDEX IF NOT EXISTS idx_events_user_id_occurred_at ON events (user_id, occurred_at);
