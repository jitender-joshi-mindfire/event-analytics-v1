# Requirements

## 1. Context

A SaaS product emits **events** (e.g. `signup`, `login`, `view_page`, `add_to_cart`, `purchase`) tagged with a user, a session, a timestamp, and a JSON payload. Product managers need a metrics API to answer analytical questions over this stream. You are building the **read API** plus a small **ingest** path.

The data model is fixed for you in `data/schema.sql`. You may **add indexes, materialized views, and helper tables**, but you may not change the meaning of existing columns.

## 2. Functional requirements

All endpoints, request params, and response shapes are defined authoritatively in `openapi.yaml`. The analytical intent of each is in `data/QUERIES.md`. Summary:

### Ingest
- `POST /v1/events` — accept a batch of events. Must be **idempotent** per `event_id` (re-sending the same batch must not double-count). Must validate against the schema and reject malformed batches with the standard error envelope. Must not block the event loop on large batches.

### Read / analytics
- `GET /v1/metrics/timeseries` — event counts bucketed by `hour`/`day`/`week` over a range, **gap-filled** (every bucket present even when zero).
- `GET /v1/metrics/funnel` — ordered step conversion: given an ordered list of event types, the count of users reaching each step **in order** within a conversion window.
- `GET /v1/metrics/retention` — cohort retention grid: users grouped by signup week × subsequent active week.
- `GET /v1/metrics/top` — top-N entities (e.g. pages, products) per group with rank, by a chosen metric.
- `GET /v1/metrics/latency` — p50/p90/p95/p99 of a numeric payload field (e.g. response time) over a range.
- `GET /v1/sessions/active` — sessionization via gap-and-island: contiguous activity split into sessions by an inactivity gap.

### Operational
- `GET /v1/health` — liveness + readiness (DB and Redis reachable).

## 2b. Frontend: Metrics Dashboard

Build a **single React + TypeScript dashboard page** that visualises **all six metrics** from the API. UI and charting libraries are your choice (e.g. Recharts/visx/Chart.js + any component kit). Polish is not graded; clarity, correctness, and *how the data is delivered* are.

**Widgets (all on one page):**
- **Timeseries** — line/bar chart of event counts; honour the gap-filled zeros.
- **Funnel** — step bars with per-step conversion.
- **Retention** — cohort grid / heatmap (cohort row × week column).
- **Top-N** — ranked table with pagination (uses the cursor pagination).
- **Latency** — p50/p90/p95/p99 display.
- **Active sessions** — paginated table.

**Controls:** a shared **date range** and **bucket** selector that drive the queries; funnel step list and top-N dimension selectable. Changing controls refetches only what's affected.

**Behavioural requirements (these are what we observe):**
- The page must stay **responsive while heavy aggregates load** — no frozen UI, no blocking the main thread. Per-widget loading, empty, and error states.
- **Show the observed load latency per widget** (e.g. a small "loaded in 320 ms" badge). We want to see real numbers.
- **Avoid unnecessary refetches** — don't re-pull data that hasn't changed when an unrelated control moves.
- Cursor pagination wired correctly for Top-N and Active sessions.

**The decision we're watching:** you choose *how* each widget's data is served and made fast. Options include calling the API directly, caching on the client, caching on the server (Redis), backing a widget with a **materialized view**, or **precomputing on a schedule (cron/worker)**. We do not prescribe an approach — **pick deliberately per widget and justify it** in `SUBMISSION.md` (freshness vs. latency vs. complexity), with the latency you measured. Mixing approaches where it makes sense is encouraged and is itself a signal.

The dashboard is served by `docker compose up` alongside the API (its own service/container is fine).

## 3. Cross-cutting requirements

**Pagination.** List-style endpoints (`/metrics/top`, `/sessions/active`) use **cursor-based** pagination as specified in `openapi.yaml` (opaque `cursor`, `limit`, `next_cursor`). No `OFFSET`-based paging on large result sets.

**Error envelope.** All non-2xx responses use the single problem shape defined in `openapi.yaml` (`type`, `title`, `status`, `detail`, `instance`, optional `errors[]`). 4xx for client errors, 5xx only for genuine server faults.

**Validation.** Reject unknown query params, out-of-range values, bad date formats, and `from > to`. Return `400` with field-level `errors[]`.

**Time handling.** All timestamps are UTC, ISO-8601. Bucketing aligns to UTC boundaries.

**Determinism.** Given the same seed, results are reproducible. Tie-breaks (e.g. in top-N) must be deterministic — specify and implement a stable secondary sort.

## 4. Non-functional requirements

**Performance (against the ~3M-row seed, warm cache cold):**

| Endpoint | Target p95 |
|---|---|
| `GET /v1/metrics/timeseries` | < 300 ms |
| `GET /v1/metrics/top` | < 300 ms |
| `GET /v1/metrics/latency` | < 400 ms |
| `GET /v1/metrics/funnel` | < 800 ms |
| `GET /v1/metrics/retention` | < 800 ms |
| `POST /v1/events` (batch of 1k) | < 500 ms |

These are guidelines, not pass/fail gates on their own — but unindexed sequential scans on every request will cost you. Justify your indexes.

**Caching.** Expensive aggregates (`retention`, `funnel`, `timeseries`) must be cached in **Redis** with a sane key (params-derived), a TTL, and a **correct invalidation** path when new events land. Document the staleness trade-off you chose.

**Concurrency / event loop.** Ingest must remain responsive under concurrent batches. Demonstrate (in tests or notes) that a large ingest does not stall reads. Use Redis for at least one of: a distributed lock, an idempotency set, or a rate limiter — and justify the choice.

**Robustness.** Connection pooling configured deliberately. Graceful shutdown (drain in-flight, close pools). Statement timeouts so a pathological query can't hang a worker.

## 5. Explicit non-goals

No auth/multi-tenancy. No production deploy/IaC. No real-time streaming/websockets. No design-system perfection or responsive/mobile polish on the dashboard — a clean, functional single page is enough. No multi-page routing or app shell beyond the one dashboard page. Keep scope to the endpoints and the single dashboard above — depth over breadth.

## 6. Stretch (only if everything above is solid)

- A materialized view + refresh strategy for retention, with the cache layered on top.
- `EXPLAIN`-driven before/after for one endpoint showing an index removing a seq scan.
- Backpressure on ingest when the DB is saturated.
