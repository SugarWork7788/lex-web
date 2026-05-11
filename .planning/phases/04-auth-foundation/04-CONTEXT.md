---
phase: 04
phase_name: Auth foundation
milestone: v2.3
context_version: 1
status: discussion-complete
ready_for: research-or-plan
---

# Phase 4 — Auth foundation

## Phase scope (locked from ROADMAP)

Add user authentication to lex-web using Supabase Auth (already in stack). Email/password (magic-link verification) + Google OAuth. `user_profiles` table with RLS. Sign-in / sign-up / sign-out pages in Bulgarian + `getSession()` server util + `useSession()` client hook.

**Requirements:** AUTH-01..AUTH-04 (verbatim from REQUIREMENTS.md)

**Cross-milestone note:** Phase 4 starts v2.3. v2.2 still has Phase 3 (Mobile + CodeRabbit) pending and Phase 8.1's full backfill is running in background (PID 94740). Phase 4 is INDEPENDENT of v2.2 (per ROADMAP "Depends on: Nothing"). No blockers.

## Decisions

### D-01 — Hand-rolled forms (NOT @supabase/auth-ui-react)

Custom Bulgarian forms styled like /audit + /intel cards: red accents, font-serif headings, stone-900 surfaces, same accessibility patterns as the rest of the site. Slightly more code than the turnkey component, but pixel-consistent with the existing design system. The Supabase-recommended turnkey component looks generic against the site's deliberate visual identity.

**What this means for plan 04-03:** Build `<SignInForm>` + `<SignUpForm>` from scratch. Reuse `lib/rate-limit.ts` (Phase 1) for any rate-limited auth flows. Use the same form shape as the analyze page.

### D-02 — Magic-link email verification (Supabase default)

User receives email with click-to-verify link. No code-entry UI to build. Supabase handles the verification redirect. Standard pattern users recognize. Slight UX friction (email-client context switch) is acceptable for a non-commercial public-service site where signup volume is low.

**What this means for plan 04-03:** No OTP UI surface. Sign-up form just collects email + password + display name → calls `supabase.auth.signUp(...)` → renders a "check your email" confirmation page.

### D-03 — Display name required at email signup; auto-derived from Google OAuth

Email/password sign-up form has 3 fields: email, password, display name (required). For Google OAuth, the user's Google profile name is auto-copied into `user_profiles.display_name` on first sign-in. Both editable later via `/account` (which lands in Phase 6, not here).

**What this means for plan 04-02 + 04-03:** `user_profiles.display_name` is `text NOT NULL`. The auth.users → user_profiles trigger reads `raw_user_meta_data->>'display_name'` (set by signUp metadata) for email signups, or `raw_user_meta_data->>'full_name'` (set by Supabase Google OAuth) for Google. Insert via the trigger function — never via app code.

### D-04 — Separate `/sign-in` and `/sign-up` pages

Two distinct pages, each linked to the other ("Нямаш профил? Регистрирай се" / "Имаш профил? Влез"). Clearer URLs for the Phase 5 `returnTo` flow. Standard pattern users recognize. The `/sign-out` flow is a `POST /api/auth/sign-out` route handler + nav-link that redirects to `/`.

**What this means for plan 04-03:** Three routes: `app/sign-in/page.tsx`, `app/sign-up/page.tsx`, and `app/api/auth/sign-out/route.ts`. The Bulgarian copy lives inline.

### D-05 — `user_profiles` row created by Postgres trigger on `auth.users` INSERT (not app code)

The `auth.users → user_profiles` row creation is a `SECURITY DEFINER` trigger that fires after `auth.users` insert. App code never touches the insert path. This is more robust than UPSERT-from-app (which can race on first sign-in) and matches the Supabase community convention.

**What this means for plan 04-02:** The migration block ships:
```sql
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  AS $$
  BEGIN
    INSERT INTO public.user_profiles (id, display_name)
    VALUES (
      NEW.id,
      COALESCE(
        NEW.raw_user_meta_data->>'display_name',
        NEW.raw_user_meta_data->>'full_name',
        split_part(NEW.email, '@', 1)
      )
    );
    RETURN NEW;
  END;
  $$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```
The COALESCE fallback to `split_part(email, '@', 1)` handles the edge case where Google OAuth returns no `full_name` (rare; safety net).

### D-06 — No `locale` column in `user_profiles` (YAGNI)

Site is Bulgarian-only. Adding a `locale text DEFAULT 'bg'` column now is dead weight that future schema changes have to carry. If a second locale is ever added, Phase 7+ adds the column then. Plan 04-02's user_profiles table is exactly: `(id, display_name, created_at)`. The `tier` enum from Phase 7 lands then; Phase 4 doesn't speculate.

### D-07 — Auth client uses `persistSession: true` (separate config from existing `lib/supabase.ts`)

The current `lib/supabase.ts` exports a single anon-key client with `persistSession: false` (used by data fetches). Auth requires `persistSession: true` to keep the user signed in across requests. The cleanest pattern is to introduce two named exports:
- `supabase` (existing) — unchanged for data reads
- `supabaseAuth` (new) — `persistSession: true`, auth-aware

Or, more idiomatically per Supabase Next 16 conventions: a `createClient()` factory that's called per-request in Server Components / Route Handlers (so the cookie store is correctly bound). The planner should pick based on the Next 16 docs (see `node_modules/next/dist/docs/`) — the per-request client is the modern recommendation. Don't break the existing `supabase` export.

