# Phase 4 — Plan Check (gsd-plan-checker)

**Phase:** Auth foundation (v2.3 opener)
**Reviewed:** 2026-05-11
**Plans verified:** 04-01, 04-02, 04-03
**Stance:** FORCE (start from "these plans will not deliver" hypothesis)

---

## Verdict per Dimension

### 1. ROADMAP Success Criteria coverage — PASS

| SC | What must be true | Delivered by |
|----|-------------------|-------------|
| SC-1 | New user signs up with email+password and verification flow completes | 04-01 Task 1+3 (trigger + RLS landed) → 04-02 Task 1 (signUp shape via createBrowserSupabase) → 04-02 Task 2 (callback exchanges code) → 04-03 Task 1 (`<SignUpForm>` calls `signUp` with `emailRedirectTo` + `data.display_name`; routes to `/sign-up/check-email`) → 04-03 Task 3 Smoke 2 (real email arrives, link verifies, navbar flips to "Профил") |
| SC-2 | New user signs in with Google OAuth and `user_profiles` row created on first sign-in | 04-01 Task 1 (trigger reads `raw_user_meta_data->>'full_name'`) → 04-02 Task 2 (callback) → 04-03 Task 2 (`onGoogleSignIn` → `signInWithOAuth` w/ `provider:'google'`, `redirectTo …/auth/callback?next=/`) → 04-03 Task 3 Smoke 1 (DB-checked display_name == Google profile name) |
| SC-3 | Sign-out clears session; UI reflects anonymous | 04-02 Task 3 (`POST /api/auth/sign-out` → `signOut()` + 303 redirect) + `<AuthNavLink>` reactive via `useSession()` (04-03 Task 2) → 04-03 Task 3 Smoke 4 |
| SC-4 | `user_profiles` table has RLS — users can only read/update own row | 04-01 Task 1 SQL (both policies USING `auth.uid() = id`) + Task 2 probes 2 + 3 (RLS enabled + 2 policies present) + Task 3 live-DB confirmation |

All four ROADMAP success criteria trace to a specific task with concrete acceptance criteria. No SC is asserted-but-undelivered.

### 2. AUTH-01..AUTH-04 coverage — PASS

| Req | Tasks | Acceptance Criteria |
|-----|-------|---------------------|
| AUTH-01 (sign-up + verification) | 04-02 T1 (createBrowserSupabase), 04-02 T2 (callback exchanges code), 04-03 T1 (form calls signUp with emailRedirectTo + display_name; routes to check-email) | grep `supabase.auth.signUp` in sign-up-form.tsx; vitest case "calls signUp with email/password/display_name/emailRedirectTo"; Smoke 2 verifies real email |
| AUTH-02 (Google OAuth) | 04-02 T2 (PKCE exchange in /auth/callback), 04-03 T2 (`signInWithOAuth provider:'google' redirectTo:.../auth/callback?next=/`) | grep `signInWithOAuth` + `provider: "google"` in sign-in-form.tsx; vitest case asserts shape; Smoke 1 verifies real consent flow + DB row |
| AUTH-03 (user_profiles + RLS) | 04-01 T1 SQL + T2 applier probes + T3 live-apply | 5 OK probes incl. RLS-enabled + 2 policies present + SECURITY DEFINER + search_path=public + trigger registered; idempotency proven via 2nd run |
| AUTH-04 (sign-in/up/out + getSession + useSession) | 04-02 T1 (4 exports incl. `getSession` + `useSession`), 04-02 T3 (sign-out route), 04-03 T1+T2 (UI pages + AuthNavLink) | grep counts on 4 exports; `await cookies()` count==2; `getUser()`==1, server `getSession()`==0; vitest covers hook subscribe/unsubscribe |

Each requirement has at least one named task with a greppable assertion or BLOCKING smoke step.

### 3. CONTEXT decision traceability (D-01..D-10) — PASS

