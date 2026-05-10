---
phase: 02-new-ai-features
verified: 2026-05-10T11:58:00Z
status: human_needed
score: 3/3 success criteria verified (architecturally; 6 manual UAT items deferred to Vercel preview)
overrides_applied: 0
re_verification:
  previous_status: null
gaps: []
human_verification:
  - test: "Live <3 s search-to-render budget on Vercel preview deploy"
    expected: "On Vercel preview: time curl https://<preview>/intel/search?q=Vladimir%20Putin — median wall-clock <3 s across 3 runs from search submit to BestMatches paint"
    why_human: "Wall-clock timing on real Vercel function infra; Promise.all([searchAll, searchTopRanked]) shape verified locally but the SC1 <3 s budget is a measurement, not a static check"
  - test: "AI Haiku quote streams in Bulgarian Cyrillic for an article card"
    expected: "Search 'корупция' on /intel/search; in the Best matches section, an article card's quote streams character-by-character (red-500 cursor pulse visible briefly) and settles to a 1–2 sentence Bulgarian quote in italic"
    why_human: "Streaming token-by-token visual + Cyrillic font rendering can't be asserted in jsdom; component contract is unit-tested but the visible rendering fidelity is browser-only"
  - test: "Best matches section visually hides on 0-hit query"
    expected: "Search 'xqzzxqz' on /intel/search; the page should jump from IntelSearchSummary directly to the per-source ResultGroups with NO empty space and NO empty-state copy"
    why_human: "DOM-state assertion is unit-tested (items.length === 0 ⇒ null), but visual reflow confirmation is browser-only"
  - test: "Real PDF watermark visual fidelity on the actual Vercel-deployed PDF"
    expected: "On Vercel preview: curl -o /tmp/audit.pdf https://<preview>/api/audit/pdf; open /tmp/audit.pdf; every page (page 1, mid, last) shows the diagonal LEX.BRAIN SVG-tile watermark at ~5.5% opacity. Open the PDF on a second browser to confirm rendering doesn't depend on local print settings."
    why_human: "Watermark fidelity is a print-CSS rendering question — globals.css @media print is the renderer; this verifier confirmed empty diff on origin/main..HEAD but pixel-level fidelity must be eyeballed"
  - test: "<10 s warm timing on Vercel preview"
    expected: "After making any other PDF call within the previous 5 minutes (warms the function): time curl -o /tmp/audit.pdf https://<preview>/api/audit/pdf — real <10 s. Repeat 3× to establish a stable warm baseline."
    why_human: "Cold/warm timing variance only manifests on Vercel infra; mock-puppeteer unit test does not exercise real chromium cold-start"
  - test: "<10 s cold timing on Vercel preview"
    expected: "Wait 15 minutes idle on the function (or check Vercel logs for cold-start). Then: time curl -o /tmp/audit.pdf https://<preview>/api/audit/pdf — real <10 s (target) or <15 s (acceptable; cron-pinger fallback documented in RESEARCH if observed >25% cold-rate)."
    why_human: "Same as above; cold-start budget RESEARCH Q3 is 6–9 s; only Vercel infra exposes the real cold path"
warnings:
  - issue: "VALIDATION row 02-03-03 listed `bun run test __tests__/download-pdf-button.test.tsx` as the automated check; the test file does not exist"
    severity: warning
    impact: "Component state machine (idle/loading/done/error) is exercised only manually (mobile tap-target check in 02-03-PLAN.md acceptance) — there is no regression test for the click → blob download path. The route handler IS unit tested in audit-pdf-route.test.ts; the missing piece is the client-side state machine of <DownloadPdfButton />."
    rationale_for_not_blocking: "02-03-PLAN.md Task 3's binding verify gate is a grep matrix + mobile tap-target check, NOT a unit test. The unit test was over-spec'd in 02-VALIDATION.md (a derived planning doc). PDF-01 success criteria #1 and #2 are observably true (manual+UAT); SC3 is tested at the route level. Suggest closure plan: spin up `__tests__/download-pdf-button.test.tsx` in a follow-up to cover the state machine before Phase 3 lands."
---

# Phase 2: New AI features — Verification Report

**Phase Goal:** Ship the next round of user-visible AI value — better intel search, downloadable audit PDF.
**Verified:** 2026-05-10T11:58:00Z
**Status:** human_needed (3/3 architecturally verified; 6 manual UAT items deferred per VALIDATION §"Manual-Only Verifications")
**Re-verification:** No — initial verification

