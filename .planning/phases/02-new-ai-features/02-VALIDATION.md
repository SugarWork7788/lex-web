---
phase: 2
slug: new-ai-features
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-10
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Sourced from `02-RESEARCH.md` §"Validation Architecture" (lines 946–988); maps every Phase 2 requirement to either an automated check or an explicit manual UAT step.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 + @testing-library/react 16.3.2 + jsdom 29.1.1 |
| **Config file** | `vitest.config.ts` (jsdom env, `globals: true`, `@` alias to project root) — installed in Phase 1 Wave 0 |
| **Quick run command** | `bun run test -- <file>` (single file) |
| **Full suite command** | `bun run test` (all `__tests__/**/*.test.{ts,tsx}` + `lib/**/*.test.{ts,tsx}`) |
| **Estimated runtime** | ~10 s full suite at end of Phase 2 (Phase 1 baseline 8 tests in <2 s; Phase 2 adds ~6 unit + integration tests, plus 1 contract test on `lib/intel-search.ts` ranking math) |
| **Static checks** | `bunx tsc --noEmit` (TypeScript) — gates per-wave |
| **Build check** | `bun run build` — gates per-wave; verifies `outputFileTracingIncludes` glob is correct in 02-03 |

---

## Sampling Rate

- **After every task commit:** Run `bun run test -- <changed-file>` (typically <5 s)
- **After every plan wave:** Run `bun run test && bunx tsc --noEmit && bun run build` (typically <60 s combined)
- **Before `/gsd-verify-work`:** Full suite green AND all manual UAT items below ticked
- **Max feedback latency:** 60 s (per-wave gate)

---

## Per-Task Verification Map

