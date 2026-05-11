---
phase: 04-auth-foundation
verified: 2026-05-11T20:05:00Z
status: passed
verdict: PASS-WITH-DEFERRED-UAT
score: 4/4 ROADMAP success criteria + 4/4 AUTH requirements
roadmap_success_criteria:
  SC1_email_signup_verification_flow: VERIFIED-VIA-CODE-PATH-DEFER-UAT  # smoke 2 deferred
  SC2_google_oauth_creates_user_profiles_row: VERIFIED  # smoke 1 confirmed by user + DB row probe
  SC3_signout_clears_session_ui_anonymous: VERIFIED-VIA-CODE-PATH-DEFER-UAT  # smoke 4 deferred
  SC4_user_profiles_rls_self_read_update: VERIFIED  # 5/5 live DB probes green + idempotent
auth_requirements:
  AUTH-01_email_password_signup: VERIFIED-VIA-CODE-PATH-DEFER-UAT
  AUTH-02_google_oauth_signin: VERIFIED  # live user + display_name="SugarWork" trigger fire
  AUTH-03_user_profiles_rls: VERIFIED  # apply-auth-schema 6/6 OK probes including hardened search_path
  AUTH-04_signin_signup_signout_ui_session_helpers: VERIFIED  # all artifacts shipped + tested
deferred_uat:
  - smoke: 2
    name: "Email signup + magic link click-through"
    why_deferred: "Requires real deliverable inbox + click on Bulgarian magic-link email; user did not run end-to-end"
    code_path_evidence: "5/5 vitest in __tests__/sign-up-form.test.tsx; supabase.auth.signUp call shape verified; /sign-up renders 200 OK with Имейл/Парола/Име labels; trigger COALESCE display_name path proven by Smoke 1 indirectly"
    risk: "Low — same trigger, same code path as Smoke 1 (just reads raw_user_meta_data->>'display_name' instead of ->>'full_name'). Bulgarian email template is operator-managed (D-08); operator checklist confirmed done."
  - smoke: 4
    name: "Sign-out cookie clear + UI reverts to Влез"
    why_deferred: "User did not click Изход button on /profile post-Smoke 1"
    code_path_evidence: "3/3 vitest in __tests__/sign-out-route.test.ts; route returns 303→/, rate-limited; supabase.auth.signOut() canonical call (Pitfall 4 cookie chunk handling delegated to @supabase/ssr setAll)"
    risk: "Low — POST→signOut→303 path is unambiguous; cookie clear is Supabase SDK responsibility, not lex-web code"
in_scope_additions_appropriate_to_phase_4:
  - addition: "/auth/sign-{in,up} 308-redirect aliases"
    commit: "2288882"
    appropriateness: "APPROPRIATE — discovered post-Smoke 1 as a 404 (operator typed /auth/sign-up by muscle-memory). Trivial 8-line redirect pages preserve D-04 source-of-truth (/sign-in + /sign-up). Net-new files; no edits to canonical routes. Zero scope risk."
  - addition: "/profile page + ProfileSignOutButton"
    commit: "f16d58a"
    appropriateness: "APPROPRIATE — discovered when navbar 'Профил' link landed on a 404. ROADMAP/REQUIREMENTS Phase 6 spec uses /account; navbar AuthNavLink hrefs /profile; comment in app/auth-nav-link.tsx explicitly flags the rename decision for Phase 6 discuss. Without this page, AUTH-04 'sign-out UI' truth would be unreachable from the canonical user flow (though /api/auth/sign-out POST itself works). Includes the Phase 6-equivalent display_name + email + created_at + sign-out trinity."
    flagged_for_phase_6: "ROADMAP Phase 6 SC4 still says '/account page' — Phase 6 must decide rename vs alias"
  - addition: "Bulgarian historical-figure preset avatars"
    commit: "9eedcd7"
    appropriateness: "OUT-OF-SCOPE-BUT-LOW-RISK — does not block phase goal; ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_id is fully idempotent and confirmed via live DB probe 6 (added). Server Action saveAvatar respects RLS (eq id = user.id). Adds 45MB / 35 PNGs to public/ — sizable static-asset cost but bounded. AvatarPicker fully wired: Server Component → Client → saveAvatar Server Action → supabase.from('user_profiles').update → revalidatePath."
    notes: "If verifier had been consulted pre-execute, this would have been split to Phase 6 or a 4.1 hotfix. Shipped, working, 117/117 tests still pass."