## Goal Achievement

### ROADMAP Success Criteria (the 3 things that MUST be true)

| # | Success Criterion | Status | Evidence |
|---|-------------------|--------|----------|
| 1 | `/intel/search` returns ranked, multi-source results in <3 s; quotes are extractable and clickable | ✓ ARCHITECTURALLY VERIFIED + ⚠ <3 s deferred to UAT | Live DB has `intel_search_top` RPC with 0.7\*ts_rank + 0.3\*exp(-age/365) blend (db/intel_fts.sql:78–130). `lib/intel-search.ts:75–96` calls it via `supabase.rpc('intel_search_top', {q})` with empty-array fallback. `app/intel/search/page.tsx:54` uses `Promise.all([searchAll, searchTopRanked])` for parallel exec. `<BestMatches>` rendered between IntelSearchSummary and ResultGroups (page.tsx:102–104). 6 source-pill variants verified (best-match-card.tsx:23–47). Quote extraction streams Haiku 4.5 (api/intel/quote/route.ts:62) with `signal: req.signal` (line 74). |
| 2 | `/audit?format=pdf` (per D-11: `/api/audit/pdf`) returns a single PDF file with `LEX.BRAIN` watermark, regardless of browser print settings | ✓ ARCHITECTURALLY VERIFIED | `app/api/audit/pdf/route.ts:17–106` uses puppeteer-core + @sparticuz/chromium (D-08), navigates `${SITE_URL}/audit` with `networkidle0`, calls `page.pdf({format:'A4', printBackground:true})`. **D-09 watermark fidelity proof: `git diff origin/main..HEAD -- app/globals.css` returns 0 lines** — the existing `@media print` block is the verbatim renderer. `printBackground: true` triggers it. Visual fidelity is the only deferred check. |
| 3 | Audit PDF download fires <10 s for the full 352-finding report | ✓ ARCHITECTURALLY VERIFIED + ⚠ live timing deferred to UAT | `runtime: "nodejs"`, `maxDuration: 60` (route.ts:21–22) — 6× headroom over 10 s. `chromium.setGraphicsMode = false` (line 39) saves ~500 ms cold. `page.goto(...)` timeout is 25 s (line 68). Mocked-puppeteer test confirms response shape (audit-pdf-route.test.ts:53–90). Cold/warm wall-clock measurement requires Vercel preview — deferred per VALIDATION §"Manual-Only Verifications". |

**Score:** 3/3 success criteria verified at the architecture/contract level. 6 manual UAT items required for full SC closure (visual + wall-clock).

---

## Per-Criterion Detail

### SC1 — Intel search v2 (INT-02)

**Required artifacts (verified):**

