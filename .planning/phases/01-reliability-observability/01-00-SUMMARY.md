---
phase: 01-reliability-observability
plan: 00
subsystem: testing
tags: [vitest, jsdom, testing-library, react-19, psutil, uv, bun, dev-deps, bootstrap]

# Dependency graph
requires: []
provides:
  - psutil 7.2.2 in lex-brain dev dependency group (RSS-based memory testing for OS-01)
  - vitest 4.1.5 + @testing-library/react 16.3.2 + jsdom 29.1.1 + @vitejs/plugin-react 6.0.1 in lex-web devDeps (hook contract testing for RL-01)
  - vitest.config.ts with jsdom env + @/* path alias mirroring tsconfig.json
  - "test" and "test:watch" scripts in lex-web/package.json
affects:
  - 01-reliability-observability/01-01 (OpenSanctions streaming + RSS-peak test — consumes psutil)
  - 01-reliability-observability/01-02 (useRateLimitedFetch hook + RateLimitToast — consumes vitest stack)

# Tech tracking
tech-stack:
  added:
    - psutil 7.2.2 (lex-brain, dev)
    - vitest 4.1.5 (lex-web, dev)
    - "@vitest/ui 4.1.5 (lex-web, dev)"
    - "@testing-library/react 16.3.2 (lex-web, dev)"
    - "@testing-library/dom 10.4.1 (lex-web, dev)"
    - "@testing-library/jest-dom 6.9.1 (lex-web, dev)"
    - jsdom 29.1.1 (lex-web, dev)
    - "@vitejs/plugin-react 6.0.1 (lex-web, dev)"
    - "@types/react 19.2.14 (lex-web, dev — version pin tightened from ^19)"
  patterns:
    - "Cross-repo Wave 0 bootstrap: install test infra in both lex-brain (uv) and lex-web (bun) before any source-touching plan runs"
    - "vitest config mirrors tsconfig.json paths (@/* → project root) so test imports resolve identically to production"
    - "Use the project package manager (uv add --dev / bun add -D) — never hand-edit lockfiles"

key-files:
  created:
    - /Users/beyond/Desktop/lex-web/vitest.config.ts
  modified:
    - /Users/beyond/Desktop/lex-brain/pyproject.toml
    - /Users/beyond/Desktop/lex-brain/uv.lock
    - /Users/beyond/Desktop/lex-web/package.json
    - /Users/beyond/Desktop/lex-web/bun.lock

key-decisions:
  - "Accepted uv's default psutil pin (^7.2.2) — psutil 7.x is current per RESEARCH §Standard Stack Track A"
  - "vitest.config.ts uses path.resolve(__dirname, \".\") for the @ alias to mirror tsconfig.json paths exactly"
  - "globals: true in vitest config so describe/it/expect work without explicit imports (matches vitest convention)"

patterns-established:
  - "Test fixture include globs: __tests__/**/*.{test,spec}.{ts,tsx} (top-level test dir) and lib/**/*.{test,spec}.{ts,tsx} (co-located library tests). Phase 1 plan 01-02 will place its files under __tests__/."

requirements-completed: []  # Bootstrap-only — neither OS-01 nor RL-01 is satisfied by this plan; 01-01 closes OS-01 and 01-02 closes RL-01.

# Metrics
duration: 3min
completed: 2026-05-09
---

# Phase 01 Plan 00: Wave 0 test-infra bootstrap Summary

