-- lex-web Phase 2 migration: intel-search FTS (tsvector + GIN + ranking function).
-- Idempotent: safe to re-run. Closes INT-02 ranking dependency.
-- Source: .planning/phases/02-new-ai-features/02-RESEARCH.md Patterns 1 + 2.
-- Per CONTEXT.md D-02: tsvector + recency. No source-authority weighting.
-- Per RESEARCH Q1: 6 intel tables had no tsvector / GIN as of 2026-05-10.

-- 1. sanctioned_entities: name + entity_type + sanctioning_body searched.
--    Recency uses created_at (no `date` column on this table).
ALTER TABLE sanctioned_entities ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(entity_type, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(sanctioning_body, '')), 'C')
  ) STORED;
CREATE INDEX IF NOT EXISTS sanctioned_entities_fts ON sanctioned_entities USING gin(search_vector);

-- 2. offshore_entities: name + entity_type + jurisdiction.
--    Recency uses created_at (no `date` column).
ALTER TABLE offshore_entities ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(entity_type, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(jurisdiction, '')), 'C')
  ) STORED;
CREATE INDEX IF NOT EXISTS offshore_entities_fts ON offshore_entities USING gin(search_vector);

-- 3. olaf_cases: title + fraud_type + full_text (truncated to first 50k chars).
ALTER TABLE olaf_cases ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(fraud_type, '')), 'B') ||
    setweight(to_tsvector('simple', left(coalesce(full_text, ''), 50000)), 'C')
  ) STORED;
CREATE INDEX IF NOT EXISTS olaf_cases_fts ON olaf_cases USING gin(search_vector);

-- 4. investigative_articles: title + summary + author + source.
ALTER TABLE investigative_articles ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(author, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(source, '')), 'D')
  ) STORED;
CREATE INDEX IF NOT EXISTS investigative_articles_fts ON investigative_articles USING gin(search_vector);

-- IMMUTABLE wrapper for array_to_string.
-- Postgres marks the built-in array_to_string(anyarray, text) as STABLE, but
-- GENERATED ALWAYS columns require strictly IMMUTABLE expressions. This
-- wrapper is a pure SQL passthrough on text[] inputs (no catalog lookups,
-- no locale-sensitive coercion), so promoting it to IMMUTABLE is safe:
-- given the same (text[], text) inputs, output is deterministic.
-- Used by the prosecution_cases.search_vector generated column below.
CREATE OR REPLACE FUNCTION immutable_array_to_string(text[], text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$ SELECT array_to_string($1, $2) $$;

-- 5. prosecution_cases: title + charges (text[]) + full_text (truncated).
ALTER TABLE prosecution_cases ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', immutable_array_to_string(coalesce(charges, ARRAY[]::text[]), ' ')), 'B') ||
    setweight(to_tsvector('simple', left(coalesce(full_text, ''), 50000)), 'C')
  ) STORED;
CREATE INDEX IF NOT EXISTS prosecution_cases_fts ON prosecution_cases USING gin(search_vector);

-- 6. nap_rulings: title + ruling_number + full_text (truncated).
ALTER TABLE nap_rulings ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(ruling_number, '')), 'A') ||
    setweight(to_tsvector('simple', left(coalesce(full_text, ''), 50000)), 'B')
  ) STORED;
CREATE INDEX IF NOT EXISTS nap_rulings_fts ON nap_rulings USING gin(search_vector);

-- Cross-source ranking function. Returns top 5 hits scored as
--   0.7 * ts_rank + 0.3 * exp(-age_days / 365)
-- LANGUAGE sql STABLE: read-only, plan-cacheable, no dynamic SQL.
-- Empty-query guard avoids the websearch_to_tsquery('') silent-empty-set pitfall (RESEARCH Pitfall 5).
CREATE OR REPLACE FUNCTION intel_search_top(q text)
RETURNS TABLE (
  source text,
  id text,
  title text,
  summary text,
  lex real,
  rec real,
  score real
)
LANGUAGE sql STABLE AS $$
  WITH tsq AS (SELECT websearch_to_tsquery('simple', q) AS v)
  SELECT * FROM (
    SELECT 'sanctioned'::text AS source, id::text, name AS title, NULL::text AS summary,
           ts_rank(search_vector, tsq.v) AS lex,
           exp(-EXTRACT(EPOCH FROM (now() - created_at)) / 86400.0 / 365.0)::real AS rec,
           (0.7 * ts_rank(search_vector, tsq.v) + 0.3 * exp(-EXTRACT(EPOCH FROM (now() - created_at)) / 86400.0 / 365.0))::real AS score
      FROM sanctioned_entities, tsq WHERE search_vector @@ tsq.v
    UNION ALL
    SELECT 'offshore', id::text, name, NULL,
           ts_rank(search_vector, tsq.v),
           exp(-EXTRACT(EPOCH FROM (now() - created_at)) / 86400.0 / 365.0)::real,
           (0.7 * ts_rank(search_vector, tsq.v) + 0.3 * exp(-EXTRACT(EPOCH FROM (now() - created_at)) / 86400.0 / 365.0))::real
      FROM offshore_entities, tsq WHERE search_vector @@ tsq.v
    UNION ALL
    SELECT 'olaf', id::text, title, fraud_type,
           ts_rank(search_vector, tsq.v),
           exp(-EXTRACT(EPOCH FROM (now() - coalesce(date::timestamptz, created_at))) / 86400.0 / 365.0)::real,
           (0.7 * ts_rank(search_vector, tsq.v) + 0.3 * exp(-EXTRACT(EPOCH FROM (now() - coalesce(date::timestamptz, created_at))) / 86400.0 / 365.0))::real
      FROM olaf_cases, tsq WHERE search_vector @@ tsq.v
    UNION ALL
    SELECT 'articles', id::text, title, summary,
           ts_rank(search_vector, tsq.v),
           exp(-EXTRACT(EPOCH FROM (now() - coalesce(date::timestamptz, created_at))) / 86400.0 / 365.0)::real,
           (0.7 * ts_rank(search_vector, tsq.v) + 0.3 * exp(-EXTRACT(EPOCH FROM (now() - coalesce(date::timestamptz, created_at))) / 86400.0 / 365.0))::real
      FROM investigative_articles, tsq WHERE search_vector @@ tsq.v
    UNION ALL
    SELECT 'prosecution', id::text, title, NULL,
           ts_rank(search_vector, tsq.v),
           exp(-EXTRACT(EPOCH FROM (now() - coalesce(date::timestamptz, created_at))) / 86400.0 / 365.0)::real,
           (0.7 * ts_rank(search_vector, tsq.v) + 0.3 * exp(-EXTRACT(EPOCH FROM (now() - coalesce(date::timestamptz, created_at))) / 86400.0 / 365.0))::real
      FROM prosecution_cases, tsq WHERE search_vector @@ tsq.v
    UNION ALL
    SELECT 'nap', id::text, title, NULL,
           ts_rank(search_vector, tsq.v),
           exp(-EXTRACT(EPOCH FROM (now() - coalesce(date::timestamptz, created_at))) / 86400.0 / 365.0)::real,
           (0.7 * ts_rank(search_vector, tsq.v) + 0.3 * exp(-EXTRACT(EPOCH FROM (now() - coalesce(date::timestamptz, created_at))) / 86400.0 / 365.0))::real
      FROM nap_rulings, tsq WHERE search_vector @@ tsq.v
  ) merged
  WHERE q IS NOT NULL AND length(trim(q)) > 0
  ORDER BY score DESC
  LIMIT 5;
$$;
