-- Migration: created_at DESC indexes for scraper observability tables.
-- Date applied to production: 2026-05-18.
-- Idempotent: safe to re-run; uses IF NOT EXISTS.
--
-- Motivation:
--   pg_stat_statements showed `SELECT max(created_at), count(*) FROM <table>`
--   (used by ScraperAgent._last_row, called every 4h by the orchestrator)
--   averaging 1063 ms on kzk_decisions and 66 ms on court_decisions.
--   None of the scraper-feed tables had a created_at index — every call did
--   a sequential scan.
--
--   These indexes back up freshness queries on the orchestrator and the
--   check_freshness.py daily run, and they'll also accelerate any future
--   "latest N rows" queries on these tables.
--
-- Required from 2026-05-30 policy:
--   Note: these tables already have explicit GRANTs (audited 2026-05-14 —
--   see .planning/CONTEXT.md). This migration only adds indexes; it does
--   not alter table grants.
--
-- Production safety:
--   * CONCURRENTLY = no exclusive locks. Reads and writes proceed during build.
--   * CONCURRENTLY requires autocommit (run each statement separately, NOT
--     inside a transaction block — psql wraps -f files in transactions by
--     default, so run each line manually OR use psql -1=off, OR psycopg2
--     with conn.autocommit = True).
--   * Build is single-pass on tables this size (<15k rows): all five built
--     in 4.3 s total wall-clock. Already applied to production.
--
-- Roll back (if needed):
--   DROP INDEX CONCURRENTLY IF EXISTS public.idx_kzk_decisions_created_at;
--   DROP INDEX CONCURRENTLY IF EXISTS public.idx_court_decisions_created_at;
--   DROP INDEX CONCURRENTLY IF EXISTS public.idx_bnb_decisions_created_at;
--   DROP INDEX CONCURRENTLY IF EXISTS public.idx_eu_regulations_created_at;
--   DROP INDEX CONCURRENTLY IF EXISTS public.idx_dv_acts_created_at;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kzk_decisions_created_at
  ON public.kzk_decisions (created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_court_decisions_created_at
  ON public.court_decisions (created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bnb_decisions_created_at
  ON public.bnb_decisions (created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_eu_regulations_created_at
  ON public.eu_regulations (created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dv_acts_created_at
  ON public.dv_acts (created_at DESC);

-- Verify after applying:
--   SELECT tablename, indexname FROM pg_indexes
--   WHERE schemaname='public' AND indexname LIKE 'idx_%_created_at'
--   ORDER BY tablename;
