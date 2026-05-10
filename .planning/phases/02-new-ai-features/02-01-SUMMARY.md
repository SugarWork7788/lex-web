---
phase: 02-new-ai-features
plan: 01
subsystem: database
tags: [postgres, fts, tsvector, gin, supabase, migration, intel, immutable-wrapper]
requires: []
provides:
  - "db/intel_fts.sql (idempotent FTS migration)"
  - "scripts/apply-intel-fts.ts (Node applier with post-apply probes)"
  - "package.json db:intel-fts npm script"
  - "Live Supabase DB: 6 search_vector tsvector columns + 6 GIN indexes (<table>_fts) + intel_search_top(q text) RPC"
  - "immutable_array_to_string(text[], text) IMMUTABLE wrapper (prerequisite for prosecution_cases generated column)"
affects:
  - "Phase 02 plan 02-02 (intel ranking + UI cards) — can now call supabase.rpc('intel_search_top', { q })"
  - "Phase 02 plan 02-03 (audit PDF route) — unaffected, no shared surface"
tech-stack:
  added: []
  patterns:
    - "RESEARCH §Pattern 1: tsvector + GIN STORED generated column"
    - "RESEARCH §Pattern 2: 0.7 * ts_rank + 0.3 * exp(-age_days/365) recency-decay scoring"
    - "scripts/apply-schema.ts canonical applier shape (DATABASE_URL → pg.Client → readFileSync → query → probes)"
    - "IMMUTABLE wrapper around STABLE built-in to satisfy GENERATED ALWAYS expression contract"
key-files:
  created:
    - "db/intel_fts.sql (130 lines): 6 ALTER TABLE … search_vector tsvector GENERATED ALWAYS AS (…) STORED + 6 CREATE INDEX … USING gin(search_vector) + immutable_array_to_string wrapper + CREATE OR REPLACE FUNCTION intel_search_top"
    - "scripts/apply-intel-fts.ts (97 lines): pg.Client applier, DATABASE_URL guard, ssl rejectUnauthorized: false, post-apply probes (information_schema.columns, pg_indexes, intel_search_top smoke)"
  modified:
    - "package.json: added \"db:intel-fts\": \"tsx scripts/apply-intel-fts.ts\" + tsx ^4.20.0 in devDependencies"
    - "bun.lock: tsx + transitive deps"
decisions:
  - "Auto-fixed deviation [Rule 1]: array_to_string is STABLE in Postgres, but GENERATED ALWAYS expressions require IMMUTABLE. Created immutable_array_to_string(text[], text) LANGUAGE sql IMMUTABLE pure-passthrough wrapper before the prosecution_cases ALTER TABLE. Wrapper is safe because the underlying built-in is deterministic on text[] inputs (no catalog lookups, no locale coercion); promoting STABLE → IMMUTABLE here changes only the planner's caching contract, not behavior."
  - "Used Postgres `simple` text-search config (not 'bulgarian' — no Bulgarian dictionary in stock PG, matches lex-brain law_articles precedent)."
  - "Hardcoded 0.7 / 0.3 score blend in the SQL (canonical contract); plan 02-02 will import the same constants in TS for unit tests."
  - "1-year recency characteristic time (RECENCY_HALF_LIFE_DAYS = 365) hardcoded in /86400.0/365.0 EXTRACT divisor."
  - "Empty-query guard `length(trim(q)) > 0` inside intel_search_top — prevents websearch_to_tsquery('') silent-empty-set DoS path."
  - "No GRANT statements — intel tables already have RLS disabled (public legal-watch data); anon key already has SELECT."
metrics:
  duration: ~25 min wall (planning+execution+1 deviation cycle)
  completed: 2026-05-10
---

# Phase 02 Plan 01: Supabase tsvector + GIN intel-search FTS migration

**One-liner:** Idempotent SQL migration that adds STORED tsvector columns + GIN indexes to all 6 intel tables and a single `intel_search_top(q text)` RPC blending `0.7 * ts_rank + 0.3 * exp(-age_days/365)`, applied to the live Supabase DB so plan 02-02 can rank cross-source results in <3 s.

## What Was Built