**psutil 7.2.2 installed in lex-brain dev group; vitest 4.1.5 + RTL 16.3.2 + jsdom 29.1.1 + plugin-react 6.0.1 installed in lex-web devDeps; vitest.config.ts wires jsdom env + @/* alias matching tsconfig.json — Phase 1 Wave 1 plans 01-01 and 01-02 unblocked.**

## Performance

- **Duration:** 3 min (162 s)
- **Started:** 2026-05-09T11:06:00Z
- **Completed:** 2026-05-09T11:08:42Z
- **Tasks:** 3
- **Files modified:** 5 (1 created in lex-web, 2 modified in lex-web, 2 modified in lex-brain)

## Accomplishments

- **lex-brain (sibling repo):** `psutil>=7.2.2` added to `[dependency-groups].dev` in `pyproject.toml`; `uv.lock` regenerated; `uv run python -c "import psutil"` returns 7.2.2 with exit 0. Backs the `psutil.Process().memory_info().rss` peak-RSS sampler that plan 01-01's OS-01 memory test depends on (D-14: RSS over tracemalloc, since `httpx`/libcurl-style C-layer buffers sit below tracemalloc's tracking layer).
- **lex-web (this repo):** vitest 4.1.5 + `@vitest/ui` + `@testing-library/react` 16.3.2 + `@testing-library/dom` 10.4.1 + `@testing-library/jest-dom` 6.9.1 + jsdom 29.1.1 + `@vitejs/plugin-react` 6.0.1 + `@types/react` 19.2.14 added to `devDependencies`; `bun.lock` regenerated; `bunx vitest --version` returns vitest/4.1.5 with exit 0. `"test": "vitest run"` and `"test:watch": "vitest"` added to `package.json` `"scripts"` (existing `dev`, `build`, `start`, `lint` preserved).
- **lex-web:** New `vitest.config.ts` (18 lines) with `environment: "jsdom"`, `plugins: [react()]`, `globals: true`, `include: ["__tests__/**/*.{test,spec}.{ts,tsx}", "lib/**/*.{test,spec}.{ts,tsx}"]`, and `resolve.alias["@"] = path.resolve(__dirname, ".")` (mirrors `tsconfig.json` `paths["@/*"] -> ["./*"]`).
- Smoke-tested vitest config discovery: `bunx vitest run` parses the config, prints the include/exclude globs, reports "No test files found" (correct — no test files yet by design). No `Cannot find module`, `Failed to resolve`, or `ConfigError` strings in output.

## Task Commits

Each task was committed atomically. Plan 01-00 spans two repos, so Task 1 lives in lex-brain and Tasks 2–3 in lex-web.

1. **Task 1: Add psutil to lex-brain dev dependency group** — lex-brain `67f14b8` (chore)
   - Repo: `/Users/beyond/Desktop/lex-brain`
   - Branch: `chore/post-phase-02-state-update` (lex-brain's active branch)
   - Files: `pyproject.toml`, `uv.lock`
2. **Task 2: Add vitest + RTL + jsdom + @vitejs/plugin-react to lex-web devDeps and add test scripts** — lex-web `3a26a2f` (chore)
   - Repo: `/Users/beyond/Desktop/lex-web`
   - Branch: `feat/phase-01-reliability`
   - Files: `package.json`, `bun.lock`
3. **Task 3: Create lex-web vitest.config.ts with jsdom env and @/* path alias** — lex-web `e76ff03` (chore)
   - Repo: `/Users/beyond/Desktop/lex-web`
   - Branch: `feat/phase-01-reliability`
   - Files: `vitest.config.ts` (created)

**Plan metadata commit (this SUMMARY + STATE + ROADMAP):** to be added in the final commit after this file is written.

_Note: All commits are `chore` rather than `feat`/`test` because Wave 0 is dependency-manifest-only — zero behaviour added, zero tests added. Plan 01-01 will produce the first `test` and `feat` commits._

## Files Created/Modified

### lex-brain (sibling repo)

- `/Users/beyond/Desktop/lex-brain/pyproject.toml` — added `"psutil>=7.2.2"` to `[dependency-groups].dev` array (was: `["pytest>=9.0.3"]`, now: `["psutil>=7.2.2", "pytest>=9.0.3"]`)
- `/Users/beyond/Desktop/lex-brain/uv.lock` — regenerated by `uv add --dev psutil` (mtime 1777899364 → 1778324776)

### lex-web (this repo)

- `/Users/beyond/Desktop/lex-web/package.json` — added 7 new devDependencies + tightened `@types/react` pin from `^19` to `^19.2.14` (bun-driven, idempotent); added `"test"` and `"test:watch"` script entries
- `/Users/beyond/Desktop/lex-web/bun.lock` — regenerated by `bun add -D ...` (mtime 1777810876 → 1778324815)
- `/Users/beyond/Desktop/lex-web/vitest.config.ts` — **NEW** — 18 lines; jsdom env + react plugin + `@/*` alias + include globs

## Decisions Made

1. **Accepted uv's default psutil pin (`^7.2.2`).** RESEARCH §"Standard Stack Track A" said psutil 7.x is current and has no breaking-change risk for the simple `Process().memory_info().rss` API used by D-14. No reason to over-constrain.
2. **Tightened `@types/react` from `^19` to `^19.2.14`.** Bun's idempotent install normalised the existing `^19` pin to the resolved version. No semver change, no behaviour change. Documented as a side-effect, not a deliberate pin.
3. **`globals: true` in vitest config.** RESEARCH §"Vitest hook test skeleton" assumes `describe`/`it`/`expect` are global. The plan's `<action>` block specified this exact value. Trade-off: less explicit imports vs. matching established convention. Followed the plan.
4. **Did NOT install a toast library.** Out of scope for plan 01-00 (this plan does not touch UI); RESEARCH §"Standard Stack Track B" notes this as a 01-02 decision and recommends a hand-rolled toast.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Dropped `--reporter=basic` from the vitest config-discovery smoke test**
- **Found during:** Task 3 (Create lex-web vitest.config.ts)
- **Issue:** The plan's `<action>` block instructs `bunx vitest run --reporter=basic 2>&1 | head -20`. vitest 4.1.5 does **not** ship a `basic` reporter — running with that flag produced `Error: Failed to load custom Reporter from basic` / `Failed to load url basic (resolved id: basic)`. Vitest 4 dropped/renamed the reporter. (This is the kind of "your training data is wrong about modern tools" issue that the project's `AGENTS.md` warns about for Next.js 16; same shape, vitest 4 edition.)
- **Fix:** Ran `bunx vitest run` (default reporter). The plan's `<acceptance_criteria>` explicitly tests semantics — "output does NOT contain `Cannot find module`, `Failed to resolve`, or `ConfigError`" — not the literal flag. The default-reporter output cleanly satisfies this: vitest discovers the config, parses the include/exclude globs, prints `No test files found, exiting with code 1` (correct: no test files exist yet by design — 01-02 writes the first one). No module-resolution or config errors in output.
- **Files modified:** None (this was a smoke-test command tweak, not a config change).
- **Verification:** Re-ran `bunx vitest run 2>&1 | grep -E "Cannot find module|Failed to resolve|ConfigError"` → no matches. Acceptance criterion satisfied.
- **Committed in:** Not a code change — no commit. Documented here for the verifier.

---

**Total deviations:** 1 auto-fixed (1 blocking — vitest CLI flag drift between training data and v4.1.5)
**Impact on plan:** Zero impact on the plan's deliverables — config file content matches the plan exactly; only the smoke-test invocation differs. All success criteria still met.

## Issues Encountered

- **Vitest 4 reporter rename / removal.** First attempt at `bunx vitest run --reporter=basic` failed with `Failed to load custom Reporter from basic`. Resolved by dropping the flag (see deviation above).
- **lex-brain `git commit` identity warning.** lex-brain's git config doesn't have user.email/name set; the commit succeeded but printed a warning suggesting `git config --global --edit`. Out of scope for this plan — it's a per-machine config concern, not a code/state issue. Logged here for awareness; not fixing in this plan.

## User Setup Required

None — no external service configuration required. Both `psutil` and `vitest` install offline from already-cached package indexes via the project package managers (`uv` + `bun`).

## Threat Flags

None. Per the plan's `<threat_model>`, this is dev-tooling-only with no production code, no new network endpoints, no new auth paths, no schema changes, no new trust boundaries beyond the existing npm/PyPI registry trust model the project already accepts.

## Self-Check: PASSED

- ✓ `/Users/beyond/Desktop/lex-brain/pyproject.toml` — psutil dep present (`grep '"psutil' pyproject.toml` returns 1 match)
- ✓ `/Users/beyond/Desktop/lex-brain/uv.lock` — modified (mtime advanced)
- ✓ `/Users/beyond/Desktop/lex-web/package.json` — vitest, @testing-library/react, jsdom, @vitejs/plugin-react, "test" script, "test:watch" script all present
- ✓ `/Users/beyond/Desktop/lex-web/bun.lock` — modified (mtime advanced)
- ✓ `/Users/beyond/Desktop/lex-web/vitest.config.ts` — exists, 18 lines, contains `environment: "jsdom"`, `plugins: [react()]`, `"@":`, `include:`
- ✓ Commit `67f14b8` exists in lex-brain (`git -C /Users/beyond/Desktop/lex-brain log --oneline | grep -q 67f14b8`)
- ✓ Commit `3a26a2f` exists in lex-web (Task 2)
- ✓ Commit `e76ff03` exists in lex-web (Task 3)
- ✓ `bunx vitest --version` returns `vitest/4.1.5 darwin-arm64 node-v24.14.0`
- ✓ `cd /Users/beyond/Desktop/lex-brain && uv run python -c "import psutil; print(psutil.__version__)"` returns `7.2.2`

## Next Phase Readiness

**Wave 1 (plans 01-01 and 01-02) can now run in parallel.** Both have all the test infrastructure they need:

- **01-01 (lex-brain OpenSanctions streaming + RSS-peak test):** can `from psutil import Process` and sample `Process().memory_info().rss` in a sampler thread; can write `tests/test_opensanctions_memory.py` against a synthetic CSV; can `uv run pytest` the test.
- **01-02 (lex-web useRateLimitedFetch hook + RateLimitToast):** can `import { renderHook, act } from "@testing-library/react"`; can `import { describe, it, expect } from "vitest"` (or use globals); can write `__tests__/use-rate-limited-fetch.test.tsx`; can `bun run test`.

No blockers, no concerns.

## Environment Note — TCC oscillation during state-update phase

Between Task 3 commit and final docs commit, macOS TCC subsystem briefly revoked Bash + Read access to `/Users/beyond/Desktop/lex-web/.planning/*` and to `git` invocations targeting the worktree. Stat-only probes worked; new-file writes worked; overwrites of pre-existing planning files were denied. **TCC recovered** before the final commit, allowing `STATE.md`, `ROADMAP.md`, and the final docs commit to be applied normally. As a defensive measure during the outage, the executor wrote shadow files (`STATE.md.01-00-update`, `ROADMAP.md.01-00-update`) which were then `cp`'d over the originals on recovery and removed. No data loss; no manual intervention required. The three task commits had landed earlier (verified via `git rev-parse --short HEAD` while TCC was still permissive):

- `67f14b8` (lex-brain Task 1)
- `3a26a2f` (lex-web Task 2)
- `e76ff03` (lex-web Task 3)

**Pre-existing untracked file note:** `lex-web/.planning/STATE.md` and `.planning/config.json` were already showing as `M` in `git status` at session start (orchestrator-side modifications from the spawn flow). These are picked up by the final docs commit alongside the new STATE.md and ROADMAP.md content for plan 01-00.

---
*Phase: 01-reliability-observability*
*Plan: 00*
*Completed: 2026-05-09*
