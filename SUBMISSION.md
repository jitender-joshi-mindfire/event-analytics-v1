# Submission

## Setup

From a clean checkout:

```bash
cp .env.example .env
docker compose up -d --build
make migrate
make seed
make test
```

Then open http://localhost:5173 for the dashboard (API on http://localhost:8080).

Individual pieces, if you want to run them separately:

```bash
make setup       # npm install in api/ and dashboard/
make up          # docker compose up -d --build
make migrate     # applies data/schema.sql + api/migrations/*.sql
make seed        # truncates events/users, reloads data/seed/generate_seed.sql (~3M events)
make test        # api/ vitest suite against real Postgres + Redis
make lint        # eslint on both packages
make typecheck   # tsc --noEmit on both packages
make dev         # dashboard vite dev server (for iterating without a container rebuild)
```

`.env.example` documents the host-side ports (chosen to avoid clashing with a Postgres/Redis you might already have running) and the `DATABASE_URL`/`REDIS_URL` used when running `api/` commands directly from the host instead of inside the container.

## Design notes

- **API**: Fastify + TypeScript, strict mode. Chosen over Express/Koa for built-in JSON-schema request/response validation (via ajv) that maps directly onto the error-envelope and "reject unknown params" requirements without hand-rolled middleware, and for a plugin/decorator model that keeps `pg`/`redis` clients available on the instance without a DI framework.
- **Structure**: `api/src/routes/` (one file per endpoint, or `metrics/` for the six analytical ones), `api/src/schemas/` (JSON Schema + TS types per endpoint, mirroring `openapi.yaml`), `api/src/{db,redis,cache,pagination,validation,rateLimit,errors}/` for the cross-cutting pieces each endpoint composes. No service/repository layering beyond that — the SQL lives directly in each route file since every query is bespoke to its endpoint and there's no reuse to abstract.
- **No ORM for analytical queries** (hard rule) — raw parameterized SQL throughout `routes/metrics/*` and `routes/sessions.ts`. Dynamic pieces (funnel's per-step CTE chain, top's optional `group_by`) are built by appending SQL text fragments in JS, but every *value* — including arbitrary payload field names like `dimension`/`group_by`/`steps`/`field` — is always a bound `$n` parameter, never concatenated. `payload ->> $n` takes the key name as a normal parameter, not an identifier, so this is safe against injection even though the field name is user-supplied.
- **Dashboard**: React + TypeScript + Vite, TanStack Query for data fetching/caching, Recharts for the one line chart (timeseries) — everything else (funnel bars, retention heatmap, tables) is plain CSS/HTML since a charting library added nothing there. No global state library; the three shared controls (`from`, `to`, `bucket`) are lifted to `App.tsx` and passed down as props, each widget owns its own additional controls (dimension, steps, gap_minutes, etc.) as local state.
- **Biggest trade-off**: the funnel/top SQL builders construct query text by string-templating *fragments* (CTE names, which metric expression, whether a `group_by` clause exists) while keeping all *values* parameterized. This is more code than a static query per endpoint would need, but keeping it hand-written (vs. a query-builder library) was a deliberate call given the "no ORM/query-builder for analytical endpoints" rule — the intent of that rule is "don't hide the SQL," and hand-built string templates with 100% parameterized values keep the actual SQL fully visible and auditable.

## SQL notes

All indexes are additive migrations under `api/migrations/`, applied on top of the fixed `data/schema.sql` by `api/scripts/migrate.ts` (tracked in a `schema_migrations` table). None change the meaning of an existing column.

| Migration | Index | Why |
|---|---|---|
| `0001_analytics_indexes.sql` | `idx_events_occurred_at` on `(occurred_at)` | Range-only scans (timeseries/latency with no `event_type` filter) — needs `occurred_at` leading on its own; a composite with `event_type` first isn't usable without an equality filter on it. |
| `0001_analytics_indexes.sql` | `idx_events_event_type_occurred_at` on `(event_type, occurred_at)` | Timeseries/latency *with* an `event_type` filter narrow to the type before range-scanning. |
| `0001_analytics_indexes.sql` | `idx_events_payload_gin` (GIN on `payload`) | `/v1/metrics/top` runs a `payload ? $key` containment check every query; speeds that up. |
| `0002_sessions_index.sql` | `idx_events_user_id_occurred_at` on `(user_id, occurred_at)` | `/v1/sessions/active`'s `LAG`/running-`SUM` window functions partition and order by exactly this — lets Postgres feed each partition pre-sorted. |
| `0003_funnel_index.sql` | `idx_events_user_id_event_type_occurred_at` on `(user_id, event_type, occurred_at)` | Funnel's per-step join needs, per user, the first event of a *specific type* after a timestamp. Without `event_type` in the index this fell back to `(user_id, occurred_at)` and filtered type row-by-row after the fact — confirmed via `EXPLAIN`, see below. |