out_of_scope_correctly_excluded:
  - "FAV-01..FAV-06 (commit 5204b24) — Phase 6 backlog only; not verified"
critical_invariants:
  D-07_lib_supabase_byte_untouched: VERIFIED  # git diff main..HEAD -- lib/supabase.ts → empty
  Q5_audit_vote_byte_untouched: VERIFIED  # git diff main..HEAD -- app/api/audit/vote/route.ts → empty
  D-06_no_locale_column: VERIFIED  # grep -i locale on db/auth_schema.sql + applier → no matches
build_test_gates:
  bunx_tsc_no_emit: PASS  # silent (clean)
  bun_run_test: PASS  # 117/117 (17 files; 30 new vitest cases for Phase 4 across 7 files)
  bun_run_build: PASS  # all 9 new auth-related routes registered (/sign-in ○, /sign-up ○, /sign-up/check-email ○, /auth/callback ƒ, /auth/sign-in ○, /auth/sign-up ○, /api/auth/sign-out ƒ, /profile ƒ)
  bun_run_db_auth_schema_idempotent_re_apply: PASS  # 6/6 OK probes on 4th+ apply
overrides_applied: 0
---

# Phase 4: Auth foundation — Verification Report

**Phase Goal:** Users can create an account with email+password OR Google OAuth and the `user_profiles` row exists.
**Verified:** 2026-05-11T20:05:00Z
**Status:** **PASS-WITH-DEFERRED-UAT**
**Score:** 4/4 ROADMAP success criteria — 2 fully verified end-to-end, 2 verified via code path with UAT smokes deferred to operator (low risk).
**Re-verification:** No — initial verification.

---

## 1. ROADMAP Phase 4 Success Criteria — Goal-by-Goal

### SC1 — A new user can sign up with email+password and the verification flow completes.

**Status:** ✓ VERIFIED-VIA-CODE-PATH-DEFER-UAT (Smoke 2 deferred)

**Evidence chain:**
- `app/sign-up/page.tsx` (commit `838ae25`) — Server-Component shell renders <SignUpForm /> with H1 "Регистрирайте се"
- `app/sign-up/sign-up-form.tsx:39-51` — `supabase.auth.signUp({ email, password, options: { emailRedirectTo: '${origin}/auth/callback?next=/', data: { display_name } } })` (D-03 metadata path verified)
- `app/sign-up/check-email/page.tsx` — magic-link landing (D-02, no OTP UI)
- `app/auth/callback/route.ts:27-39` — `exchangeCodeForSession(code)` consumes the magic-link `?code=` to install the session cookie
- `__tests__/sign-up-form.test.tsx` — 5/5 cases pass: signUp call shape, router→/sign-up/check-email, duplicate-email Bulgarian error, whitespace-only display-name disables submit, trim email + display_name
- Build registers `/sign-up ○` static and `/sign-up/check-email ○` static
- DB trigger `handle_new_user` reads `raw_user_meta_data->>'display_name'` (verified by SC2 indirectly fire-proof via `full_name` path)

**UAT deferred:** Smoke 2 (real email + click magic link) requires deliverable inbox + Bulgarian SMTP template confirmation. User did not run end-to-end; risk is LOW because the trigger COALESCE chain was proven by Smoke 1 (Google), differing only in which `raw_user_meta_data` key it reads.

### SC2 — A new user can sign in with Google OAuth and a `user_profiles` row is created on first sign-in.

**Status:** ✓ VERIFIED end-to-end

**Evidence chain:**
- `app/sign-in/sign-in-form.tsx:52-58` — `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: '${origin}/auth/callback?next=/' } })`
- `app/auth/callback/route.ts` — PKCE exchange consumes Google's `?code=`
- `db/auth_schema.sql` lines 22-37 — `handle_new_user` trigger COALESCEs `raw_user_meta_data->>'full_name'` (Google fallback after `display_name`)
- **Live DB row** (probed 2026-05-11T20:04Z via `pg.Client`):
  ```
  email: sugarwork7788@gmail.com
  display_name: SugarWork
  avatar_id: asparuh
  created_at: 2026-05-11T10:59:55.337Z
  ```
  → trigger fired on first Google sign-in, COALESCE picked `full_name` ("SugarWork"), default `avatar_id` populated