1. **`db/intel_fts.sql`** — 130-line idempotent DDL:
   - 6 `ALTER TABLE … ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (…) STORED` blocks (sanctioned_entities, offshore_entities, olaf_cases, investigative_articles, prosecution_cases, nap_rulings) with weighted `setweight()` per RESEARCH Pattern 1.
   - 6 `CREATE INDEX IF NOT EXISTS <table>_fts ON <table> USING gin(search_vector)` indexes.
   - `CREATE OR REPLACE FUNCTION immutable_array_to_string(text[], text) RETURNS text LANGUAGE sql IMMUTABLE` wrapper (deviation — see below).
   - `CREATE OR REPLACE FUNCTION intel_search_top(q text) RETURNS TABLE (source, id, title, summary, lex, rec, score) LANGUAGE sql STABLE` — UNION ALL across 6 sources, scored by `0.7 * ts_rank + 0.3 * exp(-age_days/365)`, ordered by `score DESC`, `LIMIT 5`, with `length(trim(q)) > 0` empty-query guard.

2. **`scripts/apply-intel-fts.ts`** — pg.Client applier mirroring `scripts/apply-schema.ts`:
   - `DATABASE_URL` env-var guard (exits 1 if unset).
   - `ssl: { rejectUnauthorized: false }` for Supabase pooler.
   - `maskUrl(url)` to log target DB without leaking creds.
   - Post-apply probes: `information_schema.columns` for all 6 search_vector columns, `pg_indexes` for all 6 GIN indexes, smoke `intel_search_top('тест')` call.

3. **`package.json`** — `"db:intel-fts": "tsx scripts/apply-intel-fts.ts"` script, `tsx ^4.20.0` added to devDependencies (bun.lock updated).

4. **Live Supabase DB** — migration applied. Verified:
   - `OK: search_vector present on all 6 tables: investigative_articles, nap_rulings, offshore_entities, olaf_cases, prosecution_cases, sanctioned_entities`
   - `OK: GIN indexes present (6/6): investigative_articles_fts, nap_rulings_fts, offshore_entities_fts, olaf_cases_fts, prosecution_cases_fts, sanctioned_entities_fts`
   - `OK: intel_search_top('тест') returned 0 rows.` (function callable; 0 rows acceptable per plan)
   - EXPLAIN on `sanctioned_entities WHERE search_vector @@ websearch_to_tsquery('simple','test')` → `Bitmap Index Scan on sanctioned_entities_fts` (NOT Seq Scan).
   - `intel_search_top('a')` returns 3 rows shaped `(source, id, title, summary, lex, rec, score)` ordered by score DESC — function works end-to-end.

## Tasks

| # | Task | Type | Commit | Files |
|---|------|------|--------|-------|
| 1 | Write db/intel_fts.sql | auto | `946d5ab` | db/intel_fts.sql |
| 2 | scripts/apply-intel-fts.ts + package.json db:intel-fts | auto | `acc6783` | scripts/apply-intel-fts.ts, package.json, bun.lock |
| 3 | [BLOCKING] Apply to live Supabase DB | checkpoint:human-action | (runtime side-effect; first run failed → see Deviations) | live DB |
| — | **Deviation fix** | Rule 1 | `965793b` | db/intel_fts.sql |
| — | Final summary + state | docs | (this commit) | 02-01-SUMMARY.md, STATE.md, ROADMAP.md |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Auto-fixed deviation: array_to_string IMMUTABLE wrapper**

- **Found during:** Task 3 (BLOCKING apply to live DB)
- **Issue:** The 6th `ALTER TABLE prosecution_cases ADD COLUMN … GENERATED ALWAYS AS (…) STORED` failed because the expression contained `array_to_string(coalesce(charges, ARRAY[]::text[]), ' ')`. Postgres marks the built-in `array_to_string(anyarray, text)` as **STABLE**, but `GENERATED ALWAYS` columns require strictly **IMMUTABLE** expressions (catalog rule, enforced at expression-validation time, not at runtime). Tables 1–5 applied successfully before the failure; the partial-state was safely recovered via the migration's `IF NOT EXISTS` guards.
- **Fix:** Added a tiny pure SQL passthrough wrapper before the prosecution_cases block:
  ```sql
  CREATE OR REPLACE FUNCTION immutable_array_to_string(text[], text) RETURNS text
    LANGUAGE sql IMMUTABLE AS $$ SELECT array_to_string($1, $2) $$;
  ```
  The wrapper is safe because:
  - It is a pure SQL passthrough on `text[]` inputs — no catalog lookups, no locale-sensitive coercion, no GUC dependencies.
  - The underlying built-in is deterministic on `text[]` inputs; the STABLE marker exists for legacy ANYARRAY-coercion paths that never apply to a `text[]` argument.
  - Promoting STABLE → IMMUTABLE here only changes the planner's caching contract (allowed: GENERATED columns, expression indexes), not behavior.
  Inside the prosecution_cases generated-column expression, `array_to_string(...)` was replaced with `immutable_array_to_string(...)`.