`postgres`'s stock config (`shared_buffers=128MB`, `work_mem=4MB`) pushes the heavier hash aggregates to disk against the 3M-row seed; `docker-compose.yml` tunes it to `shared_buffers=512MB`, `effective_cache_size=1GB`, `work_mem=32MB`, `maintenance_work_mem=256MB`.

### `GET /v1/metrics/timeseries`

```sql
WITH buckets AS (
  SELECT generate_series(
    date_trunc($1, $2::timestamptz),
    date_trunc($1, $3::timestamptz - interval '1 microsecond'),
    $4::interval
  ) AS ts
),
counts AS (
  SELECT date_trunc($1, occurred_at) AS ts, count(*) AS count
  FROM events
  WHERE occurred_at >= $2::timestamptz AND occurred_at < $3::timestamptz
    AND ($5::text IS NULL OR event_type = $5::text)
  GROUP BY 1
)
SELECT b.ts, COALESCE(c.count, 0)::int AS count
FROM buckets b LEFT JOIN counts c ON c.ts = b.ts
ORDER BY b.ts
```

`EXPLAIN (ANALYZE, BUFFERS)` for a 1-week, `event_type`-filtered range: `Index Only Scan using idx_events_event_type_occurred_at`, 0.3ms warm. A 1-month unfiltered range: `Index Only Scan using idx_events_occurred_at`, ~24ms warm. No sequential scan in either case.

### `GET /v1/metrics/top`

Built dynamically (see design notes) — shape for `dimension=page`, no `group_by`, `metric=count`:

```sql
WITH ranked AS (
  SELECT
    NULL::text AS grp,
    payload ->> $1 AS entity,
    count(*)::float8 AS value,
    (ROW_NUMBER() OVER (PARTITION BY NULL::text ORDER BY count(*)::float8 DESC, (payload ->> $1) ASC))::int AS rank
  FROM events
  WHERE occurred_at >= $2::timestamptz AND occurred_at < $3::timestamptz AND payload ? $1
  GROUP BY 1, 2
),
top_n AS (
  SELECT *, (ROW_NUMBER() OVER (ORDER BY grp NULLS FIRST, rank))::int AS seq
  FROM ranked WHERE rank <= $4
)
SELECT grp, entity, rank, value, seq FROM top_n WHERE seq > $5 ORDER BY seq LIMIT $6
```

`EXPLAIN (ANALYZE, BUFFERS)`, 1-week range: `Bitmap Index Scan on idx_events_occurred_at` → `Bitmap Heap Scan` with `Filter: (payload ? 'page')`, ~172ms warm (~880ms cold/first-touch). A 3-month range on the same query triggers a `Seq Scan` — confirmed via `EXPLAIN` this is the planner correctly choosing it once the date filter matches over ~50% of the table (not a missing index).

### `GET /v1/metrics/latency`

```sql
SELECT
  count(*)::int AS count,
  coalesce(percentile_cont(0.5)  WITHIN GROUP (ORDER BY (payload->>$3)::numeric), 0)::float8 AS p50,
  coalesce(percentile_cont(0.9)  WITHIN GROUP (ORDER BY (payload->>$3)::numeric), 0)::float8 AS p90,
  coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY (payload->>$3)::numeric), 0)::float8 AS p95,
  coalesce(percentile_cont(0.99) WITHIN GROUP (ORDER BY (payload->>$3)::numeric), 0)::float8 AS p99
FROM events
WHERE occurred_at >= $1::timestamptz AND occurred_at < $2::timestamptz
  AND ($4::text IS NULL OR event_type = $4::text)
  AND payload->>$3 ~ '^-?\d+(\.\d+)?$'
```

`percentile_cont` (interpolating) chosen consistently over `percentile_disc`, per `QUERIES.md`'s "pick one and be consistent." The regex guard excludes non-numeric payload values instead of throwing a cast error. `EXPLAIN`, 1-week range: `Bitmap Index Scan on idx_events_occurred_at`, ~112-130ms warm.

### `GET /v1/metrics/funnel`

One CTE per step (see `api/src/routes/metrics/funnel.ts:buildFunnelQuery`), each joining strictly *after* (`>`, not `>=`) the previous step's timestamp and within `window` of it — never cumulative from step 1:

```sql
WITH step_1 AS (
  SELECT user_id, min(occurred_at) AS ts FROM events
  WHERE event_type = $1 AND occurred_at >= $2::timestamptz AND occurred_at < $3::timestamptz
  GROUP BY user_id
),
step_2 AS (
  SELECT s.user_id, min(e.occurred_at) AS ts FROM step_1 s
  JOIN events e ON e.user_id = s.user_id AND e.event_type = $4
    AND e.occurred_at > s.ts AND e.occurred_at <= s.ts + $5::interval
  GROUP BY s.user_id
)
-- ...one more CTE per remaining step
SELECT 1 AS idx, count(*)::int AS users FROM step_1
UNION ALL SELECT 2, count(*)::int FROM step_2
-- ...
ORDER BY idx
```

