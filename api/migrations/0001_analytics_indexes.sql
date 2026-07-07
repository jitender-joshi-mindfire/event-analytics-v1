-- occurred_at range scans with no event_type filter (timeseries without
-- event_type, latency's default query) need occurred_at as the leading
-- column on its own — a composite index with event_type first wouldn't be
-- usable for a range-only scan.
CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events (occurred_at);

-- timeseries/latency with an event_type filter, and any future query
-- filtering both, benefit from event_type leading a composite index so
-- Postgres narrows to the type before range-scanning occurred_at.
CREATE INDEX IF NOT EXISTS idx_events_event_type_occurred_at ON events (event_type, occurred_at);

-- /v1/metrics/top ranks on an arbitrary payload field (dimension/group_by).
-- We can't pre-index every possible key, but a GIN index speeds up the
-- `payload ? $key` containment check every ranked query runs.
CREATE INDEX IF NOT EXISTS idx_events_payload_gin ON events USING GIN (payload);
