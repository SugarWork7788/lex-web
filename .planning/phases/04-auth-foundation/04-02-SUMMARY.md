---
phase: 04-auth-foundation
plan: 02
subsystem: auth
tags: [auth, supabase, ssr, next16, route-handler, react-hook, server-component, pkce, oauth]

# Dependency graph
requires:
  - phase: 04-01
    provides: "user_profiles table + RLS + handle_new_user() trigger applied to live Supabase"
  - phase: 01-reliability-observability
    provides: "lib/rate-limit.ts (rateLimited helper, in-memory sliding window)"
provides:
  - "@supabase/ssr@0.10.3 installed and pinned"
  - "lib/supabase-auth.ts: createBrowserSupabase / createServerSupabase / createRouteHandlerSupabase factories + getSession() server util"
  - "lib/use-session.ts: useSession() client hook (subscribes to onAuthStateChange + cleanup)"
  - "app/auth/callback/route.ts: PKCE code-exchange handler with open-redirect guard"
  - "app/api/auth/sign-out/route.ts: rate-limited POST → signOut + 303 redirect"
  - "Test infrastructure: env-var defaults in __tests__/setup.ts so module-load guards do not throw under vitest"
affects: [04-03 (sign-in/sign-up UI + navbar), 05-middleware, 06-account-page-vote-attribution, 07-tier-billing]

# Tech tracking
tech-stack:
  added:
    - "@supabase/ssr@^0.10.3 (per-request cookie binding for Next 16 App Router)"
  patterns:
    - "Per-request Supabase factory (NOT singleton) — required by Next 16 dynamic cookies()"
    - "Two-tier auth verification: client useSession() reads cookie (fast, UI-only); server getSession() calls getUser() over network (verified, authorization-grade)"
    - "Open-redirect defense: literal `if (!next.startsWith(\"/\")) next = \"/\"` immediately after reading the query param, before any redirect branch"
    - "vi.hoisted() for mocks referenced by hoisted vi.mock() factories (vitest 4 pattern)"
    - "vi.stubEnv() for NODE_ENV manipulation in tests (vitest installs read-only proxy)"

key-files:
  created:
    - "lib/supabase-auth.ts (74 lines)"
    - "lib/use-session.ts (39 lines)"
    - "app/auth/callback/route.ts (45 lines)"
    - "app/api/auth/sign-out/route.ts (28 lines)"
    - "__tests__/get-session.test.ts (62 lines)"
    - "__tests__/use-session.test.tsx (104 lines)"
    - "__tests__/auth-callback-route.test.ts (118 lines)"
    - "__tests__/sign-out-route.test.ts (76 lines)"
  modified:
    - "package.json (added @supabase/ssr@^0.10.3)"
    - "bun.lock (resolved)"
    - "__tests__/setup.ts (added env-var defaults — 8 lines)"

key-decisions:
  - "Used vi.hoisted() to declare mocks referenced by vi.mock() factories — vitest 4 hoists vi.mock calls to top of file, so mock targets must also be hoisted"
  - "Used vi.stubEnv()/vi.unstubAllEnvs() for NODE_ENV in tests — Object.defineProperty fails because vitest installs a read-only proxy on process.env"
  - "get-session.test.ts mocks `next/headers` cookies() + `@supabase/ssr` createServerClient (NOT @/lib/supabase-auth) so the REAL getSession() + createServerSupabase() code paths execute. This is what proves the Pitfall 5 invariant in production code, not in a re-implementation."
  - "Added env-var defaults to __tests__/setup.ts (vs. setting them in each test file). Reason: vitest does NOT load .env.local; Next.js does. Module-load guards in lib/supabase-auth.ts would throw before any vi.mock() factory could install. Setup file runs first."

patterns-established:
  - "Per-request Supabase auth factories — three factories for three contexts (browser / Server Component / Route Handler), each with the correct cookie binding"
  - "Server-side auth uses getUser() not getSession() (Supabase guidance — getSession() reads cookie which is spoofable on server; getUser() round-trips to verify)"
  - "Test pattern for env-guarded modules: hoist env defaults in __tests__/setup.ts; use vi.hoisted() for mock targets"
  - "Open-redirect guard immediately after reading the param, no branches between read and guard"

requirements-completed: [AUTH-01, AUTH-02, AUTH-04]

# Metrics
duration: 6min
completed: 2026-05-11
---

# Phase 04 Plan 02: Auth client foundations Summary

**@supabase/ssr per-request factories + useSession() client hook + PKCE callback (open-redirect-guarded) + rate-limited POST sign-out — the cookie-boundary plumbing that AUTH-01/02/04 UI in Plan 04-03 will consume.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-11T00:53:48Z
- **Completed:** 2026-05-11T00:59:33Z
- **Tasks:** 3
- **Files created:** 8 (4 source + 4 test)
- **Files modified:** 3 (package.json, bun.lock, __tests__/setup.ts)