Before `idx_events_user_id_event_type_occurred_at`: each step's join used `(user_id, occurred_at)` and filtered `event_type` row-by-row (`Rows Removed by Filter` in the plan) — a 3-month, 4-step funnel took ~4.8s. After the index: ~2.4s for that same wide range, ~410ms for a realistic 1-week signup-window range (under the 800ms target).

### `GET /v1/metrics/retention`

```sql
WITH cohort_users AS (
  SELECT user_id, date_trunc('week', signup_at) AS cohort_week FROM users
  WHERE signup_at >= $1::timestamptz AND signup_at < $2::timestamptz
),
cohort_sizes AS (SELECT cohort_week, count(*)::int AS size FROM cohort_users GROUP BY cohort_week),
activity AS (
  SELECT cu.cohort_week, cu.user_id,
    (floor(extract(epoch FROM date_trunc('week', e.occurred_at) - cu.cohort_week) / 604800))::int AS week_offset
  FROM cohort_users cu JOIN events e ON e.user_id = cu.user_id
  WHERE date_trunc('week', e.occurred_at) >= cu.cohort_week
    AND (floor(extract(epoch FROM date_trunc('week', e.occurred_at) - cu.cohort_week) / 604800))::int <= $3
),
retention_counts AS (SELECT cohort_week, week_offset, count(DISTINCT user_id)::int AS active_users FROM activity GROUP BY cohort_week, week_offset)
SELECT cs.cohort_week, cs.size, rc.week_offset, rc.active_users
FROM cohort_sizes cs LEFT JOIN retention_counts rc ON rc.cohort_week = cs.cohort_week
ORDER BY cs.cohort_week, rc.week_offset
```

Week 0 = 1.0 by construction: every user has exactly one `signup` event at `signup_at` (see `data/seed/generate_seed.sql`), and week 0's activity check is inclusive of the signup week itself, so the signup event alone satisfies it — the convention `QUERIES.md`'s correctness notes call out as a choice to state explicitly.

`EXPLAIN`, 1-week cohort window (~4,249 users): `Index Only Scan using idx_events_user_id_occurred_at`, ~430-530ms — under target. A 2-month cohort window (~35,000 users, touching most of their event history): ~3-3.5s. Tried forcing a hash join and a merge join (`enable_nestloop=off`) and raising `work_mem` to 128MB — none meaningfully improved it, because the query is legitimately processing close to a full per-user event scan across a third of the dataset at that width. This is data-volume scaling, not an indexing gap.

### `GET /v1/sessions/active`

```sql
WITH ordered AS (
  SELECT user_id, occurred_at,
    LAG(occurred_at) OVER (PARTITION BY user_id ORDER BY occurred_at) AS prev_ts
  FROM events
  WHERE occurred_at >= $1::timestamptz AND occurred_at < $2::timestamptz
    AND ($3::text IS NULL OR user_id = $3::text)
),
flagged AS (
  SELECT user_id, occurred_at,
    CASE WHEN prev_ts IS NULL OR occurred_at - prev_ts > $4::interval THEN 1 ELSE 0 END AS is_new_session
  FROM ordered
),
grouped AS (
  SELECT user_id, occurred_at, SUM(is_new_session) OVER (PARTITION BY user_id ORDER BY occurred_at) AS session_num
  FROM flagged
),
sessions AS (
  SELECT user_id, session_num, min(occurred_at) AS started_at, max(occurred_at) AS ended_at, count(*)::int AS events
  FROM grouped GROUP BY user_id, session_num
),
numbered AS (SELECT *, (ROW_NUMBER() OVER (ORDER BY user_id, started_at))::int AS seq FROM sessions)
SELECT user_id, started_at, ended_at, events, seq FROM numbered WHERE seq > $5 ORDER BY seq LIMIT $6
```

No p95 target is specified for this endpoint in `REQUIREMENTS.md`. Measured ~40-125ms for a 1-day range, well within the funnel/retention ballpark.

## Caching notes

Redis caches the three expensive aggregates named in `REQUIREMENTS.md` §4 — `timeseries`, `funnel`, `retention` — and nothing else (`top`/`latency`/`sessions` are direct queries; see the per-widget table below for why).