| Decision | Implementing task | Verification |
|----------|-------------------|--------------|
| D-01 hand-rolled forms | 04-03 T1+T2 (no @supabase/auth-ui-react import; `useState`+`onSubmit` pattern from alert-form.tsx) | RESEARCH §"NOT added" excludes it; package.json delta only adds @supabase/ssr |
| D-02 magic-link only | 04-03 T1 (`/sign-up/check-email` page; no OTP UI); D-02 explicitly cited inline | grep `Изпратихме потвърждение` in check-email/page.tsx |
| D-03 display_name required (email) + auto from Google | 04-03 T1 (form requires displayName, canSubmit gate, trim before submit) + 04-01 T1 (trigger COALESCE: display_name → full_name → split_part) | vitest "disables submit when display name is whitespace-only"; Smoke 1+2 DB-checks display_name |
| D-04 separate /sign-in + /sign-up | 04-03 T1 (sign-up page) + T2 (sign-in page) + cross-links both directions | grep `Имаш профил?` + `Нямаш профил?` |
| D-05 Postgres trigger HARDENED | 04-01 T1 SQL with `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public` | T1 verify greps the literal; T2 probe 4 asserts `prosecdef=true AND proconfig::text LIKE '%search_path=public%'` |
| D-06 NO locale column | 04-01 T1 (`(id, display_name, created_at)` only) + negative grep | T1 verify ends with `! grep -q 'locale'`; cross-plan verification re-greps for `locale` |
| D-07 lib/supabase.ts byte-untouched | 04-02 frontmatter excludes lib/supabase.ts from files_modified; verification step `git diff --stat lib/supabase.ts` | Re-verified in 04-03's verification block (line 1149) — invariant carried forward across both downstream plans |
| D-08 OAuth callback URLs operator-managed | 04-01 Task 0 BLOCKING checklist enumerates all dashboard steps | Task 0 enumerates Supabase + Google Console + Site URL/Redirect allow-list |
| D-09 navbar Влез/Профил right-aligned hover:underline | 04-03 T2 `<AuthNavLink>` + layout.tsx Edit appends as last nav child | grep `hover:underline underline-offset-4` in auth-nav-link.tsx; vitest case asserts the className contains both |
| D-10 Bulgarian formal-legal copy | 04-03 T1+T2 (forms with "Влезте в профила си", "Регистрирайте се", "Имейл/Парола/Име", "Невалидни данни за вход") | grep `Влезте в профила` `Регистрирайте се` `Изпратихме потвърждение` in 3 page files |

All 10 decisions land in tasks. None contradicted, none deferred.

### 4. RESEARCH consumption — PASS

- **Open-redirect guard (Pitfall 3):** 04-02 T2 ships the literal `if (!next.startsWith("/")) next = "/"`. Two vitest cases: absolute URL (`https://evil.com`) AND protocol-relative (`//evil.com`). The `//evil.com` case correctly documents the `same-origin//evil.com` normalization (location stays on lex-web origin). Smoke 3 manually confirms.
- **Cookie chunking (Pitfall 4):** 04-02 T1 uses `@supabase/ssr`'s canonical `setAll` from RESEARCH Pattern 3 verbatim. No custom serializer anywhere. T-04-09 names this risk explicitly.
- **Async cookies (Pitfall 1):** Two `await cookies()` calls (server + route-handler factories). Verify line asserts `grep -c 'await cookies()'` == 2.
- **getUser not getSession server-side (Pitfall 5):** 04-02 T1 verify asserts `grep -c 'supabase.auth.getUser()'` == 1 AND `grep -c 'supabase.auth.getSession()'` == 0 in lib/supabase-auth.ts. vitest get-session.test.ts asserts the invariant directly.

All four critical pitfalls are locked in code AND tested.

### 5. Cross-plan invariant guards — PASS

- **04-02 confirms 04-01's schema:** Implicit (depends_on: [04-01]); not explicitly grep-verified in 04-02. **WARNING (minor):** 04-02 could have added a pre-flight `psql` probe asserting `user_profiles` exists before tests run, but vitest mocks Supabase so the schema isn't actually exercised in 04-02. Acceptable.
- **04-03 confirms 04-02's helpers exist:** vitest imports `@/lib/supabase-auth` + `@/lib/use-session` — would fail at import-time if missing. tsc gate further enforces.
- **D-07 lib/supabase.ts byte-untouched:** Asserted in 04-02 (line 900 of plan) AND re-asserted in 04-03 (line 1149). Invariant carried forward.
- **Q5 audit/vote byte-untouched:** Asserted in 04-03 (line 1152) and Smoke 5 (real anonymous vote happens-path). NOT asserted in 04-01 or 04-02 — but those plans modify zero app/api/audit files, so practically airtight. Cross-plan verification at end of 04-03 catches any regression introduced earlier.

### 6. BLOCKING checkpoint placement — PASS

Three BLOCKING gates at the right boundaries:

