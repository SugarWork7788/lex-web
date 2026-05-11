-- lex-web Phase 8 migration: dv schema + tsvector + GIN + ranking RPC.
-- Idempotent: safe to re-run. Closes DV-01 + DV-02 schema requirements.
-- Source: .planning/phases/08-dv-gazette/08-RESEARCH.md §"Schema Deltas".

-- 1. Tables (user-supplied DDL with two corrections per RESEARCH Q4):
CREATE TABLE IF NOT EXISTS dv_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_number int NOT NULL,
  year int NOT NULL,
  issue_supplement int NOT NULL DEFAULT 0,
  date date,
  title text,
  source_url text UNIQUE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(issue_number, year, issue_supplement)
);

CREATE TABLE IF NOT EXISTS dv_acts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid REFERENCES dv_issues(id),
  issue_number int NOT NULL,
  year int NOT NULL,
  act_number text,
  title text NOT NULL,
  act_type text,
  full_text text,
  source_url text UNIQUE,
  razdel int,
  summary_ai text,
  summary_ai_generated_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 2. tsvector + GIN (simple config, weights A title / B act_type / C full_text capped at 50000 chars):
ALTER TABLE dv_acts ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(act_type, '')), 'B') ||
    setweight(to_tsvector('simple', left(coalesce(full_text, ''), 50000)), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS dv_acts_fts ON dv_acts USING gin(search_vector);

ALTER TABLE dv_issues ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A')
  ) STORED;

CREATE INDEX IF NOT EXISTS dv_issues_fts ON dv_issues USING gin(search_vector);

-- 2a. FK index for dv_acts.issue_id (Phase 8.1 — added per RESEARCH §Q4 caveat).
-- Postgres does NOT auto-index FOREIGN KEY columns. The refetch predicate's
-- LEFT JOIN dv_issues × dv_acts uses a Seq Scan on dv_acts without this; at
-- ~120K acts after the 2-year backfill that becomes painful.
CREATE INDEX IF NOT EXISTS dv_acts_issue_id_idx ON dv_acts(issue_id);

-- 3. Ranking RPC (mirrors Phase 2's intel_search_top blend 0.7 ts_rank + 0.3 recency_decay, half-life 365 days):
CREATE OR REPLACE FUNCTION dv_search_top(
  q text,
  filter_year int DEFAULT NULL,
  filter_act_type text DEFAULT NULL,
  filter_from_date date DEFAULT NULL,
  filter_to_date date DEFAULT NULL,
  filter_from_issue int DEFAULT NULL,
  filter_to_issue int DEFAULT NULL,
  limit_n int DEFAULT 50
) RETURNS TABLE (
  id uuid,
  issue_id uuid,
  issue_number int,
  year int,
  date date,
  title text,
  act_type text,
  source_url text,
  lex real,
  rec real,
  score real
) LANGUAGE sql STABLE AS $$
  WITH q_ts AS (
    SELECT websearch_to_tsquery('simple', q) AS query
  )
  SELECT
    a.id,
    a.issue_id,
    a.issue_number,
    a.year,
    i.date,
    a.title,
    a.act_type,
    a.source_url,
    ts_rank(a.search_vector, q_ts.query) AS lex,
    exp(-EXTRACT(EPOCH FROM (now() - i.date::timestamptz)) / (365.0 * 86400)) AS rec,
    (0.7 * ts_rank(a.search_vector, q_ts.query)
       + 0.3 * exp(-EXTRACT(EPOCH FROM (now() - i.date::timestamptz)) / (365.0 * 86400))
    ) AS score
  FROM dv_acts a
  JOIN dv_issues i ON i.id = a.issue_id
  CROSS JOIN q_ts
  WHERE length(trim(q)) > 0
    AND a.search_vector @@ q_ts.query
    AND (filter_year IS NULL OR a.year = filter_year)
    AND (filter_act_type IS NULL OR a.act_type = filter_act_type)
    AND (filter_from_date IS NULL OR i.date >= filter_from_date)
    AND (filter_to_date IS NULL OR i.date <= filter_to_date)
    AND (filter_from_issue IS NULL OR a.issue_number >= filter_from_issue)
    AND (filter_to_issue IS NULL OR a.issue_number <= filter_to_issue)
  ORDER BY score DESC
  LIMIT limit_n;
$$;
