---
phase: 8
slug: dv-gazette
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-10
---

# Phase 8 — Validation Strategy

> Per-phase validation contract. Sourced from `08-RESEARCH.md` §"Validation Architecture"; maps every Phase 8 task to either an automated check or an explicit manual UAT step.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (lex-web)** | vitest 4.1.5 + @testing-library/react 16.3.2 + jsdom 29.1.1 — installed Phase 1 Wave 0 |
| **Framework (lex-brain)** | pytest 9.0.3 + httpx — installed Phase 1 Wave 0 |
| **Config (lex-web)** | `vitest.config.ts` (jsdom env, `globals: true`, `@` alias) |
| **Quick run (lex-web)** | `bun run test -- <file>` |
| **Full suite (lex-web)** | `bun run test` |
| **Quick run (lex-brain)** | `cd /Users/beyond/Desktop/lex-brain && uv run pytest tests/<file>.py` |
| **Full suite (lex-brain)** | `cd /Users/beyond/Desktop/lex-brain && uv run pytest` |
| **Estimated runtime (combined)** | ~15 s end of Phase 8 (Phase 1+2 baseline ~12 s + ~3 s Phase 8 deltas) |
| **Static checks** | `bunx tsc --noEmit` per wave |
| **Build check** | `bun run build` per wave (required for `outputFileTracingIncludes` parity if any new tracing entries — none expected for Phase 8) |

---

## Sampling Rate

- **After every task commit:** Run `bun run test -- <changed-file>` (lex-web) or `uv run pytest tests/<file>.py` (lex-brain) — typically <5 s
- **After every plan wave:** Full suite of the affected repo + `bunx tsc --noEmit` (lex-web) — typically <60 s
- **Before `/gsd-verify-work 8`:** Full suite green AND all manual UAT items below ticked
- **Max feedback latency:** 60 s (per-wave gate)

---

## Per-Task Verification Map

