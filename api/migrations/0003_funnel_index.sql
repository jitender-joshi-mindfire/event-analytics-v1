-- /v1/metrics/funnel joins events to the previous step's per-user timestamp
-- on (user_id, event_type, occurred_at range). Without event_type in the
-- index, that join falls back to (user_id, occurred_at) with event_type
-- filtered row-by-row after the fact — this index lets it be a pure index
-- condition instead.
CREATE INDEX IF NOT EXISTS idx_events_user_id_event_type_occurred_at ON events (user_id, event_type, occurred_at);