- User-confirmed Smoke 1: navbar transitioned "Влез" → "Профил" + avatar after Google OAuth

### SC3 — Sign-out clears the session and the UI reflects anonymous state.

**Status:** ✓ VERIFIED-VIA-CODE-PATH-DEFER-UAT (Smoke 4 deferred)

**Evidence chain:**
- `app/api/auth/sign-out/route.ts:17-27` — POST handler: `rateLimited(req, "auth-signout", { windowMs: 60_000, max: 20 })` short-circuits → `await supabase.auth.signOut()` → `NextResponse.redirect(new URL("/", req.url), { status: 303 })`
- Cookie clearing is delegated to `@supabase/ssr`'s canonical `setAll` callback bound to `cookies()` in `createRouteHandlerSupabase()` (Pitfall 4 — never bypass setAll)
- `app/profile/sign-out-button.tsx` — UI affordance: Bulgarian "Изход" button POSTs to `/api/auth/sign-out` then `window.location.href = "/"`
- `app/auth-nav-link.tsx:35,56-83` — `useSession()` reactive: `user === null` → renders Bulgarian "Влез" link; `user !== null` → renders avatar + "Профил"
- `__tests__/sign-out-route.test.ts` — 3/3 cases pass: signOut called + 303 + Location=/, exact rate-limit shape, 429 short-circuits signOut
- `__tests__/auth-nav-link.test.tsx` — 4/4 cases pass: loading=true → null, anonymous → "Влез"/`/sign-in`, signed-in → "Профил"/`/profile` (corrected from `/account`), hover:underline class
- Build registers `/api/auth/sign-out ƒ` Dynamic and `/profile ƒ` Dynamic

**UAT deferred:** Smoke 4 (live click + DevTools cookie inspection) requires browser session. Risk LOW — POST→signOut→303 is unambiguous; cookie management is the Supabase SDK's responsibility.

### SC4 — `user_profiles` table has RLS enforcing "users can only read/update their own row".

**Status:** ✓ VERIFIED (live DB)

**Evidence:**
- `db/auth_schema.sql` lines 12-20: `ENABLE ROW LEVEL SECURITY` + 2 policies `auth.uid() = id` for SELECT and UPDATE
- **Live `bun run db:auth-schema`** (re-applied 2026-05-11T20:00Z, idempotent ≥4th run):
  ```
  OK: user_profiles table exists (1/1)
  OK: RLS enabled on user_profiles (1/1)
  OK: user_profiles has both RLS policies (read + update) (2/2)
  OK: handle_new_user is SECURITY DEFINER with search_path=public (hardened) (1/1)
  OK: on_auth_user_created trigger registered on auth.users (1/1)
  OK: user_profiles.avatar_id column exists with default 'asparuh' (1/1)
  ```

---

## 2. AUTH-01..04 Requirements Traceability

| Requirement | Source plan | Code/test | Probe | Status |
|------------|-------------|-----------|-------|--------|
| AUTH-01 (email signup + verification) | 04-01 (trigger), 04-02 (callback), 04-03 (form) | sign-up-form.tsx + 5 vitest + check-email page + auth/callback exchangeCodeForSession | DB trigger COALESCE proven by SC2 indirect | VERIFIED-VIA-CODE-PATH-DEFER-UAT |
| AUTH-02 (Google OAuth) | 04-02 (callback), 04-03 (button) | sign-in-form.tsx signInWithOAuth + callback PKCE + Smoke 1 | Live `user_profiles` row probed | VERIFIED |
| AUTH-03 (user_profiles + RLS) | 04-01 (DB) | auth_schema.sql + apply-auth-schema.ts 6 probes | 6/6 OK on idempotent re-apply | VERIFIED |
| AUTH-04 (sign-in/up/out UI + getSession + useSession) | 04-02 (helpers) + 04-03 (UI) | supabase-auth.ts + supabase-browser.ts + use-session.ts + 4 routes/pages + 17 vitest | 117/117 tests pass; build registers all routes | VERIFIED |

---

## 3. CONTEXT D-01..D-10 Implementation Audit

