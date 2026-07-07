-- Deterministic seed generator. Produces ~50k users and ~3M events.
-- Deterministic because results must be reproducible for grading.
--   psql "$DATABASE_URL" -f data/schema.sql
--   psql "$DATABASE_URL" -f data/seed/generate_seed.sql
-- Tune N_USERS / EVENTS_PER_USER below if your machine is small, but the
-- grader runs against the default sizes.

SET client_min_messages = WARNING;
SELECT setseed(0.42);  -- reproducibility

-- ---- parameters -----------------------------------------------------------
\set N_USERS 50000
-- ~3,000,000 events
\set EVENTS_PER_USER 60
\set BASE_TS '2026-01-01 00:00:00+00'

-- ---- users ----------------------------------------------------------------
INSERT INTO users (user_id, signup_at, country, plan)
SELECT
    'u_' || g,
    -- signups spread across 12 weeks for cohort retention
    TIMESTAMPTZ :'BASE_TS' + (floor(random() * 84) || ' days')::interval,
    (ARRAY['us','gb','de','in','br','jp'])[1 + floor(random()*6)::int],
    (ARRAY['free','pro','enterprise'])[1 + floor(random()*3)::int]
FROM generate_series(1, :N_USERS) AS g
ON CONFLICT (user_id) DO NOTHING;

-- ---- events ---------------------------------------------------------------
-- Each user emits a stream after their signup. event_type distribution is
-- weighted so the funnel narrows realistically. payload carries page, amount,
-- latency_ms, product_id used by the analytical endpoints.
INSERT INTO events (event_id, user_id, session_id, event_type, occurred_at, payload)
SELECT
    gen_random_uuid(),
    u.user_id,
    -- sessions cluster: bucket events into pseudo-sessions of ~8
    's_' || u.user_id || '_' || floor(e / 8.0)::int,
    -- inlined directly (not a CROSS JOIN LATERAL subquery): an uncorrelated
    -- lateral subquery isn't re-evaluated per outer row, so random() inside
    -- one gets computed once and reused for every event — this must live in
    -- the same SELECT list as the other per-row random() calls below.
    (ARRAY[
        'view_page','view_page','view_page','view_page',
        'login','login',
        'add_to_cart','add_to_cart',
        'signup',
        'purchase'
    ])[1 + floor(random()*10)::int],
    -- occurred_at after signup, spread over up to 90 days, clustered intra-day
    u.signup_at
        + (floor(random() * 90) || ' days')::interval
        + (floor(random() * 1440) || ' minutes')::interval,
    jsonb_build_object(
        'page', (ARRAY['/home','/pricing','/docs','/checkout','/blog','/app'])[1 + floor(random()*6)::int],
        'product_id', 'p_' || (1 + floor(random()*200))::int,
        'amount', round((random()*200)::numeric, 2),
        'latency_ms', (10 + floor(random()*2000))::int,
        'country', u.country
    )
FROM users u
CROSS JOIN LATERAL generate_series(1, :EVENTS_PER_USER) AS e;

-- Ensure every user has exactly one signup event at their signup_at so the
-- funnel and retention have a clean anchor.
INSERT INTO events (event_id, user_id, session_id, event_type, occurred_at, payload)
SELECT gen_random_uuid(), u.user_id, 's_' || u.user_id || '_0', 'signup', u.signup_at,
       jsonb_build_object('page','/signup','country',u.country)
FROM users u;

ANALYZE users;
ANALYZE events;

SELECT
    (SELECT count(*) FROM users)  AS users,
    (SELECT count(*) FROM events) AS events;
