---
phase: 04-auth-foundation
plan: 03
subsystem: auth
tags: [auth, ui, forms, navbar, bulgarian, oauth, partial-summary, manual-smoke-pending]

# Dependency graph
requires:
  - phase: 04-01
    provides: "user_profiles table + RLS + handle_new_user() trigger"
  - phase: 04-02
    provides: "lib/supabase-auth.ts (server factories + getSession), lib/use-session.ts (client hook), /auth/callback PKCE handler, /api/auth/sign-out POST"
provides:
  - "User-facing /sign-in page (Bulgarian, hand-rolled, email/password + Google OAuth)"
  - "User-facing /sign-up page (Bulgarian, hand-rolled, email/password/display-name)"
  - "/sign-up/check-email magic-link landing page"
  - "<AuthNavLink /> client component in navbar (Влез/Профил via useSession)"
  - "lib/supabase-browser.ts — browser-only Supabase factory (split out of lib/supabase-auth.ts to fix Next 16 client/server bundling boundary)"
affects: [05-middleware, 06-account-page-vote-attribution]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Browser/server Supabase client split: separate lib/supabase-browser.ts (no `next/headers` imports) for `\"use client\"` consumers; lib/supabase-auth.ts (server factories) stays byte-untouched"
    - "vi.hoisted() for vi.mock factory targets — carried forward from Plan 04-02"
    - "Cyrillic test queries: prefer exact `getByLabelText(\"Имейл\")` over `/имейл/i` regex which would also match \"Име\""

key-files:
  created:
    - "app/sign-up/page.tsx (22 lines) — Server Component shell"
    - "app/sign-up/sign-up-form.tsx (149 lines) — \"use client\" hand-rolled form"
    - "app/sign-up/check-email/page.tsx (33 lines) — magic-link landing"
    - "app/sign-in/page.tsx (20 lines) — Server Component shell"
    - "app/sign-in/sign-in-form.tsx (158 lines) — \"use client\" form + Google OAuth"
    - "app/auth-nav-link.tsx (40 lines) — \"use client\" navbar link"
    - "lib/supabase-browser.ts (39 lines) — browser-only factory (deviation #1)"
    - "__tests__/sign-up-form.test.tsx (123 lines) — 5 cases"
    - "__tests__/sign-in-form.test.tsx (104 lines) — 4 cases"
    - "__tests__/auth-nav-link.test.tsx (50 lines) — 4 cases"
  modified:
    - "app/layout.tsx (+2 lines) — import + render <AuthNavLink />"
    - "lib/use-session.ts (1 line changed) — import swap to @/lib/supabase-browser"
    - "__tests__/use-session.test.tsx (1 line changed) — vi.mock path swap"

key-decisions:
  - "When the build broke on Task 2 (Turbopack: \"You're importing a module that depends on 'next/headers'\"), the fix preserved all three byte-untouched invariants the user listed (lib/supabase.ts, lib/supabase-auth.ts, app/api/audit/vote/route.ts) by adding a NEW lib/supabase-browser.ts rather than splitting lib/supabase-auth.ts. The canonical Supabase + Next 16 App Router pattern (Context7 /supabase/ssr verified 2026-05-11) recommends this split anyway."
  - "Cyrillic regex traps: the plan's verbatim test code used `getByLabelText(/имейл/i)` which silently matches both 'Имейл' and 'Име' (display-name field) because /имейл/ contains /име/. Switched to exact-string `getByLabelText(\"Имейл\")` etc. to disambiguate."

patterns-established:
  - "Two Supabase auth files: lib/supabase-auth.ts (server-only — imports next/headers; getSession + createServerSupabase + createRouteHandlerSupabase) and lib/supabase-browser.ts (client-only — createBrowserSupabase only). Future code should import from the right one based on `\"use client\"` boundary."

requirements-completed: []
requirements-pending-on-task-3: [AUTH-01, AUTH-02, AUTH-04]

# Metrics
duration: ~10min (Tasks 1+2 only; Task 3 BLOCKING checkpoint pending orchestrator)
completed: 2026-05-11
status: PARTIAL — Tasks 1+2 of 3 complete; Task 3 (BLOCKING manual smoke) pending
---

# Phase 04 Plan 03 (PARTIAL — Tasks 1+2): Sign-in/sign-up UI + navbar