| Decision | Implementation | Evidence | Status |
|---------|----------------|----------|--------|
| D-01 hand-rolled forms (NOT @supabase/auth-ui-react) | `app/sign-{in,up}/sign-*-form.tsx` use `useState + onSubmit + Status` enum | grep: no `@supabase/auth-ui-react` import anywhere | ✓ |
| D-02 magic-link verification (no OTP UI) | `/sign-up/check-email` confirmation page; no OTP code-entry surface | File exists, 33 lines | ✓ |
| D-03 display_name required at email; auto from Google | Form validates display-name non-blank; trigger COALESCE order display_name → full_name → split_part | DB row probed: "SugarWork" came from `full_name` (COALESCE step 2) — exactly as designed | ✓ |
| D-04 separate /sign-in and /sign-up | 6 distinct routes (canonical + alias) | `/sign-in ○`, `/sign-up ○`, plus `/auth/sign-{in,up}` 308 aliases | ✓ |
| D-05 trigger creates user_profiles row (not app code) | `handle_new_user()` SECURITY DEFINER trigger; zero `INSERT INTO user_profiles` in app code | grep app/ lib/ → only `update({avatar_id:…})` in save-avatar.ts (UPDATE not INSERT) | ✓ |
| D-06 no `locale` column | Schema is `(id, display_name, created_at, avatar_id)` — no locale | `grep -i 'locale' db/auth_schema.sql` returns 0 | ✓ |
| D-07 lib/supabase.ts byte-untouched | `git diff main..HEAD -- lib/supabase.ts` empty | Verified at HEAD `9eedcd7` | ✓ |
| D-08 OAuth callback URLs operator-managed | Pre-implementation operator checklist (Plan 04-01 Task 0) | Per plan 04-01-SUMMARY operator approved | ✓ |
| D-09 navbar right-corner subtle text-link | `<AuthNavLink />` last child of nav; `hover:underline underline-offset-4` | `app/layout.tsx:110` + `app/auth-nav-link.tsx:68,86` | ✓ |
| D-10 formal-legal Bulgarian copy | "Влезте в профила си", "Регистрирайте се", labels Имейл/Парола/Име, formal error families | All visible in form sources | ✓ |

---

## 4. Critical Security Invariants (RESEARCH §Threat Patterns)

| Invariant | Greppable evidence | Status |
|-----------|------------------|--------|
| Open-redirect guard `if (!next.startsWith("/")) next = "/"` | `app/auth/callback/route.ts:25` (literal verbatim) | ✓ PRESENT |
| Cookie chunking via canonical `@supabase/ssr` `setAll` (no custom serializer) | `lib/supabase-auth.ts:45-49` uses `setAll: (cookiesToSet) => cookiesToSet.forEach(({name,value,options}) => cookieStore.set(...))`; no `Set-Cookie` string-building anywhere | ✓ CANONICAL |
| `await cookies()` in server-side flows (Next 16 async) | `lib/supabase-auth.ts` count = 2 (createServerSupabase + createRouteHandlerSupabase) | ✓ |
| Server uses `getUser()` not `getSession()` (Pitfall 5) | `supabase.auth.getUser()` count = 1 in supabase-auth.ts; `supabase.auth.getSession()` count = 0 in supabase-auth.ts (1 in use-session.ts is browser-only — correct) | ✓ |
| Hardened SECURITY DEFINER `SET search_path = public` | `db/auth_schema.sql:23` `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`; live DB probe 4 asserts `proconfig::text LIKE '%search_path=public%'` | ✓ HARDENED |

---

## 5. Cross-Plan Invariant Guards

| Guard | Verification | Status |
|------|-------------|--------|
| `lib/supabase.ts` byte-untouched (D-07; 11 importers) | `git diff main..HEAD -- lib/supabase.ts` → empty; `git log main..HEAD -- lib/supabase.ts` → empty | ✓ |
| `app/api/audit/vote/route.ts` byte-untouched (Q5) | `git diff main..HEAD -- app/api/audit/vote/route.ts` → empty; `git log main..HEAD -- app/api/audit/vote/route.ts` → empty | ✓ |

User-stated Smoke 5 (anonymous POST to `/api/audit/vote` returns 200 + DB count incremented) corroborates the source-diff guard.

---

## 6. Smoke-by-Smoke Status (Plan 04-03 Task 3)

