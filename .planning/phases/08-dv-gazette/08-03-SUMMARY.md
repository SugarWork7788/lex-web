---
phase: 08
plan: 03
status: complete
wave: 2
requirements: [DV-02]
subsystem: lex-web AI endpoint
tags: [typescript, nextjs-16, anthropic, sonnet, streaming, rate-limit, cache, supabase]
depends_on: [08-01]
parallel_safe_with: [08-02]
dependency_graph:
  requires: [dv_acts table from 08-01, summary_ai column from 08-01, lib/rate-limit from Phase 1]
  provides: [POST /api/dv/summarize endpoint consumed by 08-02 DvActSummary client component]
  affects: []
tech_stack:
  added: []                                      # No new deps; Anthropic SDK + Supabase JS already present
  patterns: [Anthropic streaming POST per app/api/intel/search/route.ts, rateLimited gate per Phase 1, ReadableStream for cache-hit faux-stream, write-back-after-loop pattern from RESEARCH §Q6]
key_files:
  created:
    - app/api/dv/summarize/route.ts
    - __tests__/dv-summarize-route.test.ts
  modified: []
decisions:
  - Hardcoded model literal "claude-sonnet-4-6" (NOT a constant) so the grep gate locks identity without a variable redirection
  - Service-role Supabase client inline in the route (own factory function), with anon-key fallback — keeps the read+write inside one client to avoid two trips
  - Cache-hit returns a faux ReadableStream (single enqueue + close) for client-side stream-consumer parity; client code reads same way for hit and miss
  - Catch block calls only controller.error(err) — never .update() — so partial collected text never reaches the cache
  - Comment explaining "no finally" rephrased to avoid the literal token (grep gate would false-positive on the comment); semantic warning preserved
metrics:
  duration_minutes: 14
  completed_at: 2026-05-10T23:34:00Z
  task_commits: 2
  test_count_added: 11
  full_suite_test_count: 19
  files_created: 2
  loc_added: 371
commits:
  - 6c41cd2 — feat(08-03): app/api/dv/summarize/route.ts (Task 1)
  - f444748 — feat(08-03): __tests__/dv-summarize-route.test.ts (Task 2)
---

# Phase 8 Plan 03: AI Summary Endpoint Summary

POST `/api/dv/summarize` ships: Sonnet 4.6 streaming, 10/min/IP rate-limit, DB write-back cache to `dv_acts.summary_ai` with the cache-poison-immune write-after-loop pattern (RESEARCH §Q6).

## One-liner

Per-act AI summary endpoint with Anthropic Sonnet 4.6 streaming and abort-safe DB write-back caching — write-back lives AFTER the for-await-of loop, INSIDE try, gated on `collected.length > 0`; catch only errors the controller, never persists.

## Tasks delivered

| # | Task                                                                            | Commit    |
| - | ------------------------------------------------------------------------------- | --------- |
| 1 | `app/api/dv/summarize/route.ts` — Sonnet 4.6 streaming POST + DB write-back     | `6c41cd2` |
| 2 | `__tests__/dv-summarize-route.test.ts` — 11 cases (4 grep gates + 7 behavior)   | `f444748` |

## Verification (plan-level `<verification>` block)

```
1. bun run test __tests__/dv-summarize-route.test.ts  →  11/11 PASS
2. bun run test (full suite)                          →  19/19 PASS (3 files)
3. bunx tsc --noEmit                                  →  exit 0
4. bun run build                                      →  exit 0; /api/dv/summarize listed as ƒ (Dynamic)
5. grep -c "finally" app/api/dv/summarize/route.ts    →  0  ✓
6. grep -c "signal: req.signal" .../route.ts          →  1  ✓
7. grep -c "claude-sonnet-4-6" .../route.ts           →  1  ✓
```

All 7 plan-level checks green.

## Acceptance criteria verification (per-task)

### Task 1 grep gates (all from plan lines 217–228)