**Hand-rolled Bulgarian /sign-in + /sign-up + /sign-up/check-email pages, plus a tiny <AuthNavLink /> client component in the navbar that flips between "Влез" and "Профил" via useSession() — wires the user-facing surface of AUTH-01/02/04 onto the auth-client foundations Plan 04-02 shipped. Task 3 (BLOCKING live OAuth + email + sign-out + open-redirect + Q5-regression manual smoke) is intentionally deferred to the orchestrator.**

## Scope of THIS Summary

This summary documents **Tasks 1 and 2 only**, per the orchestrator's explicit scope cap. Task 3 is a `checkpoint:human-verify gate="blocking"` that requires:
- A real Google OAuth consent flow against `accounts.google.com`
- A real email-verification link delivered through Supabase's SMTP
- Sign-out, open-redirect, and anonymous /audit/vote regression smokes

None of those are scriptable from this executor; the orchestrator will drive them with the user. **AUTH-01, AUTH-02, AUTH-04 are NOT marked complete** in this summary because Task 3's smoke is the proof that the trigger fires, the email arrives, and the cookie cycles correctly end-to-end.

## Performance

- **Duration:** ~10 min (Tasks 1+2)
- **Started:** 2026-05-11T04:03:00Z (approx)
- **Tasks 1+2 completed:** 2026-05-11T04:11:00Z (approx)
- **Tasks executed:** 2 of 3
- **Files created:** 10 (6 source + 1 deviation file + 3 test)
- **Files modified:** 3 (app/layout.tsx, lib/use-session.ts, __tests__/use-session.test.tsx — last two from Rule 3 fix)
- **Vitest delta:** +13 cases (5 sign-up-form + 4 sign-in-form + 4 auth-nav-link). Full suite: 104 → **117 passing**.

## Task Commits

1. **Task 1: Sign-up surface — page, form, check-email + 5 vitest cases** — `838ae25` (feat)
2. **Task 2: Sign-in surface + AuthNavLink + layout integration + 8 vitest cases** — `883ac22` (feat)
3. **PARTIAL SUMMARY metadata commit:** _to be added immediately below_

## Accomplishments

### Task 1 (commit 838ae25)
- **`app/sign-up/page.tsx`** — Server Component shell, Bulgarian heading "Регистрирайте се" (D-10).
- **`app/sign-up/sign-up-form.tsx`** — hand-rolled form (D-01), three required fields (Имейл / Парола / Име), uses `useState + onSubmit + Status` enum (alert-form pattern), calls `supabase.auth.signUp({ email, password, options: { emailRedirectTo: '${origin}/auth/callback?next=/', data: { display_name } } })`, routes to `/sign-up/check-email` on success (D-02), Bulgarian error mapping for the standard families (already-registered / weak-password / invalid-email / fallback).
- **`app/sign-up/check-email/page.tsx`** — magic-link landing (D-02), Bulgarian "Изпратихме потвърждение на имейла Ви" + "Натиснете върху линка в имейла, за да завършите регистрацията.", cross-link "Към вход" → `/sign-in`.
- **`__tests__/sign-up-form.test.tsx`** — 5 cases: signUp call shape, router redirect to check-email, duplicate-email Bulgarian error, whitespace-only display-name disables submit (D-03 invariant), email + display-name trim.

### Task 2 (commit 883ac22)
- **`app/sign-in/page.tsx`** — Server Component shell, "Влезте в профила си" (D-10).
- **`app/sign-in/sign-in-form.tsx`** — hand-rolled form (D-01) with email/password + Google OAuth button. `signInWithPassword` routes to `/`; `signInWithOAuth({ provider: "google", options: { redirectTo: "${origin}/auth/callback?next=/" } })` initiates the redirect (no awaited handling — Supabase navigates the browser). Bulgarian error mapping for invalid-credentials, email-not-confirmed, invalid-email, fallback. Cross-link "Нямаш профил? Регистрирай се" → `/sign-up`.
- **`app/auth-nav-link.tsx`** — `"use client"` navbar link reading `useSession()`. Anonymous → "Влез" → `/sign-in`; signed-in → "Профил" → `/account`; loading → renders `null` (prevents SSR/CSR text flash). Uses `hover:underline underline-offset-4` (D-09 navbar pattern).
- **`app/layout.tsx`** — surgically modified: +1 import line, +1 render line. `git diff --stat app/layout.tsx` = `2 ++`. All 12 existing nav links byte-identical.
- **`lib/supabase-browser.ts`** — NEW. Browser-only `createBrowserSupabase()` factory, no `next/headers` import. See deviation #1.
- **`__tests__/sign-in-form.test.tsx`** — 4 cases: signInWithPassword shape + router push to `/`, invalid-credentials Bulgarian error, signInWithOAuth shape (`provider: "google"` + redirectTo), cross-link to `/sign-up`.
- **`__tests__/auth-nav-link.test.tsx`** — 4 cases: loading=true → empty DOM, anonymous → "Влез"/`/sign-in`, signed-in → "Профил"/`/account`, hover:underline class invariant.