| Artifact | Status | Evidence |
|----------|--------|----------|
| `lib/intel-search.ts` exports `searchTopRanked` | ✓ VERIFIED | Line 75: `export async function searchTopRanked(q: string, limit = 5): Promise<RankedRow[]>`. Calls `supabase.rpc("intel_search_top", { q: trimmed })` (line 82). |
| Constants `LEX_WEIGHT=0.7`, `RECENCY_WEIGHT=0.3`, `RECENCY_HALF_LIFE_DAYS=365` exported | ✓ VERIFIED | Lines 20, 23, 26 — exact values. |
| RPC error fallback returns `[]` | ✓ VERIFIED | Lines 83–88 (RPC error) + 91–95 (RPC throw). |
| `db/intel_fts.sql` has `intel_search_top` with right signature | ✓ VERIFIED | Lines 78–88: `RETURNS TABLE (source text, id text, title text, summary text, lex real, rec real, score real) LANGUAGE sql STABLE`. Empty-query guard `length(trim(q)) > 0` at line 127. |
| `/api/intel/quote/route.ts` uses `claude-haiku-4-5` (D-04) | ✓ VERIFIED | Line 62: `model: "claude-haiku-4-5"`. |
| `/api/intel/quote/route.ts` rate-limited `intel-quote` 30/min | ✓ VERIFIED | Line 40: `rateLimited(req, "intel-quote", { windowMs: 60_000, max: 30 })`. |
| `/api/intel/quote/route.ts` propagates `signal: req.signal` (AI-07 / Pitfall 7) | ✓ VERIFIED | Line 74: `{ signal: req.signal }`. |
| `<BestMatches>` rendered between `IntelSearchSummary` and per-source `ResultGroup`s | ✓ VERIFIED | `app/intel/search/page.tsx:102–104` — order: IntelSearchSummary → BestMatches → 6 ResultGroups. |
| `<BestMatches>` hides at 0 cross-source hits (D-01) | ✓ VERIFIED | `app/intel/search/best-matches.tsx:22`: `if (items.length === 0) return null;`. |
| `<BestMatchCard>` has 6 source-pill variants (red/amber/blue/stone/purple/emerald) | ✓ VERIFIED | best-match-card.tsx:22–47 — `SOURCE_PILL` map with 6 verbatim Tailwind class strings + Bulgarian labels (Санкции, Офшор, OLAF, Журналистика, Прокуратура, НАП). All AA-compliant per UI-SPEC. |
| `<BestMatchQuote>` for articles only; uses `useRateLimitedFetch` (D-06) | ✓ VERIFIED | best-match-card.tsx:68 (`isArticle = row.source === "articles"`); best-match-quote.tsx:40 (hook), :52 (`rl.submit`). |
| `<BestMatchQuote>` aria-live debounced on `status === 'done'` | ✓ VERIFIED | best-match-quote.tsx:117 (visible `<p aria-hidden>`); :126–128 (`<span sr-only aria-live="polite">{status === "done" ? text : ""}`). |
| Non-article sources render source-row verbatim (no AI quote) | ✓ VERIFIED | best-match-card.tsx:94–103 — `<p className="text-sm leading-relaxed text-stone-200">{row.summary || "—"}</p>` for non-article. Eyebrow uses stone-400, not red-400, per accent budget. |

**Live DB sanity:** 02-01-SUMMARY.md confirms migration applied to live Supabase. `OK: search_vector present on all 6 tables`, `OK: GIN indexes present (6/6)`, `OK: intel_search_top('тест') returned 0 rows`. EXPLAIN on sanctioned_entities returned `Bitmap Index Scan on sanctioned_entities_fts` (proves indexes used, not Seq Scan). Idempotency confirmed via re-run.

### SC2 — Audit PDF watermark (PDF-01)

**Required artifacts (verified):**

| Artifact | Status | Evidence |
|----------|--------|----------|
| `/api/audit/pdf/route.ts` exists | ✓ VERIFIED | File present; `bun run build` registers `/api/audit/pdf` as ƒ (Dynamic). |
| `runtime: "nodejs"`, `maxDuration: 60` (D-13) | ✓ VERIFIED | route.ts:21–22. Plus `dynamic = "force-dynamic"` at line 23. |
| Rate-limited `audit-pdf` 5/min | ✓ VERIFIED | route.ts:29: `rateLimited(req, "audit-pdf", { windowMs: 60_000, max: 5 })`. Test exercises 6th-call 429 path. |
| Uses `puppeteer-core` + `@sparticuz/chromium` (D-08) | ✓ VERIFIED | Lines 17–18 imports; deps in package.json (puppeteer-core@^24.43.0, @sparticuz/chromium@^148.0.0 in `dependencies`, NOT devDependencies). |
| `chromium.executablePath()`, `chromium.headless = "shell"`, `chromium.setGraphicsMode = false` | ✓ VERIFIED | Line 39 (setGraphicsMode), 54 (`headless: "shell"` in defaultArgs), 56 (`executablePath: await chromium.executablePath()`), 57 (`headless: "shell"` literal at launch). |
| `page.goto(${SITE_URL}/audit, { waitUntil: 'networkidle0' })` | ✓ VERIFIED | Line 66–69; SITE_URL falls back to `https://lex-web-eta.vercel.app`. Timeout 25 s (under maxDuration). |
| `page.pdf({ format: 'A4', printBackground: true, margin: ... })` | ✓ VERIFIED | Lines 74–79. `printBackground: true` is the watermark trigger. Margins (1.6cm/1.3cm) match the existing `@page` rule in globals.css. |
| Response: `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="lex-brain-audit-<ISO>.pdf"`, `Cache-Control: no-store` | ✓ VERIFIED | Lines 89–93. ISO date generated from `new Date().toISOString().slice(0,10)` (line 81). Test confirms shape (audit-pdf-route.test.ts:65–69). |
| **D-09: globals.css unchanged** | ✓ VERIFIED | `git diff origin/main..HEAD -- app/globals.css` returns 0 lines. The existing `@media print` block is rendered verbatim by puppeteer; this is the contract. |
| `<DownloadPdfButton>` mounted on `/audit` with `print:hidden` | ✓ VERIFIED | `app/audit/page.tsx:4` (import), :100 (`<DownloadPdfButton className="print:hidden" />`). Wrapper is a flex container at :92 (stats `<ul>` + button). Stats remain in printed PDF; button does not. |
| `<DownloadPdfButton>` uses `useRateLimitedFetch` (D-06) | ✓ VERIFIED | download-pdf-button.tsx:22 (import), :31 (use), :39 (`rl.submit("/api/audit/pdf", ...)`). |
| Bulgarian copy verbatim per UI-SPEC | ✓ VERIFIED | "Свали като PDF" (idle), "Генерирам PDF…" (loading), "Свален ✓" (done), "~10 секунди · A4 · с воден знак LEX.BRAIN" (helper), "Неуспешно генериране на PDF" (error), "Опитай отново", "Затвори" — all present. |
| Error toast: `role="alert"` + `aria-live="assertive"` (UI-SPEC §"Error toast for PDF failure") | ✓ VERIFIED | download-pdf-button.tsx:121–123. |
| Sr-only `aria-live="polite"` announces "PDF файлът е свален." once on idle→done | ✓ VERIFIED | download-pdf-button.tsx:65 (set), :109–111 (sr-only span). |

