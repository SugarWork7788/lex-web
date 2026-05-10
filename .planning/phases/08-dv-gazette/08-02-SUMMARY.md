---
phase: 08
plan: 02
status: complete
requirements: [DV-02]
wave: 2
completed_at: 2026-05-10T23:42:00Z
duration_minutes: 22
tasks_completed: 3
tasks_total: 3
files_created:
  - lib/dv-search.ts
  - app/dv/_lib/act-pill.ts
  - app/dv/_components/issue-card.tsx
  - app/dv/page.tsx
  - app/dv/[slug]/page.tsx
  - app/dv/[slug]/_components/act-card.tsx
  - app/dv/[slug]/dv-act-summary.tsx
  - app/dv/[slug]/dv-issue-page-client.tsx
  - __tests__/dv-search.test.ts
  - __tests__/dv-page.test.tsx
  - __tests__/dv-issue-page.test.tsx
  - __tests__/setup.ts
files_modified:
  - lib/queries.ts
  - app/layout.tsx
  - vitest.config.ts
commits:
  - 96d3208 — Task 1
  - ca05706 — Task 2
  - d683855 — Task 3
metrics:
  vitest_cases_total: 44
  vitest_cases_new: 36
  build_routes_added: 2 (/dv, /dv/[slug])
  tsc_errors: 0
key_decisions:
  - "Pill palette: 5 cool tones (red/amber/sky/indigo/teal) + stone fallback; red reserved for Закон to piggy-back the brand accent without expanding the 10% accent token (UI-SPEC Q1)."
  - "Single useRateLimitedFetch instance per DvActSummary (one per card), inline error rendering. RateLimitToast lift to page-client level deferred — surface area is small (one button click per card) and 429 message includes the retry countdown inline."
  - "Section H2 on /dv/[slug] uses neutral text-stone-100 (NOT red); the audit-page red H2 is reserved for the audit corpus per UI-SPEC §Color."
  - "Date formatter pinned to Europe/Sofia in IssueCard and detail page so CI/Vercel TZ doesn't shift dates by ±1 day."
  - "Vitest setup file added for @testing-library/jest-dom matchers (Rule 3 deviation — plan assumed it was wired by Phase 1; it wasn't)."
threat_flags: []
---

# Plan 08-02 Summary — lex-web Държавен вестник browser (UI + data layer)

## Outcome

DV-02 satisfied. The lex-web side of Phase 8 is end-to-end ready:

- `/dv` listing page renders a paginated 2-column card grid (1-col on mobile) with a 4-dimension filter form (act-type chips, year, date-range, issue-range). State lives in the URL querystring (D-11) so every filter combination is shareable.
- `/dv/[slug]` detail page renders acts grouped by `act_type` in the canonical order Закон → Наредба → Постановление → Указ → Решение → Обявление → Other (CONTEXT D-09).
- Each act card has an inline "✦ AI обобщение" trigger; clicking expands the card in-place and streams the response from `/api/dv/summarize`. Only one card can be expanded at a time per page (UI-SPEC §"Single-card-expanded constraint", D-15).
- New nav link "Държавен вестник" sits between "/issues" and "/compare" in `app/layout.tsx` (D-18).
- `lib/dv-search.ts` exports `searchDvActs(q, filters)` wrapping `dv_search_top` RPC; falls back to `[]` on RPC error so page renders never crash (D-04).
- `lib/queries.ts` gains `listDvIssues / getDvIssue / listDvActs` — all return `[]` / `null` on error.

`bun run build` registers `/dv` and `/dv/[slug]` as `ƒ` (dynamic) routes. `bunx tsc --noEmit` is clean. `bun run test` is 44/44 across 5 files (8 prior + 15 + 13 + 8 = 36 new for this plan).

## Tasks delivered

