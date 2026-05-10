---
phase: 02-new-ai-features
plan: 02
subsystem: ai-features
tags: [intel, search, ranking, anthropic, haiku, fts, rsc, streaming, ui]
requires: [02-01]
provides:
  - "lib/intel-search.ts (searchTopRanked + scoreBlend + RankedRow + IntelSource)"
  - "/api/intel/quote (Haiku 4.5 streaming endpoint, key intel-quote, max 30/min)"
  - "<BestMatches> + <BestMatchCard> + <BestMatchQuote> UI surface (D-01/D-03/D-04)"
  - "app/intel/search/page.tsx parallel Promise.all + <BestMatches> mount"
affects:
  - "/intel/search renders ranked top-5 above existing per-source breakdown"
tech_stack:
  added: []
  patterns:
    - "Anthropic streaming pattern reused from /api/intel/search (model swap haiku-4-5; signal: req.signal forwarded — Pitfall 7)"
    - "useRateLimitedFetch hook reused from Phase 1 (D-06; bare browser-fetch banned in new components)"
    - "Postgres tsvector + ts_rank via supabase.rpc('intel_search_top') from plan 02-01"
    - "aria-live debouncing via sr-only span gated on status === 'done' (UI-SPEC §Accessibility line 396)"
key_files:
  created:
    - "lib/intel-search.ts"
    - "app/api/intel/quote/route.ts"
    - "app/intel/search/best-matches.tsx"
    - "app/intel/search/best-match-card.tsx"
    - "app/intel/search/best-match-quote.tsx"
    - "__tests__/intel-search-ranking.test.ts"
    - "__tests__/intel-quote-route.test.ts"
    - "__tests__/best-matches.test.tsx"
  modified:
    - "app/intel/search/page.tsx"
decisions:
  - "Verb identity: Bulgarian pill label 'НАП' route is /issues (matches existing per-source breakdown convention; not a new redirect)."
  - "Test framework: skipped @testing-library/jest-dom matchers (toBeInTheDocument) — vitest project does not register the setup file. Used plain truthy / not-null assertions instead. Avoids touching vitest.config.ts (anti-shallow rule, plus the gate is 'don't expand the test surface beyond plan')."
  - "Quote-route test mocks @anthropic-ai/sdk via vi.mock with a synthetic stream handle that fires two text deltas + finalMessage(). Allows assertions on model identity, signal forwarding, system-prompt content, max_tokens, and rate-limit cap without hitting the live API."
metrics:
  duration_min: 8
  task_count: 3
  files_touched: 9
  tests_added: 31
  tests_total: 42
  commits: 4  # 3 task commits + 1 docs commit (this summary)
  completed_at: "2026-05-10T08:48:00Z"
---

# Phase 02 Plan 02: Intel ranking + best-matches UI + Haiku quote endpoint

Wired the application code for INT-02 on top of the Postgres tsvector + GIN
+ `intel_search_top` RPC laid down in plan 02-01. Three surfaces shipped: a
TypeScript ranking helper that calls the RPC with graceful-degradation
fallback, a Haiku 4.5 streaming endpoint at `/api/intel/quote` for per-card
quote extraction, and the `<BestMatches>` / `<BestMatchCard>` /
`<BestMatchQuote>` UI components rendered above the existing per-source
breakdown.

## Artifacts