**NFT trace verification (Pitfall 3):** `.next/server/app/api/audit/pdf/route.js.nft.json` contains 588 traced files including all 4 chromium brotli archives:
- `node_modules/@sparticuz/chromium/bin/al2023.tar.br`
- `node_modules/@sparticuz/chromium/bin/chromium.br`
- `node_modules/@sparticuz/chromium/bin/fonts.tar.br`
- `node_modules/@sparticuz/chromium/bin/swiftshader.tar.br`

Narrow `node_modules/@sparticuz/chromium/bin/**/*` glob is sufficient. No widening to `lib/**/*` required.

**`outputFileTracingIncludes` shape verification:** Top-level key in next.config.ts:48–50 (NOT under `experimental.*` — that was the Next 14 placement, promoted to stable since v15). 0 occurrences of `experimental.outputFileTracingIncludes` (correctly absent).

### SC3 — <10 s for 352-finding report

| Architecture support | Status | Evidence |
|----------------------|--------|----------|
| `maxDuration: 60` runtime ceiling | ✓ VERIFIED | route.ts:22 — 6× headroom over 10 s. |
| `chromium.setGraphicsMode = false` saves cold-start | ✓ VERIFIED | route.ts:39 — RESEARCH Q3 estimates ~500 ms savings. |
| `page.goto({ waitUntil: 'networkidle0', timeout: 25_000 })` | ✓ VERIFIED | route.ts:66–69 — timeout fits inside maxDuration. |
| Page navigation target is `/audit` (server-rendered with `revalidate: 60` ISR) | ✓ VERIFIED | route.ts:66 — puppeteer hits the live URL; ISR cache means warm fetch. |
| Bundle math: 79 MB combined fits 250 MB Vercel cap | ✓ VERIFIED | 02-03-SUMMARY.md confirmed via `du -sh` (66 MB chromium + 13 MB puppeteer-core). |

Wall-clock <10 s test is manual UAT per VALIDATION.md "Manual-Only Verifications" rows 5+6. Architectural support confirmed; cold + warm timing must be verified on Vercel preview.

---

## Locked-Decision Audit (D-01 → D-13)