Task IDs follow `02-{plan}-{task}` (e.g., `02-01-01` is Task 1 of plan 02-01). Test type legend: `unit` = vitest assertion, `integration` = vitest + mocked external (puppeteer / fetch), `contract` = pure-function math validation, `manual-uat` = browser/Vercel-deploy verification, `live-db` = psql probe against live Supabase.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 02-01 | 1 | INT-02 | T-02-01-02 (empty-input DoS) | `websearch_to_tsquery` silently drops malformed input; SQL function guards `length(trim(q)) > 0`; idempotent re-run is no-op | live-db | `psql $DATABASE_URL -f db/intel_fts.sql` (run twice — second is no-op) | ❌ created in 02-01 | ⬜ pending |
| 02-01-02 | 02-01 | 1 | INT-02 | — | Applier probe queries verify `search_vector` column + GIN index + `intel_search_top` function exist post-apply | unit (probe) | `bun run db:intel-fts` (exit code 0 = green; reads probe output from `scripts/apply-intel-fts.ts`) | ❌ created in 02-01 | ⬜ pending |
| 02-01-03 | 02-01 | 1 | INT-02 | — | BLOCKING: `bun run db:intel-fts` push to live Supabase succeeds; `EXPLAIN SELECT ... FROM sanctioned_entities WHERE search_vector @@ ... ` shows `Bitmap Index Scan` (proves indexes are actually used) | live-db | `bun run db:intel-fts` followed by `psql $DATABASE_URL -c "EXPLAIN ..."` | ❌ — Task 3 IS the verification | ⬜ pending |
| 02-02-01 | 02-02 | 2 | INT-02 | — | `lib/intel-search.ts` correctly shapes the RPC response, applies `LEX_WEIGHT=0.7` + `RECENCY_WEIGHT=0.3` blend, falls back to empty array on RPC error (page still renders) | unit + contract | `bun run test __tests__/intel-search-ranking.test.ts` | ❌ created in 02-02 | ⬜ pending |
| 02-02-02 | 02-02 | 2 | INT-02 | T-02-02-01 (token-budget DoS) | `/api/intel/quote` enforces `rateLimited(req, "intel-quote", { windowMs: 60_000, max: 30 })`; uses `claude-haiku-4-5`; propagates `req.signal` to upstream Anthropic stream (AI-07 preserved); returns `Content-Type: text/plain; charset=utf-8` streaming body | unit + integration | `bun run test __tests__/intel-quote-route.test.ts` (mocks `Anthropic.messages.stream`); `grep -c 'claude-haiku-4-5' app/api/intel/quote/route.ts` ≥ 1; `grep -c 'signal: req.signal' app/api/intel/quote/route.ts` ≥ 1 | ❌ created in 02-02 | ⬜ pending |
| 02-02-03 | 02-02 | 2 | INT-02 | T-02-02-02 (a11y) | `<BestMatches>` hides at 0 cross-source hits; `<BestMatchCard>` renders 6 source-pill variants with WCAG-AA color tokens; `<BestMatchQuote>` uses `aria-live="polite"` debounced (announces only on `status === 'done'`); `useRateLimitedFetch` reused | unit + component | `bun run test __tests__/best-matches.test.tsx` (renders all 6 variants); `grep -c 'aria-live="polite"' app/intel/search/best-match-quote.tsx` ≥ 1; `grep -E 'red|amber|blue|stone|purple|emerald' app/intel/search/best-match-card.tsx \| wc -l` ≥ 6 | ❌ created in 02-02 | ⬜ pending |
| 02-03-01 | 02-03 | 2 | PDF-01 | T-02-03-04 (bundle-fit) | `package.json` has `puppeteer-core` + `@sparticuz/chromium` in `dependencies` (not devDependencies); `engines.node ≥ 22.17.0`; `next.config.ts` has top-level `outputFileTracingIncludes` (NOT `experimental.outputFileTracingIncludes`); `bun run build` produces `.next/server/app/api/audit/pdf/route.js.nft.json` containing `node_modules/@sparticuz/chromium/bin/` glob entries | static + build | `jq -e '.dependencies."puppeteer-core" and .dependencies."@sparticuz/chromium" and .engines.node' package.json`; `grep -c 'outputFileTracingIncludes' next.config.ts` ≥ 1 (and grep -c 'experimental.outputFileTracingIncludes' = 0); `bun run build && jq '.files \| length' .next/server/app/api/audit/pdf/route.js.nft.json` > 100 | ❌ modified in 02-03 | ⬜ pending |
| 02-03-02 | 02-03 | 2 | PDF-01 | T-02-03-01 (puppeteer cold-start spam), T-02-03-02 (SSRF), T-02-03-03 (cache poisoning) | `/api/audit/pdf` enforces `rateLimited(req, "audit-pdf", { windowMs: 60_000, max: 5 })`; `runtime: "nodejs"`; `maxDuration: 60`; `chromium.setGraphicsMode = false`; `page.goto()` URL hardcoded to `${SITE_URL}/audit` (no user input); response is `Content-Type: application/pdf` + `Content-Disposition: attachment; filename="lex-brain-audit-<ISO-date>.pdf"` + `Cache-Control: no-store` | integration (mocked puppeteer) | `bun run test __tests__/audit-pdf-route.test.ts` — covers (a) 200 + correct content-type, (b) 429 on 6th call within 60 s, (c) `Cache-Control: no-store` header, (d) hardcoded SITE_URL only; `grep -c 'maxDuration' app/api/audit/pdf/route.ts` ≥ 1 | ❌ created in 02-03 | ⬜ pending |
| 02-03-03 | 02-03 | 2 | PDF-01 | — | `<DownloadPdfButton>` renders idle/loading/done/error states; `print:hidden` on the button wrapper; placement is right-aligned in `/audit` page header; mobile tap-target ≥ 44px (`py-2` / `py-3` per UI-SPEC self-fix) | unit + manual-uat | `bun run test __tests__/download-pdf-button.test.tsx` (idle→loading→done state transitions); UI-SPEC mobile tap-target check at 375px viewport via `@testing-library/react` measureElement OR manual UAT on preview deploy | ❌ created in 02-03 | ⬜ pending |

---

## Wave 0 Requirements

Test framework + RTL + jsdom + vitest config already exist from Phase 1 Wave 0 — **no Wave 0 framework install needed for Phase 2**. Wave 0 gaps below refer to test files that the plans themselves create as part of normal task work; flagged here so the per-task table accurately reflects "does the test file exist when this task starts."

- [ ] `db/intel_fts.sql` — covers INT-02 migration; created in plan 02-01 Task 1
- [ ] `scripts/apply-intel-fts.ts` — wraps the migration with probes; created in plan 02-01 Task 2
- [ ] `__tests__/intel-search-ranking.test.ts` — covers `lib/intel-search.ts` shape + recency math + RPC fallback; created in plan 02-02 Task 1 (TDD-mode)
- [ ] `__tests__/intel-quote-route.test.ts` — covers `/api/intel/quote` rate-limit + Haiku model + signal propagation; created in plan 02-02 Task 2
- [ ] `__tests__/best-matches.test.tsx` — covers `<BestMatches>` empty-state + `<BestMatchCard>` variant render + `aria-live` debouncing; created in plan 02-02 Task 3 (TDD-mode)
- [ ] `__tests__/audit-pdf-route.test.ts` — covers `/api/audit/pdf` route smoke + 429 + `Cache-Control` header; created in plan 02-03 Task 2
- [ ] `__tests__/download-pdf-button.test.tsx` — covers state machine + accessibility; created in plan 02-03 Task 3