## Accomplishments

- **@supabase/ssr@0.10.3** installed and pinned (verified via `bun pm ls`).
- **`lib/supabase-auth.ts`** — three per-request factories (`createBrowserSupabase`, `createServerSupabase`, `createRouteHandlerSupabase`) + `getSession()` server util. `await cookies()` appears exactly 2× (Pitfall 1: Next 16 async cookies). `getSession()` calls `supabase.auth.getUser()` (Pitfall 5: never `getSession()` on the server). Server Component factory deliberately omits `setAll` (Pitfall 4: cannot set cookies during streaming render).
- **`lib/use-session.ts`** — `"use client"` hook subscribes to `onAuthStateChange` and cleans up via `subscription.unsubscribe()` on unmount (Pitfall 7).
- **`app/auth/callback/route.ts`** — PKCE GET handler with verbatim open-redirect guard `if (!next.startsWith("/")) next = "/"` (Pitfall 3) BEFORE any redirect branch. `runtime = "nodejs"`. x-forwarded-host honored for Vercel preview deploys.
- **`app/api/auth/sign-out/route.ts`** — POST rate-limited via `rateLimited(req, "auth-signout", { windowMs: 60_000, max: 20 })`, calls `supabase.auth.signOut()` server-side (atomic Set-Cookie clear), 303 redirect to `/`.
- **15 vitest cases** across 4 new test files; full suite **104/104 pass** (zero regressions); tsc clean; **Next 16 build green** (both routes registered as `ƒ` Dynamic).

## Task Commits

Each task was committed atomically:

1. **Task 1: Install @supabase/ssr + supabase-auth.ts (factories + getSession) + use-session.ts (hook) + 2 test files** — `0620d8f` (feat)
2. **Task 2: /auth/callback route + open-redirect guard + 6 tests** — `fd79807` (feat)
3. **Task 3: /api/auth/sign-out route + rate-limit + 3 tests** — `e5b56a1` (feat)

**SUMMARY metadata commit:** _to be added immediately below_

## Files Created/Modified

### Source (4 files, ~186 lines)
- `lib/supabase-auth.ts` — three Supabase factories + `getSession()` server util. Uses `getUser()` not `getSession()` (Pitfall 5).
- `lib/use-session.ts` — `useSession()` "use client" hook returning `{ user, loading }`. Subscribes to `onAuthStateChange`, cleans up on unmount.
- `app/auth/callback/route.ts` — PKCE code-exchange GET handler. Open-redirect guard literal greppable. x-forwarded-host honored. `runtime = "nodejs"`.
- `app/api/auth/sign-out/route.ts` — POST handler: rate-limited → `signOut()` → 303 redirect. `runtime = "nodejs"`.

### Tests (4 files, 15 cases)
- `__tests__/get-session.test.ts` — 2 cases (returns user, returns null). Mocks `next/headers` + `@supabase/ssr` so REAL `getSession()` + `createServerSupabase()` code paths execute. Asserts `getUser()` called and `getSession()` NOT called (Pitfall 5 invariant).
- `__tests__/use-session.test.tsx` — 4 cases (initial loading state, transition, SIGNED_IN propagation, unsubscribe on unmount).
- `__tests__/auth-callback-route.test.ts` — 6 cases (happy path, absolute-URL guard, protocol-relative `//evil.com`, exchange error, code missing, x-forwarded-host).
- `__tests__/sign-out-route.test.ts` — 3 cases (signOut + 303, exact rate-limit shape, 429 short-circuits signOut).

### Modified
- `package.json` — added `@supabase/ssr@^0.10.3` to dependencies.
- `bun.lock` — resolved (2 packages installed).
- `__tests__/setup.ts` — 8 lines added: env-var defaults (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `AUDIT_VOTE_SALT`) so module-load guards do not throw under vitest. Uses `??=` so test files can override.

### NOT modified (invariants preserved)
- **`lib/supabase.ts`** — D-07 lock. `git diff --stat HEAD~3 -- lib/supabase.ts` returns zero lines. 11 importers unaffected.
- **`app/api/audit/vote/route.ts`** — Q5 lock. `git diff --stat HEAD~3 -- app/api/audit/vote/route.ts` returns zero lines. Anonymous-vote backward compatibility preserved; Phase 6 will modify, not Phase 4.

## Decisions Made

1. **Test isolation for env-guarded modules.** Module-load env-var guards (`lib/supabase-auth.ts:17`) throw before vitest can install mocks. Two options were available: (a) set `process.env` at the top of every test file (matches `dv-summarize-route.test.ts` pattern); or (b) hoist defaults in `__tests__/setup.ts`. Chose (b) because (i) it keeps individual test files clean of env boilerplate; (ii) `??=` lets test files override when they need different values; (iii) it scales for the upcoming Plan 04-03 tests that will face the same module-load guard.