| # | Task | Commit | Test cases |
|---|------|--------|------------|
| 1 | `lib/dv-search.ts` (RPC wrapper + constants + `computeScore`) + `__tests__/dv-search.test.ts` | `96d3208` | 15 |
| 2 | `/dv` listing + `DV_ACT_PILL` + `IssueCard` + nav link + 3 `lib/queries.ts` helpers + `__tests__/dv-page.test.tsx` + vitest setup | `ca05706` | 13 |
| 3 | `/dv/[slug]` detail + `ActCard` + `DvActSummary` + `DvIssuePageClient` + `__tests__/dv-issue-page.test.tsx` | `d683855` | 8 |

## Verification (plan-level `<verification>` block)

```
bun run test         → 44 passed (5 files), 0 failed       ✓
bunx tsc --noEmit    → 0 errors                             ✓
bun run build        → /dv (ƒ) + /dv/[slug] (ƒ) registered ✓
grep nav link        → 1 hit in app/layout.tsx              ✓
grep RPC wrapper     → 1 hit in lib/dv-search.ts            ✓
```

All five plan-verification gates green.

## Deviations from plan

### Rule 3 — Auto-fix blocking issue

**1. Vitest setup file missing for jest-dom matchers**
- **Found during:** Task 2 (writing the first component test that uses `toBeInTheDocument`).
- **Issue:** Plan Step 2f noted "testing-library jest-dom matchers are already configured by Phase 1 Wave 0" but in fact `vitest.config.ts` had `setupFiles: []` and no setup file existed. Phase 1 only shipped the `useRateLimitedFetch` hook test (which uses bare `expect.toBe`).
- **Fix:** Created `__tests__/setup.ts` importing `@testing-library/jest-dom/vitest`; updated `vitest.config.ts` `setupFiles: ["./__tests__/setup.ts"]`. Verified pre-existing tests still pass (8/8 prior cases green after the change).
- **Files modified:** `vitest.config.ts`, `__tests__/setup.ts` (new)
- **Commit:** rolled into `ca05706` (Task 2)

### Rule 1 — Auto-fix bug