1. **04-01 Task 0 (operator checklist) BEFORE any code work** — correctly placed at the top of Wave 1. Without these dashboard steps, Smoke 1+2 in 04-03 would fail with "redirect URL not allowed" / English emails. Front-loading is correct.
2. **04-01 Task 3 (live-DB apply with idempotency proof)** — gates the schema mutation; downstream plans depend on the trigger existing. Two-run requirement proves idempotency without trusting the SQL author's IF-NOT-EXISTS discipline.
3. **04-03 Task 3 (5-smoke verification incl. live Google OAuth + email + open-redirect + sign-out + Q5 anonymous vote regression)** — gates the user-visible flow; covers the surface area vitest cannot reach (Google's consent screen, real cookie chunking on prod, Bulgarian email rendering). Correctly placed at end of Wave 3.

No missing gate. No extra gate. The 1 + 1 + 1 layout matches the dependency wave structure (one gate per wave-internal hand-off boundary).

### 7. Scope boundary — PASS

Verified absent in all 3 plans:
- NO `proxy.ts` / middleware logic (Phase 5) — `grep -ri 'proxy.ts\|middleware' .planning/phases/04-auth-foundation/04-*-PLAN.md` returns only RESEARCH-style references explaining what comes later, no implementation tasks.
- NO `/account` page implementation — AuthNavLink links to `/account` but the page itself is deferred (RESEARCH explicitly notes "Phase 4 the link still works — just lands on a 404 until Phase 5+6 land"). Acceptable scope deferral, called out clearly.
- NO `tier` enum (Phase 7) — table is exactly `(id, display_name, created_at)`.
- NO additional OAuth providers — only `provider: "google"` appears.
- NO 2FA / OTP / locale column / combined /auth route — all explicitly absent.

### 8. Acceptance criteria specificity — PASS

Sample of `success_criteria` checks across plans:
- "`grep -c 'await cookies()' lib/supabase-auth.ts` returns 2" — concrete + greppable + numeric
- "`git diff --stat lib/supabase.ts` shows zero changes" — concrete
- "Operator runs `bun run db:auth-schema` ALL probes report OK" — observable exit codes
- "5 + 4 + 4 = 13 cases" — counted vitest cases per file
- Smoke checkpoints provide exact SQL queries to copy-paste for DB verification

Zero criteria are vague ("feels right", "works correctly", etc.).

### 9. Test-vs-mock balance — PASS

- vitest mocks Supabase Auth in all 4 test files for 04-02 + all 3 for 04-03 (per RESEARCH §Q4 — "vitest can't drive Google's OAuth consent screen")
- BLOCKING smoke at 04-03 Task 3 exercises the REAL Google flow + real email + real cookie chunking + real Bulgarian email template
- Line correctly drawn: invocation-shape assertions in vitest (cheap, fast, deterministic); side-effect verification in BLOCKING smoke (slow, manual, but unforgeable)
- 04-01 Task 3 step 5 offers an OPTIONAL trigger smoke via Supabase Dashboard "Send invitation" — clean way to verify the trigger fires before the full flow runs

### 10. Risk of "ships but doesn't actually solve the problem" — PASS

Threat model coverage rules out the standard failure modes:
- Cookie chunking failure on Google tokens (only manifests in prod) — 04-03 Smoke 1 uses a real Google account, would surface chunking failure as "Auth session missing" in the navbar
- `await cookies()` missed somewhere — `grep -c 'await cookies()' == 2` is enforced; tsc would also catch the type mismatch (`Promise<ReadonlyRequestCookies>` vs `ReadonlyRequestCookies`)
- Trigger silently misses display_name — Smoke 1 + 2 each include a SQL DB-check for the actual `display_name` value (Google profile name AND email-form display name)
- Open-redirect via `?next=` — 2 vitest cases + Smoke 3 manual verification on both `https://example.com` AND `//evil.com` variants
- Server Component caching the navbar to anonymous state forever — `<AuthNavLink>` is `"use client"` consuming `useSession()` (Pitfall 10 mitigated)

The combination of greppable invariants + vitest + BLOCKING smoke covers the canonical "looked green but broke in prod" failure modes for this domain.

---

## Issues Found

### Blockers
None.

### Warnings (minor — execution can proceed)

**W-1 [verification_derivation, severity: warning]:** 04-02 frontmatter `must_haves.truths` includes "Three factories exported" but the implementation actually exports FOUR symbols (`createBrowserSupabase`, `createServerSupabase`, `createRouteHandlerSupabase`, `getSession`). Cosmetic mismatch — the verify line correctly counts 4. No fix required; flagging for SUMMARY accuracy.

**W-2 [scope_sanity, severity: warning]:** 04-02 task 1 modifies 6 files (package.json, bun.lock, lib/supabase-auth.ts, lib/use-session.ts, 2 test files). Borderline against the 5-file/task soft target but cohesive — installing the dep + writing the factory module + writing the hook + their tests is one logical unit of work that shares vitest mocks. Splitting would force test-mock duplication. Acceptable.

**W-3 [pattern_compliance, severity: warning]:** Open-redirect test for `//evil.com` correctly notes the documented limitation that the simple `startsWith("/")` guard accepts protocol-relative URLs, relying on URL normalization to keep it on-origin. The test asserts `location.startsWith(ORIGIN)` rather than asserting the location is exactly `${ORIGIN}/`. This is correct behavior per the implementation but worth flagging for future hardening (a stricter guard could reject `//` prefixes too). Not a Phase 4 blocker — Phase 4 inherits this from Supabase's own documented pattern.

### Info
None requiring action.

---

## Overall Verdict

**PASS-WITH-NOTES** — All 4 ROADMAP success criteria, 4 AUTH requirements, and 10 D-decisions trace to specific tasks with greppable acceptance criteria or BLOCKING manual smokes. All four critical RESEARCH pitfalls (open-redirect guard, cookie chunking via canonical setAll, async cookies, server-side getUser) are locked in code AND tested. Three BLOCKING gates correctly placed at wave boundaries. Scope stays within Phase 4 (no Phase 5/6/7 leakage). Three minor warnings are cosmetic / informational and do not require revision.

**Ready for execute-phase?** YES.