| Path | Purpose | Commit |
|------|---------|--------|
| `lib/intel-search.ts` | Ranking helper: `searchTopRanked(q)`, `scoreBlend({lex,rec})`, `RECENCY_HALF_LIFE_DAYS=365`, `LEX_WEIGHT=0.7`, `RECENCY_WEIGHT=0.3`, `RankedRow` + `IntelSource` types | `dcc4f98` |
| `__tests__/intel-search-ranking.test.ts` | 12 vitest cases: shape, empty/single-char short-circuit, RPC error fallback, RPC throw fallback, score-blend boundary math, limit clamping | `dcc4f98` |
| `app/api/intel/quote/route.ts` | POST → text/plain stream of 1–2 BG sentences via Haiku 4.5; `runtime: nodejs / maxDuration: 30`; rate-limit gate `intel-quote 60s/30`; `{ signal: req.signal }` forwarded (AI-07 / Pitfall 7) | `604db85` |
| `__tests__/intel-quote-route.test.ts` | 8 vitest cases (mocked Anthropic): model identity (haiku-4-5 not sonnet), signal propagation, response-headers shape, 400 on invalid JSON / empty query / empty summary, rate-limit cap (31st call → 429) | `604db85` |
| `app/intel/search/best-matches.tsx` | Server component section wrapper; `if (items.length === 0) return null;` (D-01 silent hide) | `3ceadda` |
| `app/intel/search/best-match-card.tsx` | Variant-driven card; `SOURCE_PILL` map of 6 verbatim tints + Bulgarian labels + `HREF_BY_SOURCE` map; mounts `<BestMatchQuote>` for `source === 'articles'` only | `3ceadda` |
| `app/intel/search/best-match-quote.tsx` | Client component streaming Haiku quote via `useRateLimitedFetch` (D-06 — no bare browser-fetch); aria-live debounced on sr-only span (`status === "done"`) | `3ceadda` |
| `app/intel/search/page.tsx` | Modified: `Promise.all([searchAll, searchTopRanked])`; `<BestMatches>` mounted between `<IntelSearchSummary>` and the first `<ResultGroup>` | `3ceadda` |
| `__tests__/best-matches.test.tsx` | 11 vitest cases: empty-state hide, 6-variant render, article-vs-record eyebrow split, sr-only aria-live structural rule, p-5 tap-target, per-source href map, no-fetch on empty summary | `3ceadda` |

## Success Criteria

| Criterion (from PLAN.md) | Status |
|--------------------------|--------|
| `GET /intel/search?q=X` renders `<BestMatches>` above the per-source breakdown when `intel_search_top` returns ≥1 row; renders nothing when 0 rows | ✓ Build green; D-01 silent hide enforced by component-level `items.length === 0 ⇒ null` and unit-tested |
| Article best-match cards stream a 1–2 sentence Bulgarian quote from `/api/intel/quote` (Haiku 4.5); non-article cards render the source-row-verbatim secondary string at first paint with no streaming | ✓ Component contract verified by unit tests; live UAT after deploy |
| Per-source-tint pills, accent budget, copy strings, and aria-live debouncing match UI-SPEC verbatim | ✓ All 6 pill class strings + 6 BG labels + 3 BG copy strings (heading/eyebrow/sub-label) grep-verified; AI eyebrow uses `text-red-400`, record eyebrow uses `text-stone-400` |
| `lib/intel-search.ts` exports `searchTopRanked(q)`, `RECENCY_HALF_LIFE_DAYS=365`, `LEX_WEIGHT=0.7`, `RECENCY_WEIGHT=0.3` — verified by `__tests__/intel-search-ranking.test.ts` | ✓ 12 tests green (3 of which assert constants verbatim) |
| AI-07 abort propagation preserved: `req.signal` passed to `client.messages.stream(...)` | ✓ Grep gate green; unit test asserts `streamCalls[0].options.signal instanceof AbortSignal` |
| Per CONTEXT.md D-06: any new client-side fetch goes through `useRateLimitedFetch`; bare `fetch()` is forbidden in any new component | ✓ Grep gate green across all 3 new component files (with one prose-rephrase deviation, see below) |
| INT-02 success-criterion #1 (`<3 s` page render) | ⚠ Ships green; UAT to confirm post-deploy. Page renders `searchAll` + `searchTopRanked` in parallel via `Promise.all` so total wall-time ≈ max(per-source ILIKE fan-out, RPC call). |

## Verification Gates

| Gate | Result |
|------|--------|
| `bun run test __tests__/intel-search-ranking.test.ts` | ✓ 12/12 |
| `bun run test __tests__/intel-quote-route.test.ts` | ✓ 8/8 |
| `bun run test __tests__/best-matches.test.tsx` | ✓ 11/11 |
| `bun run test` (full suite) | ✓ 42/42 across 6 test files (Phase 1: rate-limit + use-rate-limited-fetch = 11 tests; Phase 2: 31 new) |
| `bunx tsc --noEmit` | ✓ Zero errors in any 02-02 file. Pre-existing errors in `app/api/audit/pdf/route.ts` (4 lines) belong to plan 02-03; out-of-scope per the anti-shallow boundary rule |
| `bun run build` | ✓ "Compiled successfully in 1372ms"; `/intel/search` and `/api/intel/quote` registered as ƒ (Dynamic) routes |
| Grep gate: `claude-haiku-4-5` ≥1 in `app/api/intel/quote/route.ts` | ✓ |
| Grep gate: `signal: req.signal` ≥1 in `app/api/intel/quote/route.ts` | ✓ |
| Grep gate: 6 pill color tokens (red/amber/blue/stone/purple/emerald) in `best-match-card.tsx` | ✓ |
| Grep gate: `useRateLimitedFetch` ≥1 in `best-match-quote.tsx` and `/api/intel/quote` ≥1 reference | ✓ |
| Grep gate: `aria-live="polite"` + `sr-only` + `status === "done"` co-occur in `best-match-quote.tsx` | ✓ |