| gate                                                        | expected | actual |
| ----------------------------------------------------------- | -------- | ------ |
| `grep -c 'export const runtime = "nodejs"'`                 | 1        | 1 ✓   |
| `grep -c 'export const maxDuration'`                        | 1        | 1 ✓   |
| `grep -c '"claude-sonnet-4-6"'`                             | 1        | 1 ✓   |
| `grep -c 'signal: req.signal'`                              | 1        | 1 ✓   |
| `grep -c '"dv-summarize"'`                                  | 1        | 1 ✓   |
| `grep -c 'max: 10'`                                         | 1        | 1 ✓   |
| `grep -c 'summary_ai'`                                      | ≥3       | 6 ✓   |
| `grep -c '"X-Source": "cache"'`                             | 1        | 1 ✓   |
| `grep -c '"X-Source": "fresh"'`                             | 1        | 1 ✓   |
| `grep -c '"Cache-Control": "no-store"'`                     | 2        | 2 ✓   |
| `grep -c "finally"`                                         | 0        | 0 ✓   |

The awk-based "write-back appears once inside start()" gate returns 0 because the awk regex `^[[:space:]]*\},$` cannot capture the multi-line `await supabase\n.from\n.update` chain on a per-line basis. The semantic invariant is satisfied — see Deviation #2.

### Task 2 test count

11 tests, all pass:
- 4 grep-gate tests (model identity, signal propagation, no-finally, rate-limit key/max/window)
- 7 behavior tests (429 rate-limit, cache hit short-circuit, cache miss write-back, abort no-poison, missing actId 400, act not found 404, empty full_text 422)

## Deviations from plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] "finally" comment word triggered the grep-zero gate**

- **Found during:** Task 1 verification
- **Issue:** Plan's `<action>` block (line 174) embeds the comment `// Do NOT move this to finally — finally runs on abort, would poison the cache with partial text.` at the same time the `<acceptance_criteria>` (line 227) requires `grep -c "finally" route.ts` returns 0. Both invariants cannot hold with the literal source.
- **Fix:** Rephrased the comment to `// Do NOT move this to a post-try cleanup block (the always-runs JS keyword); such a block runs on abort too and would poison the cache with partial text. RESEARCH §Q6 + T-DV-03-01 forbid that pattern. Catch must NOT write-back either.` — same semantic warning, no `finally` token, references the threat model identifier so the prohibition is documented in code.
- **Files modified:** `app/api/dv/summarize/route.ts`
- **Commit:** `6c41cd2` (initial Task 1 commit; the rephrase happened during the same task before the commit, not as a separate fix-up)

**2. [Rule 1 — Bug, gate-only] awk-based "write-back-once-inside-start()" gate is unreachable**

- **Found during:** Task 1 verification
- **Issue:** The acceptance criterion `awk '/start\(controller\)/,/^[[:space:]]*\},$/' app/api/dv/summarize/route.ts | grep -c "supabase.*update"` returns 0 (expected 1). Root cause: the await chain is multi-line (`await supabase\n  .from("dv_acts")\n  .update({...})\n  .eq(...)`), so a per-line `grep "supabase.*update"` matches 0 lines. The awk extraction itself is correct; the chained `grep` is too narrow for the multi-line invocation pattern.
- **Semantic check:** Manual inspection of `app/api/dv/summarize/route.ts` lines 113–125 confirms write-back appears exactly once, inside `start(controller)`, after the `for await` loop completes, gated by `if (collected.length > 0)`. The Task 2 cache-miss test exercises this path and asserts `mockUpdate.toHaveBeenCalledTimes(1)`. The dual abort-no-poison test asserts `mockUpdate.not.toHaveBeenCalled()` when the stream throws. Both pass.
- **Fix:** None to source — the invariant is correctly implemented. The acceptance gate's regex is the bug. Documented here so future plan-checkers tighten the awk pattern (e.g., flatten newlines first: `awk '...' file | tr '\n' ' ' | grep -c 'supabase\.from.*update'`).
- **Files modified:** none

### Authentication gates

None. Anthropic API key was already present in `.env.local`. Tests mock the Anthropic SDK so no live API key is required for CI.

### Worktree-mechanics deviations

**3. [Setup] Initial Write hit main repo instead of worktree**

