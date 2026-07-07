# Analytical questions (no solutions)

Each endpoint answers one of these. The intent is described; the SQL is yours to write. Hints point at the technique we expect a senior engineer to reach for — they are not requirements about exact syntax.

## 1. `GET /v1/metrics/timeseries`
Count events per time bucket (`hour`/`day`/`week`) across `[from, to)`, optionally filtered by `event_type`. **Every bucket in the range must appear, including zeros.**

> Hint: a real aggregation joined against a generated calendar so empty buckets aren't dropped. `date_trunc` + `generate_series`, left join.

## 2. `GET /v1/metrics/funnel`
Given an ordered list of `steps` (event types) and a conversion `window`, report how many **distinct users** completed step 1, then step 2 **after** step 1, then step 3 **after** step 2, etc. — each transition within `window` of the previous step. Report per-step user counts and conversion ratio from the previous step.

> Hint: per-user ordered scan. Window functions to find the first qualifying timestamp of each step after the prior step; or a self-join chain. Beware counting users who did the steps out of order.

## 3. `GET /v1/metrics/retention`
Group users by **signup week** (cohort). For each cohort, compute the fraction still active (emitted any event) in week 0, week 1, … up to `max_weeks`. Return the cohort start date, cohort size, and the retention array.

> Hint: cohort = `date_trunc('week', signup_at)`. Activity week = weeks between signup and event. Pivot/aggregate into the grid; divide by cohort size.

## 4. `GET /v1/metrics/top`
Top-`n` values of a payload `dimension` (e.g. `page`, `product_id`) ranked by `metric` (`count`, `sum_amount`, or `unique_users`). If `group_by` is provided, rank **within each group**. Ties must break deterministically (define a stable secondary key, e.g. entity name asc).

> Hint: `ROW_NUMBER()`/`RANK()` over a partition by the group, ordered by the metric then the tiebreak. Cursor pagination over the ranked output.

## 5. `GET /v1/metrics/latency`
Compute p50/p90/p95/p99 of a numeric payload `field` (default `latency_ms`) over `[from, to)`, optionally filtered by `event_type`. Also return the sample count.

> Hint: `percentile_cont(ARRAY[...]) WITHIN GROUP (ORDER BY ...)` on the cast JSON field. Consider what index makes the cast filter cheap.

## 6. `GET /v1/sessions/active`
Split each user's event stream into sessions: a new session starts when the gap since the previous event for that user exceeds `gap_minutes`. Return each session's start, end, event count, and duration.

> Hint: classic gap-and-island. `LAG(occurred_at)` per user ordered by time → mark new-session boundaries → cumulative sum to form session ids → aggregate. Cursor pagination over (user_id, started_at).

---

### Correctness notes that bite people
- All bucketing is **UTC**. `date_trunc` on a `timestamptz` uses the session timezone — set it to UTC.
- Funnel transitions are **strictly after** the prior step (`>`, not `>=`) unless you justify otherwise.
- Retention "week 0" is the signup week itself and is `1.0` by definition only if you count the signup event as activity — state your choice.
- Percentiles: `percentile_cont` interpolates, `percentile_disc` doesn't. Pick one and be consistent; the grader allows a small tolerance.
- `unique_users` is `COUNT(DISTINCT user_id)` — don't approximate unless you document it.