## Decisions Made

1. **Quote-route test infrastructure: mock `@anthropic-ai/sdk` via `vi.mock`, not via dependency injection.** Project pattern: existing `/api/intel/search/route.ts` instantiates `Anthropic` directly with `new Anthropic()` (no DI). Same posture for the new route; tests interpose by replacing the module export with a mock class that captures `messages.stream(args, options)` calls. Lets us assert on model identity, signal propagation, and system-prompt shape without an Anthropic API key.
2. **`@testing-library/jest-dom` matchers are NOT used** even though the dev-dep is in `package.json`. The vitest project doesn't register the setup file (`vitest.config.ts: setupFiles: []`), so `toBeInTheDocument()` raises "Invalid Chai property". Switched all assertions to plain `toBeTruthy()` / `not.toBeNull()` / className regex matches. Avoids touching `vitest.config.ts` (anti-shallow rule).
3. **`HREF_BY_SOURCE.nap = "/issues"`** preserves the existing convention from `app/intel/search/page.tsx:149`. NAP rulings live under `/issues` not `/intel/nap` in this project — the ranking surface follows the same routing the per-source breakdown uses.
4. **`p-5` is the primitive padding (matches `/audit` FindingCard)**, not `p-4`. UI-SPEC §"Card layout primitive" specifies the literal class string `rounded-lg border border-stone-800 bg-stone-900/40 p-5`; deviating to `p-4` would re-mute the audit-vs-intel visual rhythm.
5. **The component itself does NOT clamp to 5 rows.** `lib/intel-search.ts/searchTopRanked` clamps via the default `limit = 5` arg AND the SQL function caps at 5; double-clamping in the component would obscure where the contract lives. The `BestMatches` component renders all rows it receives. This is unit-tested.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Unit test had ES2018-only regex `s` flag**
- **Found during:** Task 2 — `bunx tsc --noEmit` reported `error TS1501: This regular expression flag is only available when targeting 'es2018' or later`
- **Issue:** my generated test used `/Заявка:.*"Бойко".*Резюме:/s` (dotall flag), but `tsconfig.json` pins `target: "ES2017"`
- **Fix:** rewrote the assertion as three separate `expect(...).toContain(...)` calls on the user-message content string. Same coverage, no regex `s` flag.
- **Files modified:** `__tests__/intel-quote-route.test.ts`
- **Commit:** `604db85` (rolled into the same task commit since the fix landed before commit time)

**2. [Rule 1 — Bug] Two ranking-helper tests passed length-1 query "q" past the `< 2` short-circuit guard**
- **Found during:** Task 1 GREEN run
- **Issue:** my initial test used `searchTopRanked("q")` to seed the limit-clamping cases — but the helper's Pitfall-5 short-circuit returns `[]` for any input where `trim().length < 2`, so the mocked RPC was never reached and the assertion `out.length === 5` saw `0`.
- **Fix:** changed the seed query to `"борисов"` (a meaningful Bulgarian search string ≥ 2 chars). The two affected tests now exercise the limit-clamping path correctly.
- **Files modified:** `__tests__/intel-search-ranking.test.ts`
- **Commit:** `dcc4f98` (rolled into the same task commit; caught before commit)

**3. [Rule 3 — Blocking issue] `bare-fetch` grep gate false-positive on JSDoc comment**
- **Found during:** Task 3 verify gate
- **Issue:** the plan's grep gate scans for `/[^a-zA-Z]fetch\(/` and filters out `//`-prefixed lines, but my JSDoc opens lines with ` *` so the comment containing the word "fetch()" was flagged as a bare browser-fetch.
- **Fix:** rephrased the JSDoc to use "bare browser-fetch" (no `()` parens). Functionally equivalent prose, no semantic change to the contract. The component still uses only `rl.submit(...)` for network calls.
- **Files modified:** `app/intel/search/best-match-quote.tsx`
- **Commit:** `3ceadda` (rolled into Task 3)

### Architectural / Spec Deviations

None. The plan was specific enough that no Rule 4 escalation was needed. CONTEXT.md D-01..D-07 all preserved verbatim.

## Threat Surface