- **Found during:** Task 1 pre-commit
- **Issue:** Plan paths use `/Users/beyond/Desktop/lex-web/...` (main repo absolute paths). Initial Write to that path created `app/api/dv/summarize/route.ts` in the main repo, not in the worktree at `/Users/beyond/Desktop/lex-web/.claude/worktrees/agent-ac76073c50ab35f8e/...`. Detected when `git status --short` came back empty after the Write.
- **Fix:** `mv` from main repo to worktree, removed empty parent directories from main repo, re-ran all grep gates and tsc/build inside the worktree. This matches the absolute-path safety guidance (#3099) — derive paths from `git rev-parse --show-toplevel`, not from plan-supplied absolute paths.
- **Subsequent files (test file in Task 2, this SUMMARY):** Written directly to `$WT_ROOT/...` paths to avoid recurrence.

**4. [Setup] Worktree had no `.env.local`; build failed at page-data collection**

- **Found during:** Task 1 build
- **Issue:** `bun run build` failed with `Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local` when collecting `/api/alerts/unsubscribe` page data (a sibling route that imports `lib/supabase.ts`).
- **Fix:** Symlinked `$WT_ROOT/.env.local` → `/Users/beyond/Desktop/lex-web/.env.local`. The symlink is gitignored (`.env*` is in `.gitignore`) so does not appear in commits. Build then completed clean.

**5. [Setup] Hard-reset to `3d2d24e` per orchestrator instruction**

- **Found during:** Agent startup
- **Issue:** `git merge-base HEAD 3d2d24e` returned `8a47712` (Phase 1 commit), not `3d2d24e`. Worktree branch was at the older Phase 1 head and did not include Wave 1 schema commits (`1703749`, `1cfcc5b`, `3d2d24e`).
- **Fix:** `git reset --hard 3d2d24e` per orchestrator instruction. Working tree was clean before reset (no in-progress work to lose). HEAD assertion (per-agent branch) preserved.

## Threats verified at runtime

- **T-DV-03-01 Cache poisoning via partial-stream write-back (HIGH)** — mitigated by code structure (write-back after loop inside try, catch errors only) + grep gate (no `finally` token) + dedicated test case (`abort mid-stream: NO write-back`). The test mocks the async iterator to throw mid-stream and asserts `mockUpdate.not.toHaveBeenCalled()`. Pass.
- **T-DV-03-02 Token-budget DoS (medium)** — `rateLimited("dv-summarize", { windowMs: 60_000, max: 10 })` enforced at request entry. Test 429 case verifies the gate.
- **T-DV-03-04 SSRF via Anthropic SDK abuse (low)** — user input forwarded only as `messages[].content` text; no URL fetch / tool use / file access. No new vector.
- **T-DV-03-06 Service-role key leak (low)** — `getServiceSupabase()` reads `process.env.SUPABASE_SERVICE_ROLE_KEY` server-side; route is `runtime: "nodejs"`; no `NEXT_PUBLIC_` prefix on the service-role key (Next.js will not bundle it client-side).

## Known stubs

None. Endpoint is fully wired:
- DB read works against the real `dv_acts.summary_ai` schema landed by 08-01
- Stream pipes Anthropic's text deltas to the response body
- Write-back persists to the same column on cache miss
- Both X-Source headers (`cache` and `fresh`) emit so the client can distinguish

## Threat flags

None — no new security surface beyond the threat-model entries already enumerated.

## Goal-backward MUST-HAVE check (plan lines 537–548)

| invariant                                                                                | status   |
| ---------------------------------------------------------------------------------------- | -------- |
| POST `/api/dv/summarize` working server endpoint reachable from `/dv/[slug]`             | ✓ built  |
| Sonnet 4.6 model in use (CONTEXT D-14)                                                   | ✓ literal |
| Rate-limit `dv-summarize` 10/min/IP enforced                                             | ✓ test 429 |
| `signal: req.signal` forwarded to Anthropic stream (AI-07)                               | ✓ grep + literal |
| Cache hit returns cached `summary_ai` instantly with `X-Source: cache`                   | ✓ test |
| Cache miss streams + writes back ONLY on clean completion                                | ✓ test |
| Zero `finally` blocks (RESEARCH §Q6)                                                     | ✓ grep 0 |
| All 11 test cases pass; full suite green; tsc clean; build succeeds                      | ✓ |

DV-02 satisfied at the AI-endpoint surface. (Wave 2's other plan, 08-02, owns the DvActSummary client component that calls this endpoint; verifier confirms end-to-end after both Wave 2 plans land.)

## Self-Check: PASSED

Files exist:
- `app/api/dv/summarize/route.ts` — FOUND (worktree)
- `__tests__/dv-summarize-route.test.ts` — FOUND (worktree)

Commits exist on `worktree-agent-ac76073c50ab35f8e`:
- `6c41cd2` — FOUND (Task 1)
- `f444748` — FOUND (Task 2)

Test results green (11/11 plan tests; 19/19 full suite). tsc + build green. Plan-level verification block all-green. Goal-backward MUST-HAVE check all-green.