| Decision | Description | Status | Evidence |
|----------|-------------|--------|----------|
| D-01 | Hybrid layout: 5 best matches above per-source breakdown; hide at 0 hits | ✓ HONORED | page.tsx:102–104 (mount order); best-matches.tsx:22 (silent hide) |
| D-02 | Ranking signal = tsvector + recency (0.7/0.3 blend) | ✓ HONORED | db/intel_fts.sql:78–130 (SQL); lib/intel-search.ts:20,23,26 (TS mirror) |
| D-03 | Per-source-type quote attribution (AI for articles, verbatim for others) | ✓ HONORED | best-match-card.tsx:68 (variant split), :87–103 (separate render branches) |
| D-04 | AI quote uses claude-haiku-4-5 (NOT sonnet) | ✓ HONORED | api/intel/quote/route.ts:62 |
| D-05 | Existing `/api/intel/search` summary endpoint stays as page-top card | ✓ HONORED | page.tsx:102 mounts IntelSearchSummary unchanged; new endpoint is a sibling at `/api/intel/quote` |
| D-06 | `useRateLimitedFetch` for any new client-side fetches | ✓ HONORED | best-match-quote.tsx:40+52 (hook); download-pdf-button.tsx:31+39 (hook); bare `fetch(` absent in new components |
| D-07 | Reuse Phase-1 structured-log pattern; no new salts/log libraries | ✓ HONORED | Both new routes call `rateLimited(...)` which emits the existing JSON one-liner; no new event names declared |
| D-08 | Renderer = puppeteer-core + @sparticuz/chromium | ✓ HONORED | api/audit/pdf/route.ts:17–18; package.json deps |
| D-09 | PDF route reuses existing `/audit` render path verbatim — globals.css EMPTY DIFF | ✓ HONORED | `git diff origin/main..HEAD -- app/globals.css` = 0 lines |
| D-10 | Synchronous in-browser download under 10 s | ✓ HONORED | route.ts:86 returns binary `Response`; download-pdf-button.tsx:55–64 blob → `<a download>` click |
| D-11 | Route shape `/api/audit/pdf` (not `/audit?format=pdf`) | ✓ HONORED | File path `app/api/audit/pdf/route.ts` |
| D-12 | UI trigger = single "Свали като PDF" button on `/audit` | ✓ HONORED | page.tsx:100; component renders single button (download-pdf-button.tsx:91–112) |
| D-13 | runtime nodejs, maxDuration 60 | ✓ HONORED | route.ts:21–22 |

**13/13 decisions verified.**

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INT-02 | 02-01, 02-02 | Intel AI search v2 — better ranking, multi-source quote-style results, more responsive streaming | ✓ SATISFIED | REQUIREMENTS.md:78 marked complete. Live RPC + Promise.all parallel + Haiku 4.5 streaming + 6 source-pill variants + best-matches hide-at-0. |
| PDF-01 | 02-03 | Server-rendered single-file PDF export of /audit with LEX.BRAIN watermark | ✓ SATISFIED | REQUIREMENTS.md:79 marked complete. `/api/audit/pdf` route via puppeteer-core + @sparticuz/chromium triggers existing `@media print` block (globals.css empty diff). `<DownloadPdfButton />` on /audit stats row. |

Both v2.2 Phase 2 requirements are marked complete in REQUIREMENTS.md and have implementation evidence in the codebase.

---

## Test Results

| File | Tests | Status |
|------|-------|--------|
| `__tests__/rate-limit.test.ts` (Phase 1) | 4 | ✓ pass |
| `__tests__/use-rate-limited-fetch.test.tsx` (Phase 1) | 4 | ✓ pass |
| `__tests__/intel-search-ranking.test.ts` (02-02) | 12 | ✓ pass |
| `__tests__/intel-quote-route.test.ts` (02-02) | 8 | ✓ pass |
| `__tests__/best-matches.test.tsx` (02-02) | 11 | ✓ pass |
| `__tests__/audit-pdf-route.test.ts` (02-03) | 3 | ✓ pass |
| **Total** | **42 passed / 42 total** | ✓ green |

Phase 2 added **34 new tests** (12 + 8 + 11 + 3). 02-02-SUMMARY.md mentions 31; the difference is the 3 audit-pdf-route smoke tests from 02-03.

**Type check:** `bunx tsc --noEmit` exits 0.
**Build:** `bun run build` exits 0; both `/api/audit/pdf` and `/api/intel/quote` registered as ƒ (Dynamic). Compilation in 1.3 s.

---

## Gaps & Warnings

### Warning (non-blocking)

**W-1: `__tests__/download-pdf-button.test.tsx` not created**