- **Key scheme**: `<endpoint>:v<version>:<param1>:<param2>:...`, e.g. `timeseries:v42:2026-02-01T00:00:00Z:2026-02-08T00:00:00Z:hour:purchase`. Every query parameter that affects the result is part of the key.
- **`v<version>`**: a global `events:version` counter in Redis, incremented once per `POST /v1/events` call that actually inserts new rows (skipped for pure-duplicate resends — see `api/src/routes/events.ts`). Bumping the version orphans every previously-cached key instead of requiring the ingest path to know which cached ranges a new event might overlap (which, for an arbitrary `[from, to)` query, isn't tractable to compute precisely). Orphaned entries fall out on their own TTL.
- **TTL**: 60s for `timeseries`, 120s for `funnel`/`retention`. The heavier/more expensive an aggregate, the longer its TTL — trading a bit more staleness for fewer recomputations. All three are short enough that a dashboard refresh sees new ingest within one to two minutes even without a version bump.
- **Staleness trade-off**: bounded by the TTL in the worst case (Redis down or a version bump not yet observed by a given key) — never more than 60-120s stale, and typically less since almost every write bumps the version immediately.

Redis is also the backing store for the ingest rate limiter (`api/src/rateLimit/ingestRateLimiter.ts`) — the required distributed-lock/idempotency-set/rate-limiter mechanism. Idempotency itself is DB-level (`ON CONFLICT (event_id) DO NOTHING`), so a rate limiter was the natural remaining fit, and `429` was already declared on `POST /v1/events` in `openapi.yaml` without an implementation behind it. Fixed-window counter: `INCR` a key namespaced by the current 60s bucket, `EXPIRE` it on the first hit in that window, reject past 120 batches/window. Redis rather than an in-memory counter because the limit needs to hold across however many API instances end up behind the same DB. The `INCR`/`EXPIRE` pair isn't atomic (a crash between them leaves a key with no TTL) — an accepted trade-off for a coarse, best-effort limiter; a Lua script would close that gap but wasn't warranted here.

## Data-delivery strategy (per dashboard widget)

| Widget | Strategy | Why | Measured latency |
|---|---|---|---|
| Timeseries | Direct browser → API call, server-side Redis cache (60s TTL) | Most frequently re-queried as the user adjusts bucket/date range; short TTL keeps it fresh | ~2ms cache hit, ~80-110ms cache miss |
| Funnel | Direct call, server-side Redis cache (120s TTL) | Expensive (CTE chain per step); a longer TTL than timeseries trades more staleness for fewer recomputations | ~12ms cache hit, ~350-410ms cache miss (1-week range) |
| Retention | Direct call, server-side Redis cache (120s TTL) | The heaviest of the three cached aggregates — the cache matters most here | ~12ms cache hit, ~430-530ms cache miss (1-week cohort) |
| Top-N | Direct call, no cache | Not in the required caching list; already well under 300ms via the GIN/composite indexes, and cursor pagination means most pages are one-off queries anyway — a cache would add complexity for little benefit | ~105-172ms warm |
| Latency | Direct call, no cache | Same reasoning as Top-N — consistently under 400ms via `idx_events_occurred_at` | ~112-130ms |
| Active sessions | Direct call, no cache | Operational/live data; cursor pages aren't meaningfully cacheable across requests the way a fixed aggregate is | ~40-125ms |

Client-side, every widget goes through TanStack Query with a `staleTime` matching (or close to) its server-side cache TTL, so a widget that re-renders with unchanged params doesn't even issue a network request, on top of the server-side cache absorbing the case where it does. Each widget's query key includes only the params that widget actually uses — changing the Funnel's `steps` input, for instance, refetches only `/v1/metrics/funnel`, confirmed by inspecting network requests before/after a control change. No global "refetch everything" trigger exists.

Per-widget loading/empty/error states and the "loaded in Xms" badge are handled by a single `WidgetFrame` component every widget renders through (`dashboard/src/components/WidgetFrame.tsx`), so one widget's fetch failing or being slow never blocks another's — each is an independent TanStack Query with its own status. The latency badge measures wall-clock time for the `fetch()` call itself (network + server), captured in `dashboard/src/api/client.ts`.

## What I'd do with more time

- A materialized view + scheduled refresh for retention, with the existing Redis cache layered on top — would flatten the 2-month-cohort-window cost that no amount of indexing fixes, at the cost of introducing a refresh schedule/staleness window to manage.
- Backpressure on ingest when the DB pool is saturated (return 503 instead of queueing indefinitely) rather than just the fixed-window rate limiter.
- A Lua script for the rate limiter's `INCR`+`EXPIRE` to close the small non-atomic window.
- Virtualized/windowed rendering for the Top-N and Sessions tables if `limit` were raised well above 100 rows.
- A shared `openapi.yaml`-generated type/schema layer instead of hand-mirrored TS interfaces + JSON Schema in `api/src/schemas/` and `dashboard/src/api/types.ts` — currently the three copies (spec, API schema, dashboard types) have to be kept in sync by hand.