- **Verification:** Re-ran `bun run db:intel-fts` → exit 0, all 3 OK probes green. Re-ran a second time → still exit 0, idempotent (CREATE OR REPLACE FUNCTION + IF NOT EXISTS DDL). EXPLAIN confirms `Bitmap Index Scan on sanctioned_entities_fts` is used. `intel_search_top('a')` returns 3 ranked rows shaped `(source, id, title, summary, lex, rec, score)` ordered by score DESC.
- **Files modified:** `db/intel_fts.sql` (added wrapper before block 5; replaced `array_to_string` call inside prosecution_cases generated expression).
- **Commit:** `965793b`
- **Threat impact:** None. T-02-01-01 (SQL injection) is unchanged — the wrapper takes the same parameterised `text[]` argument, no string concatenation, no dynamic SQL. T-02-01-02 (DoS via empty query) and T-02-01-03 (per-row tokenisation DoS) are unchanged — the wrapper is in the GENERATED column expression, not the query path.
- **Source-of-defect:** RESEARCH §Pattern 1 documented the `array_to_string(charges, ' ')` shape for prosecution_cases without dry-running the full ALTER TABLE against Postgres. The mismatch (STABLE built-in vs IMMUTABLE GENERATED requirement) is a catalog-validation rule that surfaces only at DDL execution. Verified shape now lives in `db/intel_fts.sql` itself.

## Authentication / Human-Action Gates

- **Task 3 (BLOCKING)** — `DATABASE_URL` was not in the executor's process env initially. User instruction directed sourcing it from `/Users/beyond/Desktop/lex-brain/.env`. Source command sourced cleanly (one inert `command not found` warning from a malformed unquoted line in that .env — unrelated; the API-key environment variable that PowerShell-style line attempted to set is not used by the applier). Migration applied successfully on first IMMUTABLE-fixed re-run.

## Verification

| Gate | Command | Result |
|------|---------|--------|
| db/intel_fts.sql shape | `grep -c "ALTER TABLE " db/intel_fts.sql` | 6 ✓ |
| 6 GIN indexes | `grep -c "CREATE INDEX IF NOT EXISTS .*_fts" db/intel_fts.sql` | 6 ✓ |
| intel_search_top function | `grep "CREATE OR REPLACE FUNCTION intel_search_top"` | 1 ✓ |
| Empty-query guard | `grep "length(trim(q)) > 0"` | present ✓ |
| Idempotency (1st apply) | `bun run db:intel-fts` | exit 0, 3 OK probes ✓ |
| Idempotency (2nd apply) | `bun run db:intel-fts` | exit 0, 3 OK probes ✓ |
| GIN index used | EXPLAIN sanctioned_entities | `Bitmap Index Scan on sanctioned_entities_fts` ✓ |
| RPC callable | `intel_search_top('a') LIMIT 3` | 3 rows shaped `(source, id, title, summary, lex, rec, score)` DESC ✓ |

## Pointer for Plan 02-02

`intel_search_top` is callable on the live Supabase DB. `lib/intel-search.ts` (plan 02-02) can call `supabase.rpc('intel_search_top', { q })` and receive the canonical ranked top-5 result set without any further DB-side work. Score formula `0.7 * ts_rank + 0.3 * exp(-age_days/365)` is the contract; plan 02-02 should import `LEX_WEIGHT = 0.7`, `RECENCY_WEIGHT = 0.3`, `RECENCY_HALF_LIFE_DAYS = 365` as TypeScript constants for unit testing of any client-side score recomputation.

## Self-Check: PASSED

- `db/intel_fts.sql` exists ✓
- `scripts/apply-intel-fts.ts` exists ✓
- `package.json` has `db:intel-fts` ✓
- Commit `946d5ab` (initial SQL) found in git log ✓
- Commit `acc6783` (applier + npm script) found in git log ✓
- Commit `965793b` (IMMUTABLE wrapper fix) found in git log ✓
- Live DB has all 6 search_vector columns + 6 _fts indexes + intel_search_top function (verified via probes + EXPLAIN + RPC smoke) ✓
