# Evaluation — Acceptance Criteria (candidate-facing)

This is what "done" means. Each item is checked when you submit. Treat it as your definition-of-done checklist.

## Boots from clean
- [ ] `docker compose up` brings up Postgres, Redis, the API, **and the dashboard** from a clean checkout.
- [ ] Documented commands run migrations and load the seed without manual fixups.
- [ ] `GET /v1/health` returns ready only when DB **and** Redis are reachable.

## Contract conformance
- [ ] Every endpoint in `openapi.yaml` exists with the specified method, path, and params.
- [ ] Every 2xx and error response **validates against the OpenAPI schema** (field names, types, required fields).
- [ ] Error responses use the single problem envelope; correct status codes; `400` carries field-level `errors[]`.
- [ ] Unknown/invalid query params and `from > to` are rejected with `400`.

## Analytical correctness
- [ ] `timeseries` is gap-filled — zero buckets present, aligned to UTC boundaries.
- [ ] `funnel` counts only users who complete steps **in order** within the window.
- [ ] `retention` cohort grid is correct (cohort row totals and diagonal sanity-check out).
- [ ] `top` returns correct ranks with a **deterministic** tie-break.
- [ ] `latency` percentiles match a reference calculation within rounding.
- [ ] `sessions/active` splits sessions correctly at the inactivity gap boundary.
- [ ] Results are reproducible against the fixed seed.

## SQL quality
- [ ] Analytical endpoints use raw parameterised SQL (no ORM query-builder, no SQL injection).
- [ ] Heavy work happens in Postgres, not in Node memory.
- [ ] Indexes added deliberately; `EXPLAIN (ANALYZE, BUFFERS)` for each analytical query in `SUBMISSION.md`.
- [ ] No N+1 query patterns on any endpoint.

## Idempotency, caching, concurrency
- [ ] Re-posting the same `event_id`s does not double-count.
- [ ] Redis caches the expensive aggregates with a sound key + TTL + invalidation; staleness trade-off documented.
- [ ] At least one of: distributed lock / idempotency set / rate limiter implemented via Redis, with justification.
- [ ] A large ingest does not stall reads (shown in a test or documented).

## Testing (TDD)
- [ ] Tests run green via one command against real Postgres + Redis.
- [ ] Unit tests for validation/transform logic; integration tests for each endpoint incl. error paths.
- [ ] Git history shows tests arriving with/before implementation.
- [ ] Meaningful coverage on the analytical + ingest paths (we look at what's covered, not just a %).

## Dashboard & data-delivery
- [ ] Single React + TS page renders all six metrics, correctly reflecting API data.
- [ ] Shared date-range + bucket controls drive the queries; unrelated control changes don't refetch everything.
- [ ] Per-widget loading / empty / error states; UI stays responsive while heavy aggregates load (no main-thread blocking).
- [ ] Observed load latency shown per widget.
- [ ] Cursor pagination works for Top-N and Active sessions.
- [ ] `SUBMISSION.md` documents, per widget, *how* data is served (direct / client cache / server cache / materialized view / cron-precompute) with the freshness-vs-latency trade-off and measured latency.

## Engineering hygiene
- [ ] `typecheck` and `lint` pass with no errors.
- [ ] Connection pooling, statement timeouts, and graceful shutdown configured.
- [ ] `SUBMISSION.md` complete (setup, design, SQL, caching, trade-offs).
- [ ] No secrets, no `node_modules`, no committed multi-GB seed dump.

## Performance
- [ ] Analytical endpoints meet (or near) the p95 targets in `REQUIREMENTS.md` §4 on the seeded dataset.
- [ ] No full sequential scans on the hot path where an index is warranted.
