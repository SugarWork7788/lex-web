-- Migration: search_articles RPC perf rewrite (302 ms → 37 ms server-side)
-- Date applied to production: 2026-05-18
-- Idempotent: CREATE OR REPLACE is safe to re-run.
--
-- Motivation:
--   pg_stat_statements showed search_articles averaging 1393 ms / call over
--   96 calls. EXPLAIN ANALYZE revealed two overhead sources:
--     1. JOIN to laws happened BEFORE the LIMIT — all 160 FTS-matched
--        article rows were joined and serialized through Hash Join (~184 ms)
--     2. ts_headline ran on all 160 candidates before top-N selection
--   The fix: rank+limit inside a CTE, THEN join laws and compute headlines,
--   so each expensive operation only runs on the 50 winners.
--
-- Verified live:
--   EXPLAIN ANALYZE — 302 ms → 37 ms server-side (~8x faster).
--   Output schema (column names + types) is unchanged.
--
-- Rollback (saved at apply time to /tmp/search_articles_OLD.sql):
--   CREATE OR REPLACE FUNCTION public.search_articles(...)
--   ... (previous body — join laws + ts_headline before limit) ...

CREATE OR REPLACE FUNCTION public.search_articles(q text, lim integer DEFAULT 50)
 RETURNS TABLE(law_slug text, article_number text, chapter_title text, snippet text, rank real, law_name_bg text, category text)
 LANGUAGE sql
 STABLE
AS $function$
    WITH tq AS (
        SELECT websearch_to_tsquery('simple', q) AS tsq
    ),
    ranked AS (
        SELECT a.law_slug,
               a.article_number,
               a.chapter_title,
               a.text_content,
               ts_rank(a.tsv, (SELECT tsq FROM tq)) AS rank
        FROM law_articles a
        WHERE a.tsv @@ (SELECT tsq FROM tq)
        ORDER BY rank DESC
        LIMIT lim
    )
    SELECT r.law_slug,
           r.article_number,
           r.chapter_title,
           ts_headline('simple', r.text_content, (SELECT tsq FROM tq),
               'StartSel=<mark>, StopSel=</mark>, MaxWords=30, MinWords=15, MaxFragments=2, FragmentDelimiter=" … "'
           ) AS snippet,
           r.rank,
           l.name_bg AS law_name_bg,
           l.category
    FROM ranked r
    JOIN laws l ON l.slug = r.law_slug
    ORDER BY r.rank DESC;
$function$;