All 9 entries in the plan's `<threat_model>` STRIDE register were honoured:

- **T-02-02-01** (DoS via Anthropic token-budget exhaustion): mitigated by `rateLimited(req, "intel-quote", { windowMs: 60_000, max: 30 })`. Test 7 in `__tests__/intel-quote-route.test.ts` exercises the 31st-call-429 boundary.
- **T-02-02-03** (SQLi via search query): mitigated. `q` flows through `supabase.rpc("intel_search_top", { q })` — PostgREST parameter binding; no string concatenation.
- **T-02-02-04** (prompt injection via summary field): mitigated by the trust boundary (summary comes from `investigative_articles.summary` which is server-controlled, not directly user-typed). Worst-case effect is an off-target quote — acceptable per the plan.
- **T-02-02-05** (Anthropic API key leak via 5xx): mitigated. Error fallback emits `[грешка: ${msg}]` into the stream; the SDK error message does not include the API key.
- **T-02-02-08** (RPC privilege escalation): mitigated. `intel_search_top` is `LANGUAGE sql STABLE` (read-only), no dynamic SQL.
- **T-02-02-09** (logging the raw query): mitigated. The Phase-1 throttle log shape `{event, route, ip_hash, retry_after, ts}` does NOT include the query string.

No new trust boundaries beyond the new endpoint. No new auth, no new schema, no new salts. Bundle size: zero net change (no new client deps).

### Threat Flags

None. The new surface (`/api/intel/quote`) is fully covered by the plan's threat register; no out-of-band trust boundary discovered during execution.

## aria-live debouncing — UI-checker FYI #2

The structural contract is enforced by a unit test (`(c) explicit aria-live attribute is on a sr-only span, not on the visible <p>`). The test walks every node with an `aria-live` attribute and asserts it carries `sr-only`. This guarantees screen readers don't hear token-by-token streaming.

**VoiceOver UAT smoke:** NOT performed in this plan (component tests cover the structural rule). Recommended for the live deploy: open `/intel/search?q=борисов` with VoiceOver active, watch `Network → /api/intel/quote` complete, confirm each completed quote announces exactly once and that no card announces during streaming.

## AI-07 confirmation

`grep "signal: req.signal" app/api/intel/quote/route.ts` → 1 match, line 75 (the second-arg to `client.messages.stream(...)`). Verified by unit test #3 in `__tests__/intel-quote-route.test.ts` which asserts `streamCalls[0].options.signal instanceof AbortSignal`.

## D-06 confirmation

Zero bare `fetch(` calls in the 3 new component files (`best-matches.tsx`, `best-match-card.tsx`, `best-match-quote.tsx`). All network access flows through `rl.submit(...)` from `useRateLimitedFetch`.

## Pointer for Plan 02-03

The audit PDF route is independent of the intel surface. **Zero file overlap** with this plan:
- 02-02 owns: `lib/intel-search.ts`, `app/api/intel/quote/route.ts`, `app/intel/search/{best-matches,best-match-card,best-match-quote}.tsx`, `app/intel/search/page.tsx`, `__tests__/{intel-search-ranking,intel-quote-route,best-matches}.test.{ts,tsx}`.
- 02-03 owns: `app/audit/page.tsx`, `app/audit/download-pdf-button.tsx`, `next.config.ts`, `app/api/audit/pdf/route.ts`, `package.json` (puppeteer-core + @sparticuz/chromium).

Wave 2 parallel safety verified — `git status --short` at end-of-plan showed staged 02-02 files only; 02-03 working-tree changes (visible in the workspace from the parallel agent) were left untouched.

## Self-Check: PASSED

All listed artifacts exist and all task commit hashes are present in `git log`:

- `lib/intel-search.ts`: FOUND
- `app/api/intel/quote/route.ts`: FOUND
- `app/intel/search/best-matches.tsx`: FOUND
- `app/intel/search/best-match-card.tsx`: FOUND
- `app/intel/search/best-match-quote.tsx`: FOUND
- `app/intel/search/page.tsx` (modified): FOUND
- `__tests__/intel-search-ranking.test.ts`: FOUND
- `__tests__/intel-quote-route.test.ts`: FOUND
- `__tests__/best-matches.test.tsx`: FOUND
- Commit `dcc4f98` (Task 1 — ranking helper + tests): FOUND
- Commit `604db85` (Task 2 — Haiku quote endpoint + tests): FOUND
- Commit `3ceadda` (Task 3 — UI components + page integration + tests): FOUND
