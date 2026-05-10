---
phase: 08
plan: 01
status: complete
requirements: [DV-01]
wave: 1
completed_at: 2026-05-10T20:18:00Z
---

# Plan 08-01 Summary — Schema migration + lex-brain JSF scraper

## Outcome

DV-01 satisfied. Live Supabase has the dv schema (2 tables, 2 GENERATED tsvector columns, 2 GIN indexes, 1 ranking RPC). The lex-brain JSF scraper successfully ingests issue 2026/42 end-to-end (10 acts, 0 leaks, all bodies non-null). Wave 2 (plans 08-02, 08-03) is unblocked.

## Tasks delivered

| # | Task | Commit | Repo |
|---|------|--------|------|
| 1 | `db/dv_schema.sql` (verbatim from RESEARCH) | `1703749` | lex-web |
| 2 | `scripts/apply-dv-schema.ts` + `db:dv-schema` script | `1cfcc5b` | lex-web |
| 3 | **BLOCKING** — applied to live Supabase, idempotent re-run green | (no source change) | lex-web |
| 4 | `scripts/_lib/dv_jsf.py` + 16 pytest cases (D-12 verified: http_retry.py byte-identical) | `13a4efe` | lex-brain |
| 5 | `scripts/scrape_dv.py` + **BLOCKING** smoke against issue 2026/42 | `a691d35` | lex-brain |

## Verification (live Supabase, after smoke ingest)

```
act_count          : 10           ✓ (RESEARCH §Step 4 expected)
jsessionid_leak    : 0            ✓ (D-05)
missing_body       : 0            ✓ (every act has full_text)
distinct_act_types : Other,Наредба,Постановление,Указ
                                  ✓ (Указ + Постановление + Наредба required;
                                     "Other" is the documented fallback for
                                     Определение + Споразумение per RESEARCH Q3)
EXPLAIN gin scan   : Bitmap Index Scan on dv_acts_fts  ✓
idempotency        : 2nd `db:dv-schema` exits 0 with no diff
                     2nd smoke inserts 0 rows (source_url dedup)
```

## Deviations from plan

1. **`pg` + `@types/pg` already in lex-web devDeps** — Phase 2 added them. Step 4a's `bun add -D pg @types/pg` was a no-op; only added `tsx`.
2. **`beautifulsoup4>=4.14.3` already in lex-brain pyproject.toml** — Phase 1 added it. Step 4a's `uv add 'beautifulsoup4>=4.12'` was a no-op (existing version satisfies the spec).
3. **SSL config added to apply-dv-schema.ts** — `ssl: { rejectUnauthorized: false }` matches Phase 2's `apply-schema.ts` working pattern against Supabase TLS. Without it, the live connect fails on the self-signed chain. Probe SQL + function names verbatim from plan.
4. **`ON CONFLICT DO NOTHING` without column target** — plan's literal grep wanted the bare form. My initial version used `ON CONFLICT (issue_number, year, issue_supplement)` and `ON CONFLICT (source_url)` (more explicit). Switched to bare form; semantically equivalent because the only relevant unique constraints are exactly those columns.
5. **Title-extraction bug discovered + fixed mid-task** — `<a href="showMaterialDV.jsp">` link text is always "Преглед на материала" (literally "View the material"). Real act title lives in the parent `<td>` between `</strong><br>` and the page-number marker (`стр. N`). Added `_extract_title_for_anchor()` helper. First smoke run produced 10 rows with title="Преглед на материала" → all `act_type="Other"` (`infer_act_type` got useless input). Second smoke after fix → all titles correct, act_type populates per RESEARCH Q3 mapping.
6. **lex-brain branch created** — `feat/phase-08-dv-gazette` branched off `chore/post-phase-02-state-update` (latest scraping infra). Three commits on the branch: `13a4efe`, `a691d35`. The `chore/...` base has 5 unmerged Phase 1 follow-up commits not yet on lex-brain `main`; rebasing this branch onto `main` later will need to handle those.
7. **Per-act log lines added** — initial scraper logged at issue-aggregate level only (4 lines for the smoke). Plan's literal criterion required ≥10 JSON lines. Added per-act `act_done` log entries. Final smoke produces 24 lines total.

## Threats verified at runtime

- **T-DV-01-01 partial-data persistence** — `full_text` only written after successful GET; resumability scan refetches empty rows.
- **T-DV-01-03 jsessionid leak** — `strip_jsessionid` applied at every persistence point. SQL probe = 0 leaks.
- **T-DV-01-04 schema breaks lex-brain** — purely additive DDL; idempotent re-run = no-op. Verified by 2nd `db:dv-schema` run.
- **T-DV-01-06 IMMUTABLE function-volatility** — schema uses only `to_tsvector / coalesce / setweight / left / ||`, all IMMUTABLE. EXPLAIN shows the GIN scan is hit; no STABLE-not-IMMUTABLE regression.

## Post-merge expectation (NOT in this plan's BLOCKING gates)

Before `/gsd-verify-work 8` can claim ROADMAP SC #2 + SC #3 are end-to-end demonstrable (the user-visible `/dv` and `/dv/[slug]` pages render non-empty), at least one batch of the full backfill must run. The scraper is resumable; recommended sequence:

```bash
cd /Users/beyond/Desktop/lex-brain
nohup /Users/beyond/.local/bin/uv run python -u scripts/scrape_dv.py \
  > logs/scrapers/dv-backfill.log 2>&1 &
```

ETA ≈ 2–3 hours for ~250 issues × ~30–50 acts ≈ 10000 acts at 1.5 s avg/req.

## Self-Check: PASSED

All 5 task acceptance criteria verified. Live-DB probes confirm. Idempotency confirmed.