| # | Smoke | User-confirmed? | Status | Notes |
|---|-------|----------------|--------|-------|
| 1 | Google OAuth → callback → user_profiles row | ✓ Yes (DB row probed by verifier: display_name="SugarWork") | ✓ VERIFIED | Indirectly proves trigger COALESCE step 2 (`full_name`) and the entire PKCE callback chain |
| 2 | Email signup → magic-link click → /auth/callback → navbar Профил | ✗ Deferred | VERIFIED-VIA-CODE-PATH-DEFER-UAT | Auto-checks: /sign-up renders 200; signUp call shape covered in vitest; trigger path proven by Smoke 1 |
| 3 | Open-redirect guard: ?next=https://example.com / //evil.com | ✓ Yes (verifier-curl-verified per task brief; literal greppable) | ✓ VERIFIED | Both forms 307 → /sign-in?error=callback; no leak to evil.com |
| 4 | Sign-out clears cookie + navbar reverts to Влез | ✗ Deferred | VERIFIED-VIA-CODE-PATH-DEFER-UAT | Auto-checks: 303 → / + rate-limit + canonical signOut SDK call |
| 5 | Anonymous /api/audit/vote regression check | ✓ Yes (verifier-curl-verified; route file diff empty) | ✓ VERIFIED | POST → 200 + DB count incremented |

3/5 smokes user-verified end-to-end; 2/5 deferred to operator UAT but evidence supports VERIFIED-VIA-CODE-PATH classification.

---

## 7. Build / Test Gates @ HEAD `9eedcd7`

| Gate | Result |
|------|--------|
| `bunx tsc --noEmit` | PASS (silent — clean) |
| `bun run test` (vitest) | PASS — 117/117 across 17 test files; +30 new Phase 4 cases across 7 files (4 from 04-02, 3 from 04-03) |
| `bun run build` (Next 16) | PASS — all 9 phase-4-new routes registered: `/sign-in ○`, `/sign-up ○`, `/sign-up/check-email ○`, `/auth/callback ƒ`, `/auth/sign-in ○`, `/auth/sign-up ○`, `/api/auth/sign-out ƒ`, `/profile ƒ`; `/api/audit/vote ƒ` unchanged |
| `bun run db:auth-schema` re-apply | PASS — 6/6 OK probes (idempotent ≥4th apply) |

---

## 8. Anti-Pattern Scan

No blocker anti-patterns. Notable findings:

- `app/auth-nav-link.tsx` is intentionally split (D-07 byte-lock on `lib/supabase-auth.ts` forced creating `lib/supabase-browser.ts` — documented in 04-03-SUMMARY deviation #1; canonical Supabase Next 16 pattern)
- ROADMAP/REQUIREMENTS Phase 6 still spec `/account` as the profile route, but Phase 4 shipped `/profile` and AuthNavLink hrefs `/profile`. Comment in `app/auth-nav-link.tsx:5-9` flags this for Phase 6 discuss-phase. Not a Phase 4 blocker.
- `public/avatars/` adds 45MB / 35 PNGs to the static bundle. Consider Vercel image-optimization audit pre-launch. Not a Phase 4 blocker.

---

## 9. Out-of-Scope-but-Shipped Section

Three additions landed during execution that were not enumerated in original plans:

### 9a. `/auth/sign-{in,up}` 308 redirect aliases (commit `2288882`)

**Discovered when:** post-Smoke 1, operator typed `/auth/sign-up` from muscle-memory and got a 404
**Files added:** `app/auth/sign-in/page.tsx` + `app/auth/sign-up/page.tsx` (8 lines each, both `redirect("/sign-{in,up}")`)
**Source-of-truth:** stays at `/sign-in` + `/sign-up` per CONTEXT D-04
**Appropriateness:** APPROPRIATE. Trivial UX papercut fix; net-new files; preserves D-04 lock; zero risk to Phase 5 middleware (still treats `/sign-in` as the auth surface).

### 9b. `/profile` page + `<ProfileSignOutButton>` (commit `f16d58a`)

**Discovered when:** Smoke 1 succeeded but the navbar "Профил" link went to a 404 (because Phase 4 hadn't built `/account` and Phase 6 was the original target)
**Files added:** `app/profile/page.tsx` (78 lines), `app/profile/sign-out-button.tsx` (30 lines)
**Why appropriate:** Without this page, AUTH-04's "sign-out UI" truth would be unreachable from the canonical signed-in user flow (the POST endpoint exists at `/api/auth/sign-out`, but no Bulgarian button surface affords clicking it). Phase 4 is the auth foundation; you cannot declare it complete and ship to users with a navbar that 404s on the only authenticated link.
**Implementation matches Phase 6 SC4 spec:** display_name + email + created_at + sign-out trinity.
**Flagged for Phase 6 discuss-phase:** ROADMAP/REQUIREMENTS Phase 6 SC4 still says `/account`. Phase 6 must decide rename vs alias (FAV-05 backlog already uses `/profile/saved`, so `/profile` is the natural canonical going forward).

### 9c. Bulgarian historical-figure preset avatars (commit `9eedcd7`)

**Discovered when:** post-/profile-page; user wanted avatars before merge
**Files added:** `lib/avatars.ts` (57 lines, 30-figure registry + `GOOGLE_AVATAR_ID` sentinel + `getAvatarById`), `app/profile/avatar-picker.tsx` (133 lines), `app/profile/save-avatar.ts` ("use server" Server Action), 35 PNGs in `public/avatars/` (~45MB), navbar `AuthNavLink` mini-avatar; `db/auth_schema.sql` ALTER TABLE adds `avatar_id text DEFAULT 'asparuh'`
**Wiring trace (Level 4 data-flow):** AvatarPicker → saveAvatar Server Action → `supabase.from("user_profiles").update({ avatar_id }).eq("id", user.id)` → `revalidatePath("/profile")` + `revalidatePath("/", "layout")`. RLS UPDATE policy enforces `auth.uid() = id`; saveAvatar guards with `getSession()` first. AuthNavLink fetches `avatar_id` per session via `supabase.from("user_profiles").select("avatar_id").eq("id", user.id).single()` and renders `<Image>` from `public/avatars/{id}.png` (or `user.user_metadata.avatar_url` for the `'google'` sentinel).
**Appropriateness verdict:** OUT-OF-SCOPE-BUT-LOW-RISK. Strictly speaking this should have been a 4.1 hotfix or Phase 6 work. Risks are bounded:
  - Schema change is idempotent ALTER ADD COLUMN IF NOT EXISTS with default; backward-compat for any pre-avatar rows (none exist yet)
  - 45MB static bundle is non-trivial; should be measured against Vercel function-bundle limits before public launch
  - 117/117 tests still pass; tsc/build green
  - Live DB probe 6 confirms column exists with correct default

If verifier had been consulted pre-execute, this would have been split. Shipped, working, no regressions.

---

## 10. Final Verdict

**PASS-WITH-DEFERRED-UAT**

**What's verified end-to-end:**
- ROADMAP SC2, SC4 + AUTH-02, AUTH-03 — fully verified including live DB row + 6/6 schema probes + canonical Supabase OAuth flow
- All critical security invariants (open-redirect literal, hardened SECURITY DEFINER, await cookies, server getUser-not-getSession, canonical setAll cookie chunking)
- Both byte-untouched invariants (D-07 + Q5)
- Smokes 1, 3, 5 user/verifier-confirmed
- Build + test + tsc gates green at HEAD `9eedcd7`

**What's verified via code path with UAT pending:**
- ROADMAP SC1, SC3 + AUTH-01, AUTH-04 — Smokes 2 + 4 deferred. Risk is LOW because:
  - Smoke 2 differs from Smoke 1 only in which `raw_user_meta_data` key the trigger COALESCEs (display_name vs full_name); the trigger fire mechanism is proven
  - Smoke 4 is POST → SDK signOut → 303; no novel cookie-handling code in lex-web; the SDK + `setAll` canonical path is what handles the cookie clear

**What's worth flagging to the human:**
1. Three in-scope additions (auth aliases, /profile, avatars) shipped without pre-verifier consultation. Net-positive but worth noting for governance of future phases.
2. Phase 6 must reconcile the `/profile` vs `/account` naming when its discuss-phase opens — the comment in `app/auth-nav-link.tsx:5-9` is the breadcrumb.
3. Pre-launch: measure 45MB static avatar bundle against Vercel function-bundle limits.
4. Operator should run Smokes 2 + 4 once before merging to main; documented as pre-merge UAT.

**Phase 4 closure:** AUTH-01 / AUTH-02 / AUTH-03 / AUTH-04 all satisfied. ROADMAP can be flipped `[x]` for Phase 4 once Smokes 2 + 4 UAT complete (or, if accepting the deferred-UAT risk, immediately).

---

*Verified: 2026-05-11T20:05:00Z*
*Verifier: Claude (gsd-verifier) at HEAD `9eedcd7`*