Task IDs follow `08-{plan}-{task}`. Test type legend: `unit` = vitest/pytest assertion; `integration` = vitest + mocked external; `live-db` = psql probe against live Supabase; `live-net` = httpx probe against dv.parliament.bg; `manual-uat` = browser/Vercel-deploy verification.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 08-01 | 1 | DV-01 | T-DV-03 (additive schema) | Idempotent SQL: re-run is no-op; `IF NOT EXISTS` / `OR REPLACE` everywhere | live-db | `psql $DATABASE_URL -f db/dv_schema.sql` (run twice; second exit 0 with "already exists" benign warnings) | ❌ created in 08-01 | ⬜ pending |
| 08-01-02 | 08-01 | 1 | DV-01 | — | Applier probe queries verify dv_acts.search_vector + dv_issues.search_vector + 2 GIN indexes + dv_search_top function exist | unit (probe) | `bun run db:dv-schema` (exit 0 = green; reads probe output from scripts/apply-dv-schema.ts) | ❌ created in 08-01 | ⬜ pending |
| 08-01-03 | 08-01 | 1 | DV-01 | — | BLOCKING: live-DB push to Supabase succeeds; `EXPLAIN SELECT ... FROM dv_acts WHERE search_vector @@ ...` shows `Bitmap Index Scan on dv_acts_fts` | live-db | `bun run db:dv-schema` followed by `psql -c "EXPLAIN ..."` | ❌ Task 3 IS the verification | ⬜ pending |
| 08-01-04 | 08-01 | 1 | DV-01 | T-DV-02 (scraper reliability) | scripts/_lib/dv_jsf.py: extract_view_state correct on real HTML, parse_oam_submit handles 4-arg + 3-arg variants, polite-rate enforced via time.sleep stub | unit (pytest) | `cd ../lex-brain && uv run pytest tests/test_dv_jsf.py` | ❌ created in 08-01 | ⬜ pending |
| 08-01-05 | 08-01 | 1 | DV-01 | T-DV-02 | BLOCKING: smoke-test scrape of issue 2026/42 against live dv.parliament.bg; verify 10 acts ingested into dv_acts; source_url has NO jsessionid; full_text non-null for all 10 | live-net | `cd ../lex-brain && uv run python scripts/scrape_dv.py --issue 2026/42 --dry-run-db false` followed by `psql -c "SELECT COUNT(*) FROM dv_acts WHERE issue_number=42 AND year=2026"` (must equal 10) | ❌ Task 5 IS the verification | ⬜ pending |
| 08-02-01 | 08-02 | 2 | DV-02 | — | lib/dv-search.ts correctly shapes RPC response; constants exported; falls back to [] on RPC error | unit | `bun run test __tests__/dv-search.test.ts` (~12 cases — empty input, RPC error fallback, score math, filter wiring) | ❌ created in 08-02 | ⬜ pending |
| 08-02-02 | 08-02 | 2 | DV-02 | T-DV-04 (a11y) | listing card grid hides "no issues match" empty state silently when filtered to 0; detail page renders all act_type sections; nav link inserted between /issues and /compare; aria-live on AI summary debounced to status === 'done' | unit + component | `bun run test __tests__/dv-page.test.tsx __tests__/dv-issue-page.test.tsx` (TBD by planner — cover empty states + filter wiring + pill rendering) | ❌ created in 08-02 | ⬜ pending |
| 08-03-01 | 08-03 | 2 | DV-02 | T-DV-01 (token-budget DoS), T-DV-05 (cache poison) | /api/dv/summarize enforces rateLimited(req, "dv-summarize", { windowMs: 60_000, max: 10 }); uses claude-sonnet-4-6; signal: req.signal forwarded; cache hit returns 200 without Anthropic call; cache miss writes back AFTER stream completes (not on abort) | unit + integration | `bun run test __tests__/dv-summarize-route.test.ts` (~6 cases: rate-limit, model identity, signal propagation, cache hit short-circuit, cache miss write-back, abort no-poison) | ❌ created in 08-03 | ⬜ pending |
| 08-03-02 | 08-03 | 2 | DV-02 | — | grep gates: `claude-sonnet-4-6` ≥1 in route.ts; `signal: req.signal` ≥1; `dv-summarize` rate-limit key; `summary_ai` write-back; `Cache-Control: no-store` header | static | grep commands listed above; `bunx tsc --noEmit` exit 0 | ❌ created in 08-03 | ⬜ pending |

---

## Wave 0 Requirements

Test framework + RTL + jsdom + vitest config + pytest + httpx already exist from Phase 1 Wave 0 — **no Wave 0 framework install needed for Phase 8**. Only addition: `beautifulsoup4` to lex-brain for HTML parsing in scripts/_lib/dv_jsf.py — installed by plan 08-01 Task 4 itself, not Wave 0.

Wave 0 gaps below refer to test files that the plans themselves create as part of normal task work; flagged here so the per-task table accurately reflects "does the test file exist when this task starts."

- [ ] `db/dv_schema.sql` — covers DV-01 schema migration; created in plan 08-01 Task 1
- [ ] `scripts/apply-dv-schema.ts` — wraps the migration with probes; created in plan 08-01 Task 2
- [ ] `lex-brain/scripts/_lib/dv_jsf.py` + `lex-brain/tests/test_dv_jsf.py` — JSF state extraction unit tests; created in plan 08-01 Task 4
- [ ] `lex-brain/scripts/scrape_dv.py` — main scraper (smoke-tested by Task 5, no separate test file); created in plan 08-01 Task 5
- [ ] `__tests__/dv-search.test.ts` — RPC wrapper unit tests; created in plan 08-02 Task 1
- [ ] `__tests__/dv-page.test.tsx` and `__tests__/dv-issue-page.test.tsx` — component render tests; created in plan 08-02 Task 2
- [ ] `__tests__/dv-summarize-route.test.ts` — route smoke + 429 + cache logic; created in plan 08-03 Task 1