- VALIDATION.md row 02-03-03 listed `bun run test __tests__/download-pdf-button.test.tsx` as the automated test for the `<DownloadPdfButton>` state machine.
- The file does NOT exist. 02-03-SUMMARY.md `key-files.created` does not include it; only `audit-pdf-route.test.ts` is listed.
- 02-03-PLAN.md Task 3's binding verify gate (lines 776–818) is a grep matrix + manual mobile tap-target check, NOT a unit test. The PLAN's `<must_haves>` likewise lists only `audit-pdf-route.test.ts` as a required test artifact (line 912–914).
- **Net assessment:** the binding plan contract (PLAN.md) was satisfied; the validation matrix (VALIDATION.md) over-spec'd a unit test that the plan did not require. Component state machine is exercised only manually.
- **Impact:** No regression test for click → blob download / state transitions / error toast / retry path. Route handler IS unit-tested.
- **Recommendation:** Spin up `__tests__/download-pdf-button.test.tsx` in a follow-up plan (Phase 3 carry-over candidate) covering: idle→loading→done transition, error toast appearance on 5xx, retry button re-fires fetch, sr-only announce content on done. Estimated ~30 min, ~6 vitest cases. Not blocking — PDF-01 can ship; this is regression hygiene.

### Anti-pattern scan

No TODO / FIXME / placeholder / "coming soon" comments in any of the 8 new/modified Phase 2 files. The `'—'` literals in best-match-card.tsx (lines 85, 100) and the page.tsx ResultGroup `empty="—"` (line 108) are intentional empty-state copy, not stubs. The `[]` and `{}` returns in `lib/intel-search.ts` are intentional graceful-degradation fallbacks, also not stubs. Mocked-puppeteer test data (`new Uint8Array([0x25, 0x50, 0x44, 0x46])` = `%PDF`) is a test-only %PDF magic header.

---

## Phase Hygiene

| Check | Status | Detail |
|-------|--------|--------|
| Branch | ✓ | `feat/phase-02-ai-features` (per request); commits 2375337 → 5183835 |
| Commit count since origin/main | ✓ | 18 commits — context, plan, summaries, 9 implementation commits |
| Uncommitted changes | ✓ minor | Only `.planning/config.json` (state-tracking file, expected) — no source-tree drift |
| STATE.md plan progress | ✓ | 6/6 plans complete (3 Phase 1 + 3 Phase 2); milestone v2.2 still open (Phase 3 pending) |
| ROADMAP Phase 2 status | ✓ | "Phase 2: New AI features — Intel search v2 + server-rendered Audit PDF (3/3 plans complete; verifier next)" |
| REQUIREMENTS INT-02 + PDF-01 closed | ✓ | Both marked `[x]` with closure date 2026-05-10 and citing closing plans |
| All 13 D-XX decisions honored | ✓ | See Locked-Decision Audit table above |
| All Phase 2 plan SUMMARYs exist | ✓ | 02-01, 02-02, 02-03 |
| Self-Check entries in each SUMMARY | ✓ | All 3 mark "Self-Check: PASSED" with file existence + commit hash citations |

---

## Manual UAT Required (deferred — not blocking)

The 6 items in the YAML `human_verification` block above. All are listed in 02-VALIDATION.md "Manual-Only Verifications" and were expected to be deferred. They cannot be answered programmatically:
- 4 require Vercel preview deploy (live function execution)
- 1 requires VoiceOver/AT test (sr-only aria-live announcement once-fired contract)
- 1 requires opening a generated PDF in a viewer to eyeball the diagonal watermark

These are the items the PHASE COMPLETE → PRODUCTION READY transition needs. They do NOT affect goal achievement at the architectural level — every must-have artifact exists, every key link is wired, every locked decision is honored, the test suite is green, the build is green, the live DB has the migration applied.

---

## Verdict

**Status: human_needed.** All 3 ROADMAP success criteria are architecturally verified in the codebase. Implementation is complete, type-safe, and test-covered (with one minor regression-coverage gap on the download-button state machine — see W-1 warning). 6 manual UAT items remain on the Vercel preview deploy before the phase can be declared "delivered" — these are the manual-only checks `02-VALIDATION.md` explicitly carved out and are EXPECTED to be deferred per the verification request.

Phase 2 is shippable. Recommend running the manual UAT batch on the Vercel preview before merging to main.

---

_Verified: 2026-05-10T11:58:00Z_
_Verifier: Claude (gsd-verifier)_
_Tests: 42/42 green · Build: ✓ · TypeCheck: ✓ · NFT: 588 files (4 chromium archives) · D-09: 0-line globals.css diff_
