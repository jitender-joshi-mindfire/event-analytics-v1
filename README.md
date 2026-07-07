# Take-Home: Event Analytics & Metrics API + Dashboard

A senior-level **full-stack** take-home. You will build a service that **ingests product usage events** and exposes a **read API of pre-aggregated metrics**, plus a **React dashboard** that visualises all of those metrics. The hard part is not the plumbing — it is writing **correct, performant analytical SQL** over a large dataset, exposing it behind a **strict OpenAPI contract**, and making a deliberate, defensible choice about **how the dashboard gets its data** (direct query, server/client cache, materialized view, precompute/cron) — all developed **test-first**.

> Expected effort: **2–3 focused days.** We care more about correctness, SQL quality, the data-delivery strategy, and engineering judgment than about feature count or visual polish. Do fewer things excellently rather than many things partially.

---

## What we give you

| File / dir | Purpose |
|---|---|
| `REQUIREMENTS.md` | Functional + non-functional requirements. **Read this first.** |
| `openapi.yaml` | The API contract (OpenAPI 3.1). Your responses must validate against it **exactly**. |
| `data/schema.sql` | The Postgres schema (DDL) you must build on. Do not change column meanings. |
| `data/seed/generate_seed.sql` | Seed generator that produces ~**3M events**. Run it so your queries face realistic volume. |
| `data/QUERIES.md` | The analytical question behind each endpoint. **No solutions provided.** |
| `EVALUATION.md` | The acceptance criteria you are graded against. |

## What you must build (and bring)

You scaffold **everything else** yourself:

- `docker-compose.yml` bringing up **Postgres**, **Redis**, **your API service**, and **the dashboard**. `docker compose up` must boot the whole stack from a clean checkout.
- A **TypeScript** Node.js service (framework of your choice: Fastify/Express/Nest/Koa — your call).
- A **React + TypeScript** dashboard page that renders all six metrics from the API (charting/UI libraries are your choice). See `REQUIREMENTS.md` §"Frontend: Metrics Dashboard".
- **Migrations** that apply `data/schema.sql` (plus any indexes you add) and a documented way to load the seed.
- A **test suite** built test-first (TDD) running against **real** Postgres + Redis (not mocks for integration tests).
- A `Makefile` or documented npm scripts: `setup`, `migrate`, `seed`, `test`, `lint`, `typecheck`, `start` (and the frontend's `dev`/`build`).

## Hard rules

1. **TypeScript**, strict mode on. No `any` escape hatches in your own code without justification.
2. **No ORM-generated query builders for the analytical endpoints.** Write raw, parameterised SQL for everything in `data/QUERIES.md`. (An ORM/query-builder is fine for trivial CRUD/migrations if you want it.)
3. **Conform to `openapi.yaml` exactly** — paths, status codes, error envelope, pagination shape, field names and types. We validate responses against the schema automatically.
4. **TDD.** Commit history should show tests arriving before or alongside implementation. We read the git log.
5. **Performance matters.** Endpoints are timed against the seeded dataset. Add indexes deliberately and include `EXPLAIN (ANALYZE, BUFFERS)` output (see below).
6. **Don't block the event loop.** No synchronous heavy work on the request path; no unbounded in-memory aggregation that Postgres should be doing.

## What to submit

A zip or git bundle of the repo containing **everything needed to run it**, plus a `SUBMISSION.md` with:

- **Setup**: exact commands to boot, migrate, seed, and test from a clean machine.
- **Design notes**: framework choice, how you structured the code, key trade-offs.
- **SQL notes**: for each analytical endpoint, your final query and its `EXPLAIN (ANALYZE, BUFFERS)` output, plus the indexes you added and why.
- **Caching notes**: what you cache in Redis, the keying scheme, and your invalidation strategy.
- **Data-delivery strategy**: for each dashboard widget, *how* it gets its data — direct query, server cache, client cache, materialized view, or precompute/cron — and the freshness-vs-latency trade-off you chose. Include the measured latency you observed per widget. **This is a primary thing we evaluate.**
- **What you'd do with more time.**

Do **not** commit `node_modules`, build output, or the multi-GB seed data dump — commit the seed *generator*, not its output.

## How you'll be graded

See `EVALUATION.md` for the acceptance criteria. In short: we boot your stack, run your tests, type-check and lint, hit your live API and validate every response against `openapi.yaml`, check the analytical results for correctness against a reference dataset, and time the heavy endpoints. SQL quality and architecture are reviewed by hand.

Good luck — and optimise for the things that are graded.
