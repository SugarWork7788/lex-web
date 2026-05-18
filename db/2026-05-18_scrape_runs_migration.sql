-- Migration: scrape_runs observability table
-- Date applied to production: 2026-05-18
-- Idempotent: safe to re-run; uses IF NOT EXISTS.
--
-- Motivation:
--   ScraperAgent.report() currently flags a scraper as "stale" when
--   max(created_at) on its target table is > 24h old. This conflates
--   two failure modes:
--     (1) the source genuinely has nothing new (e.g. КС publishes every
--         few days — looks identical to "broken")
--     (2) the scraper is broken or never fired
--   With scrape_runs, the orchestrator can distinguish "ran successfully
--   with 0 new rows" from "didn't run since X" — the actual signal we
--   care about.
--
-- Production safety:
--   * No FKs, no triggers — clean addition. Empty table, no migration
--     impact on existing data.
--   * Two indexes for the two query shapes:
--       (scraper_name, started_at DESC)  — "latest N runs of scraper X"
--       (started_at) WHERE status='running'  — "find stuck-running rows"
--   * GRANTs per the policy effective 2026-05-30 (see .planning/CONTEXT.md).
--
-- Roll back (if needed):
--   DROP TABLE IF EXISTS public.scrape_runs;

CREATE TABLE IF NOT EXISTS public.scrape_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scraper_name  text NOT NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  rows_saved    int DEFAULT 0,
  rows_skipped  int DEFAULT 0,
  rows_failed   int DEFAULT 0,
  status        text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running', 'completed', 'failed')),
  error_text    text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scrape_runs_scraper_started
  ON public.scrape_runs (scraper_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_scrape_runs_running
  ON public.scrape_runs (started_at) WHERE status = 'running';

GRANT SELECT ON public.scrape_runs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scrape_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scrape_runs TO service_role;

COMMENT ON TABLE public.scrape_runs IS
  'One row per scraper invocation. Written by scripts/_lib/scrape_run.py context manager.';