### Whole-plan verification (re-runnable)

```
=== bun run test ===                  117/117 pass (104 prior + 13 new; zero regressions)
=== bunx tsc --noEmit ===             clean (zero TS errors)
=== bun run build ===                 ✓ Compiled successfully in 1450ms
                                       /sign-in, /sign-up, /sign-up/check-email registered as ○ (Static)
                                       /auth/callback, /api/auth/sign-out, /api/audit/vote unchanged
=== git diff --stat lib/supabase.ts (D-07) ===                       [empty — untouched]
=== git diff --stat lib/supabase-auth.ts (Plan 04-02 lock) ===       [empty — untouched]
=== git diff --stat app/api/audit/vote/route.ts (Q5) ===             [empty — untouched]
=== git diff --stat app/layout.tsx ===                                2 lines added (1 import + 1 render)
```

## Files Created/Modified

### Created (10 files)
- `app/sign-up/page.tsx` — 22 lines
- `app/sign-up/sign-up-form.tsx` — 149 lines
- `app/sign-up/check-email/page.tsx` — 33 lines
- `app/sign-in/page.tsx` — 20 lines
- `app/sign-in/sign-in-form.tsx` — 158 lines
- `app/auth-nav-link.tsx` — 40 lines
- `lib/supabase-browser.ts` — 39 lines (NEW — deviation #1)
- `__tests__/sign-up-form.test.tsx` — 123 lines (5 cases)
- `__tests__/sign-in-form.test.tsx` — 104 lines (4 cases)
- `__tests__/auth-nav-link.test.tsx` — 50 lines (4 cases)

### Modified
- `app/layout.tsx` — +2 lines (1 import, 1 render). All 12 existing nav links byte-identical.
- `lib/use-session.ts` — 1 line changed: import path swap to `@/lib/supabase-browser` (deviation #1 cascade).
- `__tests__/use-session.test.tsx` — 1 line changed: `vi.mock` target swap to match the new import path.

### NOT modified (invariants preserved — re-verified at end of Task 2)
- **`lib/supabase.ts`** — D-07 lock holds. Zero changes.
- **`lib/supabase-auth.ts`** — Plan 04-02 byte-untouched lock holds. Zero changes. The deviation-#1 fix added a new sibling file rather than splitting this one.
- **`app/api/audit/vote/route.ts`** — Q5 lock holds. Zero changes. Anonymous vote path is intact for the Task 3 manual smoke.

## Decisions Made

1. **Browser/server file split (instead of in-place rework of lib/supabase-auth.ts).** When the Task 2 build broke with Turbopack pulling `next/headers` into the client bundle (via `lib/use-session.ts` → `lib/supabase-auth.ts`), the user's brief locked `lib/supabase-auth.ts` byte-untouched. The smallest fix that respects the lock was a NEW file `lib/supabase-browser.ts` with the browser-only factory, plus a one-line import swap in 3 client-side modules (lib/use-session.ts, app/sign-up/sign-up-form.tsx, app/sign-in/sign-in-form.tsx). The canonical Supabase docs (Context7 /supabase/ssr, 2026-05-11) recommend the split-file pattern, so this is also the architecturally-correct shape going forward; Plan 04-02's choice of one file was a latent-bug-waiting-to-surface that this plan is the first to expose.

2. **Cyrillic exact-string `getByLabelText` over regex.** `getByLabelText(/имейл/i)` would silently match both the email field ("Имейл") AND the display-name field ("Име") because `имейл` *contains* `име`. Switched to `getByLabelText("Имейл")` / `getByLabelText("Парола")` / `getByLabelText("Име")` for the sign-up form's three-field test. Sign-in form's two-field test was unaffected (no display-name field) but used the same exact-string pattern for consistency.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Next 16 build fails: client-side import of lib/supabase-auth.ts pulls `next/headers` into the browser bundle.**
- **Found during:** Task 2, first `bun run build` (after writing all source/test files for Tasks 1+2).
- **Issue:** Once `app/layout.tsx` imports `<AuthNavLink />` (a `"use client"` component), Turbopack walks the client graph: `auth-nav-link.tsx` → `lib/use-session.ts` (also `"use client"`) → `lib/supabase-auth.ts` (imports `next/headers` for the server factories). Server-only modules cannot be in the client bundle. Build fails: `"You're importing a module that depends on 'next/headers'. This API is only available in Server Components in the App Router…"`. Plan 04-02's build passed only because no production-graph component yet consumed `useSession()` / the browser factory; the bug was latent until Task 2 wired the navbar.
- **Fix:** Created NEW file `lib/supabase-browser.ts` (37 lines, no server imports) exposing only `createBrowserSupabase`. Swapped the import in three client-side modules:
  - `lib/use-session.ts` (Plan 04-02 file — minimal touch, behaviorally identical)
  - `app/sign-up/sign-up-form.tsx` (Task 1 file)
  - `app/sign-in/sign-in-form.tsx` (Task 2 file)
  Also updated test mocks in `__tests__/use-session.test.tsx` and `__tests__/sign-up-form.test.tsx` to target the new module path.
- **Files modified:** see above. **`lib/supabase-auth.ts` itself was NOT modified — the user's lock holds.**
- **Verification:** `bun run test` 117/117 pass; `bunx tsc --noEmit` clean; `bun run build` succeeds; new routes registered.
- **Why not Rule 4 (architectural — ask first):** This was a build-blocker found AFTER the source code was written exactly per the plan, not an architectural change to the plan's design. The fix shape (split-file) matches the canonical Supabase docs (Context7 /supabase/ssr 2026-05-11) — it's the architecturally correct shape, not a workaround. The user's invariant list explicitly named `lib/supabase-auth.ts` as one of the 3 byte-untouched files, and the chosen fix preserves it.
- **Committed in:** `883ac22` (Task 2 commit).

**2. [Rule 1 — Bug in plan's verbatim test code] `getByLabelText(/имейл/i)` ambiguous in Cyrillic — matches both "Имейл" and "Име".**
- **Found during:** Task 1, first `bun run test`.
- **Issue:** The plan's `__tests__/sign-up-form.test.tsx` used `screen.getByLabelText(/имейл/i)` for the email field and `screen.getByLabelText(/име/i)` for the display-name field. The first regex matches BOTH labels (because "имейл" contains "име"). React Testing Library throws "Found multiple elements with the text…".
- **Fix:** Switched all 6 `getByLabelText` calls in `sign-up-form.test.tsx` (and 2 in `sign-in-form.test.tsx`, for consistency) to exact-string queries: `getByLabelText("Имейл")`, `getByLabelText("Парола")`, `getByLabelText("Име")`.
- **Files modified:** `__tests__/sign-up-form.test.tsx`, `__tests__/sign-in-form.test.tsx`.
- **Verification:** All 13 cases pass.
- **Committed in:** `838ae25` (Task 1 commit) and `883ac22` (Task 2 commit).

**3. [Style — vi.hoisted carried from Plan 04-02 pattern] All 3 new test files use `vi.hoisted({ ... })` for mock targets.**
- **Not strictly a deviation** — the plan's verbatim test code declared mocks at top-level. Plan 04-02 SUMMARY documented this as a forced fix because vitest 4 hoists `vi.mock()` factories above `const` declarations. Rather than re-discover the same bug 3 more times, applied the established pattern to all 3 new test files preemptively.
- **Files modified:** `__tests__/sign-up-form.test.tsx`, `__tests__/sign-in-form.test.tsx`, `__tests__/auth-nav-link.test.tsx`.
- **Committed in:** `838ae25`, `883ac22`.

---

**Total deviations: 2 auto-fixed (1 Rule 3 build-blocker; 1 Rule 1 bug in test code) + 1 preemptive style alignment.** Source code matches the plan's verbatim listing in every functional respect; the only structural divergence is the new `lib/supabase-browser.ts` file (Rule 3 fix).

## Issues Encountered

Beyond the three deviations above: none. The Bulgarian copy lands per D-10; the design tokens match `/audit` + `/intel`; the navbar diff is 2 lines; all three byte-untouched invariants hold; the build is green.

## Self-Check: PASSED

All 10 created files exist:
- FOUND: app/sign-up/page.tsx
- FOUND: app/sign-up/sign-up-form.tsx
- FOUND: app/sign-up/check-email/page.tsx
- FOUND: app/sign-in/page.tsx
- FOUND: app/sign-in/sign-in-form.tsx
- FOUND: app/auth-nav-link.tsx
- FOUND: lib/supabase-browser.ts
- FOUND: __tests__/sign-up-form.test.tsx
- FOUND: __tests__/sign-in-form.test.tsx
- FOUND: __tests__/auth-nav-link.test.tsx

Both task commits in git log:
- FOUND: 838ae25 (Task 1)
- FOUND: 883ac22 (Task 2)

D-07 invariant: `git diff HEAD~2 --stat lib/supabase.ts` → zero lines. PASS.
Plan 04-02 lock: `git diff HEAD~2 --stat lib/supabase-auth.ts` → zero lines. PASS.
Q5 invariant: `git diff HEAD~2 --stat app/api/audit/vote/route.ts` → zero lines. PASS.
Layout surgical-edit invariant: `git diff HEAD~2 --stat app/layout.tsx` → 2 lines. PASS.

## TASK 3 — PENDING ORCHESTRATOR (BLOCKING)

Task 3 is a `checkpoint:human-verify gate="blocking"` requiring 5 manual smokes against live external services:

1. **Smoke 1 — Google OAuth happy path** (AUTH-02). Click "Влез с Google" → consent → callback → navbar shows "Профил" → DB `user_profiles` row exists with `display_name` = Google profile name (D-03 — trigger reads `raw_user_meta_data->>'full_name'`).
2. **Smoke 2 — Email signup happy path** (AUTH-01). Submit form → land on /sign-up/check-email → receive Bulgarian email → click link → callback → navbar shows "Профил" → DB row with `display_name` = whatever the user typed (D-03 — trigger reads `raw_user_meta_data->>'display_name'`).
3. **Smoke 3 — Open-redirect guard** (RESEARCH Pitfall 3). Visit `/auth/callback?next=https://example.com` (no code) → expect redirect to `/sign-in?error=callback`, MUST stay on lex-web origin.
4. **Smoke 4 — Sign-out** (AUTH-04). POST `/api/auth/sign-out` → cookie cleared → navbar reverts to "Влез".
5. **Smoke 5 — Phase 6 backward-compatibility** (Q5). Anonymous `/audit/finding/<id>` vote still works. Confirms Phase 4 made zero changes to `/api/audit/vote` (already verified at the source-diff level: `git diff HEAD~2 --stat app/api/audit/vote/route.ts` is empty).

### Files the manual smoke should hit

- `/sign-in` — full Bulgarian sign-in page (Server Component shell + client form)
- `/sign-up` — full Bulgarian sign-up page (Server Component shell + client form)
- `/sign-up/check-email` — landing after sign-up submit
- `/auth/callback` — PKCE exchange (Plan 04-02)
- `/api/auth/sign-out` — POST endpoint (Plan 04-02)
- `/audit/finding/<id>` — vote button (Q5 regression check; not changed by Phase 4)
- The navbar in any page renders `<AuthNavLink />` — should show "Влез" anonymous, "Профил" signed-in

### Pre-flight reminder for the orchestrator

Per Plan 04-CONTEXT.md "Pre-implementation operator checklist," BEFORE the smokes the operator must have completed:
1. Email/password provider enabled in Supabase Dashboard
2. Google OAuth provider enabled + Google client ID/secret pasted
3. Production + local-dev callback URLs added in Google Cloud Console
4. `NEXT_PUBLIC_SUPABASE_AUTH_REDIRECT_URL` env var set in Vercel + .env.local
5. Bulgarian email template installed in Supabase Dashboard

If any of those are missing, Smokes 1 / 2 will fail in known patterns documented in the plan's "Common gotchas" section.

### What unblocks closing AUTH-01/02/04

When Task 3 returns "approved" + the two `display_name` values from Smokes 1+2, AUTH-01 / AUTH-02 / AUTH-04 are satisfied (AUTH-03 was satisfied by Plan 04-01's DB schema). The full Phase 4 SUMMARY can then be amended (or a follow-up commit appended) to mark all four requirements complete and flip the ROADMAP entry.

---
*Phase: 04-auth-foundation*
*Plan: 03 (Tasks 1+2 of 3 complete)*
*Generated: 2026-05-11*
*Task 3 (BLOCKING manual smoke) pending orchestrator action.*