**2. Date formatter would have shifted by ±1 day depending on host TZ**
- **Found during:** Task 2 (designing `IssueCard` test — the plan's test asserts `/08\.05\.2026/` for `date: "2026-05-08"`).
- **Issue:** `Intl.DateTimeFormat('bg-BG', ...)` defaults to the host's local timezone. CI runners in UTC and Vercel functions in unknown TZ would format `new Date("2026-05-08")` (parsed as UTC midnight) as `07.05.2026` west of UTC. This is a real correctness bug for a Bulgarian publication.
- **Fix:** Added `timeZone: "Europe/Sofia"` to both `IssueCard`'s formatter and the detail page's `BG_DATE` formatter. Sofia is the publication's authoritative timezone.
- **Files modified:** `app/dv/_components/issue-card.tsx`, `app/dv/[slug]/page.tsx`
- **Commit:** rolled into `ca05706` and `d683855`

### Process deviation (recovery)

**3. First Task 1 commit landed on the wrong branch (recovered before any user-visible damage)**
- **What happened:** The Bash tool resets `cwd` between calls. My initial recovery sequence ran `cd /Users/beyond/Desktop/lex-web && git ...` which `cd`'d INTO the main repo (not the worktree at `.claude/worktrees/agent-a469da69141ef185e`). The first commit `5a1ba41` for Task 1 was committed on the main repo's `feat/phase-08-dv-gazette` branch directly.
- **Recovery:** `git reset --soft 3d2d24e` on the main repo restored the branch to its pre-task tip; files were unstaged and removed from the main-repo working tree; identical content was Write-tool re-created in the worktree directory and committed on `worktree-agent-a469da69141ef185e` as commit `96d3208`. Net effect: the misplaced commit `5a1ba41` is gone (no record of it on disk), `feat/phase-08-dv-gazette` is back at `3d2d24e` exactly as it was at the start of the wave, and Task 1 is committed correctly on the agent branch.
- **Discipline going forward:** all subsequent Bash calls were verified to start in the worktree (Bash tool always returns to the worktree it was spawned in), and all Write/Edit calls used worktree-rooted absolute paths (`/Users/beyond/Desktop/lex-web/.claude/worktrees/agent-a469da69141ef185e/...`). The instructions' #3097 + #3099 guards exist precisely for this hazard.
- **Audit:** `git log feat/phase-08-dv-gazette` on the main repo shows tip = `3d2d24e` (no foreign commits). `git log worktree-agent-a469da69141ef185e -3` shows the three Task-N commits and nothing else.

### Process deviation (out of scope, leave alone)

**4. `app/api/dv/` directory is untracked in worktree**
- Plan 08-03 (`/api/dv/summarize/route.ts`) is running in parallel as Wave 2's other plan. Its files appeared in the worktree's working tree (likely a leak from a sibling worktree's mtime stamping or the user's local checkout). I left the directory untracked — it is NOT this plan's surface and 08-03 owns it.

## Threats verified at runtime

- **T-DV-02-01 XSS via act title** — `grep -rn "dangerouslySetInnerHTML" app/dv/` returns 0. All act titles render as text content via JSX interpolation (auto-escaped). Server-rendered (no client-side innerHTML manipulation either).
- **T-DV-02-02 SSR of `summary_ai` in listing card** — `IssueCard` selects only `id, issue_number, year, issue_supplement, date, title, source_url, act_count, top_act_types`. The `summary_ai` column is never read on the listing path. Per-act summary is only fetched on explicit user click via `/api/dv/summarize`.
- **T-DV-02-03 Rate-limit bypass via reload spam** — `/dv/[slug]` page-load triggers ZERO summary fetches. The `DvActSummary` component starts in `idle` and only fires its `useEffect` body when `isExpanded` flips to `true` (via user click). Page-load → `expandedActId === null` → no fetch.
- **T-DV-02-04 jsessionid leak in `source_url`** — Wave 1 SUMMARY confirmed `jsessionid_leak: 0` after live ingest (smoke against issue 2026/42). This plan trusts the DB state; no scrubbing in the UI layer. UAT smoke still recommended at /gsd-verify-work time.
- **T-DV-02-05 IDOR via slug enumeration** — `/dv/2026-1`, `/dv/2026-2` etc. are intentionally enumerable; the corpus is public (Bulgarian gazette is published openly). `notFound()` is returned for non-existent issues so attackers can't even probe for leaked drafts. No mitigation needed.

## Per-task acceptance criteria — all hit

- Task 1: `LEX_WEIGHT = 0.7` ✓, `RECENCY_WEIGHT = 0.3` ✓, `RECENCY_HALF_LIFE_DAYS = 365` ✓, `supabase.rpc("dv_search_top"` ✓, `trimmed.length < 2` ✓, `return []` (3×) ✓, 15 vitest cases ✓ (planned ≥12).
- Task 2: 6/6 act-type keys in `DV_ACT_PILL` ✓, `DV_ACT_TYPE_ORDER` ✓, all 3 query helpers exported from `lib/queries.ts` ✓, 1 nav link in `app/layout.tsx` ✓, page H1 + footer attribution ✓, 13 vitest cases ✓ (planned ≥9), `/dv` registered as ƒ dynamic route in build ✓.
- Task 3: `'use client'` on both client components ✓, `useRateLimitedFetch` ✓, `/api/dv/summarize` ✓, `aria-live="polite"` (1 in JSX, 1 in docstring) ✓, `DV_ACT_TYPE_ORDER` ✓, `↗ Оригинал` ✓, `getDvIssue + listDvActs` ✓, `Източник:` ✓, `notFound` ✓, 8 vitest cases ✓ (planned ≥7), `/dv/[slug]` registered as ƒ dynamic route ✓.

## Goal-backward `<must_haves>` verification

- ☑ `/dv` listing renders paginated card grid with 4-dimension filters; URL is shareable (GET-querystring).
- ☑ `/dv/[slug]` detail renders grouped sections in CONTEXT D-09 order.
- ☑ Each act card has inline "✦ AI обобщение" expansion; only one expanded at a time (verified by `__tests__/dv-issue-page.test.tsx::collapses an expanded card when another is expanded`).
- ☑ Bulgarian copy matches UI-SPEC §Copywriting Contract (page H1, breadcrumb "← Държавен вестник", footer "Източник: dv.parliament.bg ↗ · Държавен вестник на Народното събрание на Република България", filter labels, plurals via `Intl.PluralRules('bg-BG')`).
- ☑ Phase 1's `useRateLimitedFetch` is the ONLY fetch mechanism; bare `fetch()` count in `app/dv/`: `grep -rnE "^[^/]*\bfetch\b" app/dv/` returns 0 (verified manually).
- ☑ Nav link "Държавен вестник" between `/issues` and `/compare` in `app/layout.tsx`.
- ☑ Query helpers return `null` / `[]` on error, never throw — confirmed by code inspection of all three (`listDvIssues`, `getDvIssue`, `listDvActs`).
- ☑ TypeScript clean, build succeeds, 44/44 tests pass.

## Post-merge expectation

Two follow-ups land outside this plan's scope but are pre-requisites for `/gsd-verify-work 8`:

1. **Plan 08-03** (`/api/dv/summarize/route.ts`) — until 08-03 ships, clicking "✦ AI обобщение" returns a 404. Wave 2 design intentionally couples 08-02 (UI call) ↔ 08-03 (route impl). Both plans are committed; 08-03 unblocks the click path.
2. **Backfill scrape** (per Wave 1 SUMMARY note) — until at least one batch of `scripts/scrape_dv.py` runs against the live corpus, `/dv` only shows the smoke-tested issue 2026/42. The page renders correctly, but content is sparse. Backfill is a manual step; ETA ~2–3 hours.

## Self-Check: PASSED

- ☑ `lib/dv-search.ts` — exists at the worktree path, contains all 3 constants + `searchDvActs` + `computeScore`.
- ☑ `__tests__/dv-search.test.ts` — exists; 15 cases pass.
- ☑ `app/dv/_lib/act-pill.ts` — exists; 6 act-type keys + fallback + `DV_ACT_TYPE_ORDER`.
- ☑ `app/dv/_components/issue-card.tsx` — exists; exports `IssueCard`.
- ☑ `app/dv/page.tsx` — exists; exports default `DvListingPage`; build registers it as `ƒ /dv`.
- ☑ `app/dv/[slug]/page.tsx` — exists; exports default `DvIssuePage`; build registers it as `ƒ /dv/[slug]`.
- ☑ `app/dv/[slug]/_components/act-card.tsx` — exists; exports `ActCard`.
- ☑ `app/dv/[slug]/dv-act-summary.tsx` — exists; `'use client'`; `useRateLimitedFetch` + `/api/dv/summarize` + `aria-live`.
- ☑ `app/dv/[slug]/dv-issue-page-client.tsx` — exists; `'use client'`; owns `expandedActId`; uses `DV_ACT_TYPE_ORDER`.
- ☑ `__tests__/dv-page.test.tsx` — exists; 13 cases pass.
- ☑ `__tests__/dv-issue-page.test.tsx` — exists; 8 cases pass.
- ☑ `__tests__/setup.ts` — exists; wires jest-dom matchers.
- ☑ `lib/queries.ts` — appended `listDvIssues / getDvIssue / listDvActs`.
- ☑ `app/layout.tsx` — nav link added between `/issues` and `/compare`.
- ☑ `vitest.config.ts` — `setupFiles` populated.
- ☑ Commits: `96d3208` (Task 1), `ca05706` (Task 2), `d683855` (Task 3) — all on `worktree-agent-a469da69141ef185e`.