### D-08 — OAuth callback URLs are operator-managed (not in code)

Google OAuth requires registering callback URLs in Google Cloud Console:
- Production: `https://lex-web-eta.vercel.app/auth/callback`
- Local dev: `http://localhost:3000/auth/callback`
- Preview deploys: `https://lex-web-*.vercel.app/auth/callback` (Vercel-side wildcard if Google supports; otherwise add per-PR manually)

These are NOT scriptable from app code. The plan-phase output should include a "Pre-implementation operator checklist" section listing the manual steps. Same for adding `NEXT_PUBLIC_SUPABASE_AUTH_REDIRECT_URL` to Vercel env vars.

### D-09 — Navbar placement: right-corner subtle text-link, matches existing /audit + /intel pattern

The "Влез" / "Профил" link goes in the existing top-nav bar (`app/layout.tsx`), right-aligned, same `hover:underline underline-offset-4` pattern as `/audit` and `/intel`. NO icon, NO button styling, NO avatar dropdown until Phase 6. Anonymous users see "Влез"; signed-in users see "Профил" (Phase 6 lights up `/account` page).

### D-10 — Bulgarian copy: formal-legal tone (matches site voice)

The site's existing voice is formal/legal (Държавен вестник, Закон, Анализ). Sign-in copy follows:
- "Влезте в профила си" (NOT "Здравей! Влез")
- "Регистрирайте се" (NOT "Създай си профил")
- Field labels: "Имейл", "Парола", "Име" (display name)
- Error states: "Невалидна парола" (NOT "Опа! Парола не е добра")

## Open questions (for research / planning)

1. **Q1 — Next 16 Supabase Auth helpers shape:** What's the current canonical pattern for Supabase + Next 16 App Router server-side auth? Is it `@supabase/ssr` (the v2 helpers) or has Next 16 introduced a new convention? Researcher should probe `node_modules/next/dist/docs/` + Supabase docs before plan 04-04 locks the helper signatures.
2. **Q2 — Magic-link redirect:** When a user clicks the verification link from their email, where should they land? Sign-in page? Home? An "email verified, please sign in" intermediate page? Affects the `EmailRedirectTo` config.
3. **Q3 — Existing `lib/rate-limit.ts` reuse:** Should sign-up + sign-in routes be rate-limited (e.g., 5/min/IP)? Sign-in retries are a brute-force vector. Recommend reusing Phase 1's `rateLimited()` helper. Researcher should confirm Supabase Auth itself doesn't already enforce equivalent.
4. **Q4 — Test strategy for OAuth:** Vitest can't drive Google's OAuth consent screen. Plan 04-01 needs a story for "how do we verify the OAuth flow works" — manual smoke at checkpoint? Mock the redirect callback?
5. **Q5 — Anonymous-vote backward compatibility (Phase 6 preview):** Phase 4 doesn't gate `/audit/vote`, but Phase 6 will. The existing `/api/audit/vote` uses IP+fingerprint. Phase 6 will add `user_id`. Phase 4 should be careful not to break the existing endpoint. Confirmed Phase 4 makes ZERO changes to `/api/audit/vote`.

## Out of scope (deferred or rejected)

- **Phase 5 work** (middleware, protected-route helper) — Phase 4 just lands the building blocks; routing-time enforcement is Phase 5's job
- **`/account` page** — that's Phase 6
- **`tier` enum** — that's Phase 7
- **Stripe / billing** — explicitly out of v2.3 scope per PROJECT.md decision 2026-05-05
- **Additional OAuth providers** (GitHub, Apple, Facebook) — Google only; revisit if user demand surfaces
- **2FA / MFA** — out of scope for the foundation; revisit in a future milestone if a security incident motivates it
- **Email-OTP verification** — magic-link only per D-02
- **`locale` column** — YAGNI per D-06
- **Supabase Auth UI component** — hand-rolled per D-01
- **Combined `/auth` page** — separate `/sign-in` + `/sign-up` per D-04
- **Anonymous-state visual changes on existing pages** — Phase 4 only adds the navbar Влез link; no other UI surface touched

## Cross-cutting

This phase modifies ONLY lex-web. No lex-brain changes. The DV scraper (Phase 8/8.1) is unaffected. Existing Supabase data tables (`law_*`, `audit_*`, `dv_*`, `intel_*`) are unchanged — `user_profiles` is a new schema namespace.

## Pre-implementation operator checklist

Plan-phase + execute will surface these. They're **not** scriptable from app code:

1. Enable email/password provider in Supabase Dashboard → Authentication → Providers
2. Enable Google OAuth provider in Supabase Dashboard, paste Google OAuth client ID + secret
3. In Google Cloud Console → OAuth consent screen → add production + local-dev callback URLs
4. Add `NEXT_PUBLIC_SUPABASE_AUTH_REDIRECT_URL` to Vercel env vars + local `.env.local`
5. Verify Supabase email-template (the "Confirm your signup" email) renders Bulgarian-friendly text — Supabase Dashboard → Authentication → Email Templates

## Next step

`/gsd-plan-phase 4` — given the 5 open questions, the planner should spawn `gsd-phase-researcher` first (recommended) to lock Q1 + Q3 in particular before splitting plan 04-04's helper signatures.