2. **`get-session.test.ts` mocks the module boundary, not `@/lib/supabase-auth` itself.** Mocking `createServerSupabase` from `@/lib/supabase-auth` does not intercept the call site inside the same module — the real `getSession()` keeps its captured local reference. To prove the **production code path** satisfies the Pitfall 5 invariant, the test mocks `next/headers` (`cookies()`) and `@supabase/ssr` (`createServerClient`) instead. The real `getSession` + `createServerSupabase` then execute end-to-end against the fake supabase shape.

3. **`vi.hoisted()` for mock targets.** Vitest 4 hoists every `vi.mock()` call to the top of the file BEFORE the const declarations of the mocks. Without `vi.hoisted()`, the factory runs before its mocks are defined → `Cannot access 'createServerSupabaseMock' before initialization`. All 4 new test files use this pattern.

4. **`vi.stubEnv()` for `NODE_ENV` in `auth-callback-route.test.ts`.** Vitest installs a read-only proxy on `process.env` that rejects `Object.defineProperty`. The plan's literal sample used `Object.defineProperty(process.env, "NODE_ENV", ...)` — caught at first run, fixed using `vi.stubEnv("NODE_ENV", "production")` + `vi.unstubAllEnvs()` in afterEach.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Vitest does not auto-load `.env.local`; module-load guards throw.**
- **Found during:** Task 1 (Step 1.6, first test run).
- **Issue:** `lib/supabase-auth.ts` throws at module load if `NEXT_PUBLIC_SUPABASE_URL` is unset. Vitest does not load `.env.local`; only `next dev` / `next build` do. Tests imported the module → throw → suite never registered.
- **Fix:** Added env-var defaults to `__tests__/setup.ts` (loaded via vitest's `setupFiles`, runs before any test imports). Used `??=` so tests can override when needed.
- **Files modified:** `__tests__/setup.ts` (+ 8 lines).
- **Verification:** `bun run test -- __tests__/get-session.test.ts __tests__/use-session.test.tsx` runs to completion. Full suite still 104/104 pass.
- **Committed in:** `0620d8f` (Task 1 commit).

**2. [Rule 1 — Bug in plan's verbatim test code] `vi.mock()` factory referenced const-declared mocks → ReferenceError.**
- **Found during:** Task 1 (Step 1.6, second test run after fix #1).
- **Issue:** Plan's `get-session.test.ts` declared `createServerSupabaseMock = vi.fn(...)` at the top of the file, then referenced it inside `vi.mock()`'s factory. Vitest 4 hoists `vi.mock` to the very top, so the factory ran before the const was initialized.
- **Fix:** Wrapped mock declarations in `vi.hoisted()` so vitest hoists them too. Same pattern applied to all 4 new test files for consistency.
- **Files modified:** all 4 new test files.
- **Verification:** All 15 cases pass.
- **Committed in:** `0620d8f`, `fd79807`, `e5b56a1` (per-task as encountered).

**3. [Rule 1 — Bug in plan's verbatim test code] `Object.defineProperty(process.env, ...)` rejected by vitest's read-only env proxy.**
- **Found during:** Task 2 (first test run).
- **Issue:** Plan's `auth-callback-route.test.ts` used `Object.defineProperty(process.env, "NODE_ENV", { value: "production", configurable: true })` to force prod-mode for the x-forwarded-host branch. Vitest 4 installs a read-only proxy on `process.env` that throws `'process.env' only accepts a configurable, writable, and enumerable data descriptor`.
- **Fix:** Replaced with `vi.stubEnv("NODE_ENV", "production")` + `vi.unstubAllEnvs()` in `afterEach`.
- **Files modified:** `__tests__/auth-callback-route.test.ts`.
- **Verification:** All 6 cases pass; original NODE_ENV restored after each test.
- **Committed in:** `fd79807` (Task 2 commit).

**4. [Rule 1 — Bug in plan's test design] `get-session.test.ts` mock could not intercept module-internal calls.**
- **Found during:** Task 1 (third test run after fixes #1, #2).
- **Issue:** Plan's test mocked `@/lib/supabase-auth`'s `createServerSupabase`, but `getSession()` (in the same module) holds a local reference and bypasses the mock — the real `cookies()` was called and threw "cookies was called outside a request scope".
- **Fix:** Re-architected the mock to target the **module boundary** instead: mock `next/headers` (`cookies()`) and `@supabase/ssr` (`createServerClient`). The real `getSession` and `createServerSupabase` now execute end-to-end against the fake supabase shape — this PROVES the Pitfall 5 invariant (`getUser` called, `getSession` not called) in production code.
- **Files modified:** `__tests__/get-session.test.ts` (rewritten).
- **Verification:** Both cases pass; `getUserMock.toHaveBeenCalledTimes(1)`; `getSessionMock.not.toHaveBeenCalled()`.
- **Committed in:** `0620d8f` (Task 1 commit).

---

**Total deviations:** 4 auto-fixed (1 Rule 3 — blocking; 3 Rule 1 — bugs in plan's verbatim test code). All confined to test infrastructure / test code; **zero deviations from the source code in the plan** (lib/supabase-auth.ts, lib/use-session.ts, app/auth/callback/route.ts, app/api/auth/sign-out/route.ts shipped verbatim from the plan).

**Impact on plan:** All four auto-fixes were discovered → fixed → verified within the same task they were found in. No scope creep; the source files match the plan's verbatim code exactly. The improved `get-session.test.ts` arguably proves a STRONGER invariant than the plan intended, because it exercises the real `getSession()` code path (not a mock that bypasses it).

## Issues Encountered

None beyond the four documented test-code deviations above. The Next 16 build (most-likely failure surface for `cookies()`-related shape errors) compiled cleanly on the first attempt; both new routes registered as Dynamic (`ƒ`).

## Verification Gates (whole-plan)

All 11 plan-level success criteria pass:

```
=== 1. @supabase/ssr installed ===           ├── @supabase/ssr@0.10.3
=== 2. lib/supabase.ts byte-untouched ===    OK: zero changes
=== 3. audit/vote byte-untouched ===         OK: zero changes
=== 4. supabase-auth.ts exports ===          4
=== 5. await cookies() exactly 2× ===        2
=== 6. getUser() server-side ===             1
=== 7. NO getSession() in supabase-auth ===  0
=== 8. getSession() in use-session.ts (browser-only) === 1
=== 9. open-redirect literal greppable ===   if (!next.startsWith("/")) next = "/";
=== 10. NO getSession() in auth/callback === 0
=== 11. sign-out wired right ===             rate-limit OK / signOut OK / 303 OK
```

Plus:
- `bunx tsc --noEmit` — clean (zero TS errors)
- `bun run test` — **104/104 pass** (15 new + 89 existing; zero regressions)
- `bun run build` — **Compiled successfully in 1536ms**; both new routes registered

## User Setup Required

None for this plan. **Plan 04-03 will require operator setup** (per 04-CONTEXT.md "Pre-implementation operator checklist"):
1. Enable email/password provider in Supabase Dashboard
2. Enable Google OAuth + paste client ID/secret
3. Add production + local-dev callback URLs in Google Cloud Console
4. Add `NEXT_PUBLIC_SUPABASE_AUTH_REDIRECT_URL` env var in Vercel + `.env.local`
5. Verify Bulgarian-friendly Supabase email-template renders

These are deferred to Plan 04-03 because nothing in 04-02 invokes Google OAuth or email-magic-link flows end-to-end.

## Next Phase Readiness

**Plan 04-03 (sign-in/sign-up UI + navbar + magic-link/Google flows) can begin immediately.** It will consume:
- `createBrowserSupabase()` — for `signInWithPassword` / `signUp` / `signInWithOAuth` calls in form handlers.
- `useSession()` — for the navbar Влез/Профил switch (D-09).
- `getSession()` — for any Server Component that needs to know the current user.
- `/auth/callback` — already shipped; magic-link + Google OAuth both deliver here.
- `/api/auth/sign-out` — already shipped; navbar Изход button POSTs here.

**Phase 5 (middleware, protected-route helper) is also unblocked.** The per-request factory pattern + `getSession()` util are exactly what middleware will lean on.

**Known stubs:** None. All four new files are fully wired; no placeholders, no TODO comments shipped, no empty arrays flowing to UI.

## Self-Check: PASSED

All 8 created files exist on disk:
- FOUND: lib/supabase-auth.ts
- FOUND: lib/use-session.ts
- FOUND: app/auth/callback/route.ts
- FOUND: app/api/auth/sign-out/route.ts
- FOUND: __tests__/get-session.test.ts
- FOUND: __tests__/use-session.test.tsx
- FOUND: __tests__/auth-callback-route.test.ts
- FOUND: __tests__/sign-out-route.test.ts

All 3 task commits present in git log:
- FOUND: 0620d8f (Task 1)
- FOUND: fd79807 (Task 2)
- FOUND: e5b56a1 (Task 3)

D-07 invariant: `git diff --stat HEAD~3 -- lib/supabase.ts` → zero lines. PASS.
Q5 invariant: `git diff --stat HEAD~3 -- app/api/audit/vote/route.ts` → zero lines. PASS.

---
*Phase: 04-auth-foundation*
*Completed: 2026-05-11*