---

## Manual-Only Verifications

Six items — not automatable from CI; run on the Vercel preview deploy before `/gsd-verify-work 8`.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `/dv` listing renders 10-issue card grid in <2 s | DV-02 | Wall-clock + visual rendering on real Vercel function with realistic Supabase latency | On Vercel preview: open `/dv` in browser. Observe time-to-first-paint <2 s. Confirm: 10 issue cards, 2-col on desktop, 1-col on mobile (375px viewport). Each card shows issue # / date / act count / top-3 act-type pills. |
| `/dv/[slug]` grouped sections render correctly | DV-02 | Visual confirmation that act-type grouping matches expected order and that long acts don't break layout | Open `/dv/2026-42` (or whatever the latest issue slug is). Confirm: sections in order Закони → Наредби → Постановления → Укази → Решения → Обявления → Other. Each act card has act-type pill + title + ↗ source link. |
| AI summary streams in Bulgarian Cyrillic | DV-02 | Streaming token-by-token visual + Cyrillic font rendering can't be asserted in jsdom | Open `/dv/2026-42`, find a non-trivial Постановление or Наредба (≥1 KB body), click "✦ AI обобщение". Confirm: card expands, cursor pulse visible briefly, settles to 1–3 paragraph Bulgarian markdown summary. Click "Скрий" — card collapses. Re-click "✦ AI обобщение" same card — INSTANT (cache hit, no streaming). |
| Mobile filter density at 375px viewport | DV-02 | UI-SPEC FLAG-2 requires 375px screenshot UAT for the 4-dimension filter row | On Vercel preview at 375px wide: open `/dv`. Confirm: filter chip row + filter input row both stack to single column without horizontal overflow; tap targets ≥ 44px. Bulgarian placeholder text ("От дата" / "До дата" / etc.) doesn't overflow inputs. |
| Source link strips jsessionid | DV-01 | Verify the source_url in DB and rendered links don't carry session-bound URLs | On any `/dv/[slug]` page, right-click any "↗ Оригинал" link → Copy Link. Confirm URL has shape `https://dv.parliament.bg/DVWeb/showMaterialDV.jsp?idMat=NNNNN` with NO `;jsessionid=...`. Test in 2 different browsers. |
| Scraper polite-delay observable | DV-01 | Verify the scraper isn't hammering dv.parliament.bg | Tail `/Users/beyond/Desktop/lex-brain/logs/scrapers/dv.log` during a backfill run. Sample 30 consecutive request log lines. Confirm: average gap ≥1.5 s; no two requests within 1.0 s of each other; structured progress log (one JSON line per fetched issue). |

---

## Sampling Continuity

Per Nyquist Dimension 8: no 3 consecutive tasks may lack automated verification. Phase 8 task sequence (wave-ordered):

1. **08-01-01** (live-db) — automated via Task 2's probe + Task 3's `bun run db:dv-schema` exit code
2. **08-01-02** (unit-probe) — automated via the applier itself
3. **08-01-03** (live-db, BLOCKING) — automated via the same exit code + EXPLAIN check
4. **08-01-04** (pytest unit) — automated
5. **08-01-05** (live-net, BLOCKING) — automated via row-count assertion (10 acts ingested)
6. **08-02-01** (unit + RPC contract) — automated
7. **08-02-02** (component render) — automated
8. **08-03-01** (unit + integration) — automated
9. **08-03-02** (static + grep) — automated

**Continuity:** zero gaps; every task has at least one automated check that gates execution. No 3-task run lacks coverage. ✓

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify (or live-db / live-net equivalent) or explicit Wave 0 dependency
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (file gaps are created within the plans themselves; framework + base deps installed in Phase 1)
- [x] No watch-mode flags (`bun run test` is `vitest run` — non-watch)
- [x] Feedback latency < 60 s (per-wave gate)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-10
