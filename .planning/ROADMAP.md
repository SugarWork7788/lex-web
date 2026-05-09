# Roadmap: lex-web

## Overview

v2.2 — "Post-security-hardening release". Three phases that close the open audit follow-ups (#10 OpenSanctions streaming, finer rate-limit observability), ship the two new user-visible features (Intel AI search v2, server-rendered Audit PDF export), and polish the mobile experience while wiring up CodeRabbit so every future PR is auto-reviewed. Sequential by default; phases 1 and 2 could parallelise if needed.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (e.g. 2.1): Urgent insertions (marked `INSERTED`)

- [ ] **Phase 1: Reliability & observability** — fix OpenSanctions OOM risk, surface rate-limit info in UI
- [ ] **Phase 2: New AI features** — Intel search v2 + server-rendered Audit PDF
- [ ] **Phase 3: Mobile polish & CodeRabbit** — mobile UX pass + GitHub App install

## Phase Details

### Phase 1: Reliability & observability
**Goal**: Eliminate the OpenSanctions ~1 GB RAM peak and give users actionable feedback when they hit a rate limit.
**Depends on**: Nothing (independent of v2.1.x security work; builds on it).
**Requirements**: OS-01, RL-01
**Success Criteria** (what must be TRUE):
  1. `scripts/scrape_opensanctions.py` (lex-brain) processes the full sanctions CSV with peak RSS < 200 MB on a 4 GB box.
  2. Hitting `/api/chat/[slug]` 11+ times within 60 s shows a UI message with a countdown ("Try again in Ns") instead of a silent failure.
  3. Per-route rate-limit hit/throttle counts are observable from logs (`grep`-able pattern with route name and IP-hash).
**Plans**: 3 plans

Plans:
- [ ] 01-00-PLAN.md — Wave 0 bootstrap: install psutil (lex-brain) + vitest+RTL+jsdom (lex-web) and write vitest.config.ts; zero source changes
- [ ] 01-01-PLAN.md — Stream OpenSanctions CSV via fetch_with_retry_stream + io.TextIOWrapper(newline="") into csv.DictReader; psutil RSS sampler asserts peak < 200 MB on a >=100 MB synthetic CSV
- [ ] 01-02-PLAN.md — useRateLimitedFetch hook + RateLimitToast (aria-live, BG, countdown to 0); HMAC ip_hash + JSON one-liner stdout log inside lib/rate-limit.ts; migrate 8 fetch sites across 6 files (analyze excluded per D-02)

### Phase 2: New AI features
**Goal**: Ship the next round of user-visible AI value — better intel search, downloadable audit PDF.
**Depends on**: Phase 1 (rate-limit UI is reused)
**Requirements**: INT-02, PDF-01
**Success Criteria** (what must be TRUE):
  1. `/intel/search` returns ranked, multi-source results in <3 s; quotes are extractable and clickable.
  2. `/audit?format=pdf` (or a dedicated route) returns a single PDF file with the `LEX.BRAIN` watermark, regardless of the user's browser print settings.
  3. Audit PDF download fires <10 s for the full 352-finding report.
**Plans**: 4 plans

Plans:
- [ ] 02-01: Intel AI search v2 — refactor `/api/intel/search` to fan-out across sources, rank by relevance, return quote-attributed results
- [ ] 02-02: Update `/intel/search` UI to render multi-source result cards
- [ ] 02-03: Server-rendered audit PDF route using a headless renderer (puppeteer-core via Vercel function, or react-pdf) — embeds the SVG watermark
- [ ] 02-04: Add a "Download as PDF" button to /audit that hits the new route

### Phase 3: Mobile polish & CodeRabbit
**Goal**: Make the most-used pages comfortable on mobile and lock in PR-review automation.
**Depends on**: Phase 2 (PDF download must be reachable on mobile)
**Requirements**: MOB-01, CR-01
**Success Criteria** (what must be TRUE):
  1. /audit on a 375px-wide viewport shows finding cards without horizontal overflow; the timeline lanes wrap or scroll cleanly.
  2. /intel filter chips are tap-friendly (44px tap targets) and don't cover content.
  3. /laws/[slug] reader has a font-size toggle accessible from the article toolbar.
  4. CodeRabbit posts a review on the next PR opened against `main`.
**Plans**: 3 plans

Plans:
- [ ] 03-01: Mobile audit-page card pass — density, timeline wrapping, vote button thumb-zone
- [ ] 03-02: Mobile intel filter ergonomics + reader font-size toggle
- [ ] 03-03: Install CodeRabbit GitHub App on `SugarWork7788/lex-web`; verify with a tiny no-op PR

## Coverage

All 6 v2.2 requirements mapped to a phase. ✓

| Requirement | Phase |
|-------------|-------|
| OS-01 | 1 |
| RL-01 | 1 |
| INT-02 | 2 |
| PDF-01 | 2 |
| MOB-01 | 3 |
| CR-01 | 3 |

---

# v2.3 — Auth & Premium hooks

Promoted from backlog 2026-05-05. Reverses the "no user accounts" decision in PROJECT.md (anonymous reading still preserved on `/laws` and `/audit` *content*; only voting + `/intel` and future premium features become gated).

## Overview

Add user authentication to lex-web using Supabase Auth (already in stack). Email/password + Google OAuth. Next.js middleware for protected-route enforcement. `user_profiles` table backing future personalisation. Initial gating: `/audit` voting and the `/intel` section. Foundation for premium tier (no paid features built — just the hook infrastructure).

## Phases

- [ ] **Phase 4: Auth foundation** — Supabase Auth + email/password + Google OAuth + user_profiles + sign-in UI
- [ ] **Phase 5: Auth middleware** — Next.js middleware, protected-route helper, server-side session util
- [ ] **Phase 6: Page gating** — gate /audit voting + /intel; anonymous still sees /audit content
- [ ] **Phase 7: Premium hooks** — tier column + useUserTier hook + one example premium-gated feature (no Stripe)

## Phase Details

### Phase 4: Auth foundation
**Goal**: Users can create an account with email+password OR Google OAuth and the `user_profiles` row exists.
**Depends on**: Nothing (independent of v2.2)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04
**Success Criteria** (what must be TRUE):
  1. A new user can sign up with email+password and the verification flow completes.
  2. A new user can sign in with Google OAuth and a `user_profiles` row is created on first sign-in.
  3. Sign-out clears the session and the UI reflects anonymous state.
  4. `user_profiles` table has RLS enforcing "users can only read/update their own row".
**Plans**: 4 plans

Plans:
- [ ] 04-01: Configure Supabase Auth provider in `lib/supabase.ts` (server + client variants); add Google OAuth credentials to env
- [ ] 04-02: Create `user_profiles` table (id pk = auth.users.id, display_name, locale, created_at) + RLS policies; ship as a migration block in `db/`-adjacent SQL
- [ ] 04-03: Sign-in / sign-up / sign-out pages (Bulgarian) with Supabase Auth UI or hand-rolled form
- [ ] 04-04: `getSession()` server util (Server Component & Route Handler), `useSession()` client hook

### Phase 5: Auth middleware + protected route system
**Goal**: Next.js middleware enforces auth on routes that opt in; clean redirect-to-sign-in with returnTo preserves UX.
**Depends on**: Phase 4
**Requirements**: AUTH-05, AUTH-06, AUTH-07
**Success Criteria** (what must be TRUE):
  1. A request to a protected route without a valid Supabase session is redirected to `/sign-in?returnTo=<original-path>`.
  2. After successful sign-in, the user lands on the original returnTo path.
  3. Server Components in protected routes can call `getSession()` and assume non-null.
**Plans**: 3 plans

Plans:
- [ ] 05-01: `middleware.ts` (or Next 16 equivalent) reads Supabase session, allowlists `/sign-in`, `/sign-up`, public reader routes
- [ ] 05-02: `requireAuth()` helper for Route Handlers; `<ProtectedRoute>` boundary component for client trees that need auth
- [ ] 05-03: Document protected-route convention in PROJECT.md "Key Decisions" — which routes are public-by-default, which require opt-in

### Phase 6: Page gating
**Goal**: `/audit` voting and the entire `/intel` section require auth. Anonymous users still see `/audit` finding content (just can't vote) and the rest of the public reader.
**Depends on**: Phase 5
**Requirements**: AUTH-08, AUTH-09, AUTH-10, AUTH-11
**Success Criteria** (what must be TRUE):
  1. Anonymous user on `/audit/finding/[id]` sees the full finding but the vote button shows "Sign in to vote" (links to `/sign-in?returnTo=...`).
  2. Anonymous request to any `/intel/*` route is redirected to sign-in.
  3. Authenticated user can vote and the vote is attributed to their `user_id` in `audit_votes` (in addition to existing IP/fingerprint).
  4. There is an `/account` page showing display name, email, and a sign-out button.
**Plans**: 3 plans

Plans:
- [ ] 06-01: Gate the `<VoteButton>` component — anonymous variant + authed variant; update `/api/audit/vote` to require session and record `user_id`
- [ ] 06-02: Add `/intel/*` to the protected-routes set in middleware
- [ ] 06-03: `/account` page with profile view + sign-out

### Phase 7: Premium tier hooks
**Goal**: `user_profiles` has a `tier` enum, `useUserTier()` exists for client and server, and one minimal premium-gated capability is wired to prove the path. Stripe / billing explicitly out of scope.
**Depends on**: Phase 6
**Requirements**: AUTH-12, AUTH-13, AUTH-14
**Success Criteria** (what must be TRUE):
  1. `user_profiles.tier` enum (`free`, `premium`) added; default `free`; migration applied.
  2. `useUserTier()` hook (client) + `getUserTier()` server util both return one of the enum values for the current user, or `null` for anonymous.
  3. One demo gated capability is live and visibly different for `premium` vs `free` (e.g. "premium users get 5 votes/day on audit findings vs 1").
**Plans**: 3 plans

Plans:
- [ ] 07-01: Add `tier` enum + column to `user_profiles`; backfill existing rows to `free`
- [ ] 07-02: `useUserTier()` (client) + `getUserTier()` (server) helpers
- [ ] 07-03: Wire one demo premium gate (e.g. 5 votes/day vs 1) so the gating path is exercised end-to-end

## Coverage (v2.3)

All 14 v2.3 requirements mapped to a phase. ✓

| Requirement | Phase |
|-------------|-------|
| AUTH-01 | 4 |
| AUTH-02 | 4 |
| AUTH-03 | 4 |
| AUTH-04 | 4 |
| AUTH-05 | 5 |
| AUTH-06 | 5 |
| AUTH-07 | 5 |
| AUTH-08 | 6 |
| AUTH-09 | 6 |
| AUTH-10 | 6 |
| AUTH-11 | 6 |
| AUTH-12 | 7 |
| AUTH-13 | 7 |
| AUTH-14 | 7 |

## Backlog (parking lot — 999.x)

Ideas captured during planning but not in the v2.2 milestone. Promote into a numbered milestone phase when their time comes.

### Phase 999.1: Stitch design system integration
**Goal**: Codify the lex-web visual language into a reusable design-system reference (tokens, components, patterns).
**Source**: User-requested 2026-05-04
**Why deferred**: v2.2 prioritises functional + reliability work; design-system formalisation is most useful once we have all v2.2 surfaces in their final form.
**Requirements**: (none yet — would be defined when promoted)

### Phase 999.2: Vercel KV–backed distributed rate limiter
**Goal**: Replace the per-instance in-memory rate limiter (`lib/rate-limit.ts`) with Vercel KV / Upstash so the limit is shared across all Vercel function instances.
**Why deferred**: Current single-IP cost-control is sufficient at present traffic; revisit when CC traffic warrants distributed enforcement.

### Phase 999.3: Authenticated saved-laws / saved-findings
**Goal**: Optional opt-in account so users can save laws + findings, get alerts on findings (not just law-changes).
**Why deferred**: Adds full auth surface; out-of-scope unless a clear user demand emerges.

### Phase 999.4: Court-decision similarity search
**Goal**: Find decisions similar to a given one via article-citation overlap + embedding similarity.
**Why deferred**: Embedding pipeline cost; would also need `article_embeddings` populated (currently empty).

---
*Roadmap created: 2026-05-04 (auto mode, derived from session context)*
*Last updated: 2026-05-04 — added Backlog (999.x)*