---

## Manual-Only Verifications

Six items — not automatable from CI; run on the Vercel preview deploy before `/gsd-verify-work`.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Best-matches section hides when 0 cross-source hits | INT-02 | DOM-state assertion is also unit-tested, but visual confirmation that the page reflows cleanly (no empty space, per-source sections move up) is browser-only | Search for a junk query like `xqzzxqz` on `/intel/search`. Confirm: AI summary card renders, "Най-добри попадения" section is absent (NOT just empty), per-source breakdown appears immediately below the search form |
| AI quote streams in Bulgarian Cyrillic for an article card | INT-02 | Streaming token-by-token visual + Cyrillic font rendering can't be asserted in jsdom | Search for a known-good query (e.g., `"корупция"`). Confirm: in the "Най-добри попадения" section, an article card's quote streams character-by-character (cursor pulse visible briefly), settles to a 1–2 sentence Bulgarian quote, italic styling applied |
| <3 s search-to-render budget | INT-02 | Wall-clock timing on a real Vercel function with realistic data | On Vercel preview: `time curl -s -o /dev/null https://<preview>/intel/search?q=Vladimir%20Putin`. Stopwatch the round-trip from "user hits Enter" to "best-matches section visible" in a real browser. Repeat 3× and confirm median <3 s |
| Real PDF renders with `LEX.BRAIN` watermark | PDF-01 | Watermark fidelity is a print-CSS rendering question, not assertable from unit tests | On Vercel preview: `curl -o /tmp/audit.pdf https://<preview>/api/audit/pdf` then `open /tmp/audit.pdf`. Confirm: every page (page 1, 5, last) shows the diagonal `LEX.BRAIN` SVG-tile watermark at ~5.5% opacity. Open a second PDF on a different browser to confirm rendering doesn't depend on local browser print settings (per success criterion #2) |
| <10 s for 352 findings (warm) | PDF-01 | Cold/warm timing variance only manifests on Vercel infra | After making any other PDF call within the previous 5 minutes (warms the function): `time curl -o /tmp/audit.pdf https://<preview>/api/audit/pdf`. Confirm `real <10s`. Repeat 3× to establish stable warm baseline |
| <10 s for 352 findings (cold) | PDF-01 | Same as above; explicitly tests the cold path which RESEARCH Q3 budgets at 6–9 s | Wait 15 minutes idle on the function (or check Vercel logs for cold start). Then: `time curl -o /tmp/audit.pdf https://<preview>/api/audit/pdf`. Confirm `real <10s` (target) or `<15s` (acceptable; cron-pinger fallback documented in RESEARCH if observed >25% cold-rate in production) |

---

## Sampling Continuity

Per Nyquist Dimension 8: no 3 consecutive tasks may lack automated verification. Phase 2 task sequence (wave-ordered):

1. **02-01-01** (live-db) — automated via Task 2's probe + Task 3's `bun run db:intel-fts` exit code
2. **02-01-02** (unit-probe) — automated via the applier itself
3. **02-01-03** (live-db, BLOCKING) — automated via the same exit code + EXPLAIN check
4. **02-02-01** (unit + contract) — automated
5. **02-02-02** (unit + integration) — automated
6. **02-02-03** (unit + component) — automated
7. **02-03-01** (static + build) — automated
8. **02-03-02** (integration mocked) — automated
9. **02-03-03** (unit + manual-uat) — automated unit; manual portion falls inside the 6-item UAT batch above

**Continuity:** zero gaps; every task has at least one automated check that gates execution. No 3-task run lacks coverage. ✓

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify (or live-db equivalent) or explicit Wave 0 dependency
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (file gaps are created within the plans themselves; no separate Wave 0 task needed since Phase 1 already installed the framework)
- [x] No watch-mode flags (`bun run test` is `vitest run` per Phase 1 D-00 contract — non-watch)
- [x] Feedback latency < 60 s (per-wave gate)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-10
