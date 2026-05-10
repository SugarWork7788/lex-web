# Roadmap: lex-web

## Overview

v2.2 — "Post-security-hardening release". Three phases that close the open audit follow-ups (#10 OpenSanctions streaming, finer rate-limit observability), ship the two new user-visible features (Intel AI search v2, server-rendered Audit PDF export), and polish the mobile experience while wiring up CodeRabbit so every future PR is auto-reviewed. Sequential by default; phases 1 and 2 could parallelise if needed.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (e.g. 2.1): Urgent insertions (marked `INSERTED`)

- [x] **Phase 1: Reliability & observability** — fix OpenSanctions OOM risk, surface rate-limit info in UI (3/3 plans complete)
- [x] **Phase 2: New AI features** — Intel search v2 + server-rendered Audit PDF (3/3 plans complete; verifier next)
- [ ] **Phase 3: Mobile polish & CodeRabbit** — mobile UX pass + GitHub App install
- [x] **Phase 8: Държавен вестник (State Gazette) browser** — JSF scraper + /dv UI + AI summary endpoint (3/3 plans complete; 2-year backfill deferred to post-merge)
- [ ] **Phase 8.1: DV scraper navigation hotfix** [INSERTED 2026-05-11] — backfill produced 0 net rows + corrupted 9 issue shells; JSF idObj POST + pagination both broken; rewrite to stateless GET path

## Phase Details

### Phase 1: Reliability & observability
**Goal**: Eliminate the OpenSanctions ~1 GB RAM peak and give users actionable feedback when they hit a rate limit.
**Depends on**: Nothing (independent of v2.1.x security work; builds on it).
**Requirements**: OS-01, RL-01
**Success Criteria** (what must be TRUE):
  1. `scripts/scrape_opensanctions.py` (lex-brain) processes the full sanctions CSV with peak RSS < 200 MB on a 4 GB box.
  2. Hitting `/api/chat/[slug]` 11+ times within 60 s shows a UI message with a countdown ("Try again in Ns") instead of a silent failure.
  3. Per-route rate-limit hit/throttle counts are observable from logs (`grep`-able pattern with route name and IP-hash).
**Plans**: 3 plans (1 complete, 2 ready as Wave 1)

Plans:
- [x] 01-00-PLAN.md — Wave 0 bootstrap: install psutil (lex-brain) + vitest+RTL+jsdom (lex-web) and write vitest.config.ts; zero source changes (✓ 2026-05-09, 3 min)
- [x] 01-01-PLAN.md — Stream OpenSanctions CSV via fetch_with_retry_stream + io.TextIOWrapper(newline="") into csv.DictReader; psutil RSS sampler asserts peak < 200 MB on a >=100 MB synthetic CSV (✓ 2026-05-09; measured peak_rss = 36 MB on 100 MB fixture, ~5.5× safety margin)
- [x] 01-02-PLAN.md — useRateLimitedFetch hook + RateLimitToast (aria-live, BG, countdown to 0); HMAC ip_hash + JSON one-liner stdout log inside lib/rate-limit.ts; migrate 8 fetch sites across 6 files (analyze excluded per D-02) (✓ 2026-05-09; 8/8 vitest tests, tsc clean, next build green)

### Phase 2: New AI features
**Goal**: Ship the next round of user-visible AI value — better intel search, downloadable audit PDF.
**Depends on**: Phase 1 (rate-limit UI is reused)
**Requirements**: INT-02, PDF-01
**Success Criteria** (what must be TRUE):
  1. `/intel/search` returns ranked, multi-source results in <3 s; quotes are extractable and clickable.
  2. `/audit?format=pdf` (or a dedicated route) returns a single PDF file with the `LEX.BRAIN` watermark, regardless of the user's browser print settings.
  3. Audit PDF download fires <10 s for the full 352-finding report.
**Plans**: 3 plans (collapsed from 4 per RESEARCH §"Renumbered plan list" — data-fetch + UI cards share files; PDF route + button share a single execution wave). Wave 1 = 02-01; Wave 2 = 02-02 + 02-03 (parallel).

Plans:
- [x] 02-01-PLAN.md — Supabase tsvector + GIN migration on the 6 intel tables + intel_search_top(q) ranking RPC; idempotent SQL + Node applier; [BLOCKING] live-DB push (✓ 2026-05-10, ~25 min, 1 deviation cycle: IMMUTABLE wrapper for array_to_string in GENERATED column)
- [x] 02-02-PLAN.md — Intel ranking helper (lib/intel-search.ts) + <BestMatches>/<BestMatchCard>/<BestMatchQuote> UI per UI-SPEC + /api/intel/quote Haiku 4.5 streaming endpoint (✓ 2026-05-10, ~8 min, 3 auto-fix cycles; 31 vitest cases added; INT-02 closed)
- [x] 02-03-PLAN.md — /api/audit/pdf route (puppeteer-core + @sparticuz/chromium) + <DownloadPdfButton /> on /audit + next.config.ts outputFileTracingIncludes + engines.node ≥22.17.0 (✓ 2026-05-10, ~10 min, 2 auto-fix cycles: @sparticuz/chromium@148 API drift, Uint8Array→BodyInit TS variance; PDF-01 closed)

### Phase 8: Държавен вестник (State Gazette) browser
**Goal**: Make the Bulgarian State Gazette (dv.parliament.bg) browseable + searchable inside lex-web — issues, acts, and AI summaries — sourced from a polite, resumable scraper in lex-brain.
**Depends on**: Phase 1 (rate-limit hook + structured-log pattern reused for any new public endpoint)
**Requirements**: DV-01, DV-02
**Success Criteria** (what must be TRUE):
  1. lex-brain scraper backfills the most recent 2 years of issues (~100 issues, ~3000–5000 acts) into `dv_issues` + `dv_acts` Supabase tables; resumable by `(year, issue_number)` + `idMat`; respects ≥1 s polite delay; surfaces a structured progress log.
  2. `/dv` lists issues with number, date, count of acts; pagination works; results render in <2 s for the listing page.
  3. `/dv/[issue]` shows all acts in one issue with title, type, and link to the original `dv.parliament.bg` source; per-act AI summary is reachable via a button (or inline streaming card).
  4. "Държавен вестник" link is visible in the main nav.
**Plans**: 3 plans (3 complete; 2 waves)

Plans:
- [x] 08-01-PLAN.md — Wave 1: Supabase tsvector + GIN + dv_search_top RPC migration (lex-web) + lex-brain JSF scraper for dv.parliament.bg with 16-test helper module + 7-step walk algorithm. **Includes 2 BLOCKING checkpoints** (live DB push, live-net scraper smoke against issue 2026/42 — both passed). (✓ 2026-05-10; smoke = 10 acts, 0 jsessionid leaks, 0 missing bodies)
- [x] 08-02-PLAN.md — Wave 2: lex-web `/dv` listing + `/dv/[slug]` detail + queries layer + nav link + DV_ACT_PILL design token. 36 new vitest cases. (✓ 2026-05-11; 44/44 tests in worktree, 55/55 after merge with 08-03)
- [x] 08-03-PLAN.md — Wave 2 (parallel-safe with 08-02): `/api/dv/summarize` Anthropic Sonnet 4.6 streaming endpoint with rate-limit, signal-cancellation, write-back-after-loop cache invariant (NEVER in finally). 11 vitest cases incl. abort-no-poison. (✓ 2026-05-11)

**UI hint**: yes (listing page + issue detail + nav addition)

**Post-merge deferred:** the full 2-year backfill in lex-brain (~10,000 rows × 1.5 s polite delay ≈ 2–3 h). Recipe in 08-01-SUMMARY.md.

### Phase 8.1: DV scraper navigation hotfix [INSERTED 2026-05-11]
**Goal**: Replace the broken JSF POST-back navigation in `lex-brain/scripts/scrape_dv.py` (which silently aliased every historical-issue request to the most-recent issue's TOC + whose pagination always reset to page 1) with the verified stateless `materiali.faces?idObj=N&razdel_=R` GET per-issue TOC plus a date-filtered `broeveList.faces` POST for issue enumeration. Add a historical-issue smoke against 2025/100 (12 official + 30 unofficial = 42 acts) that catches the alias-to-newest regression class. Add the `dv_acts(issue_id)` btree index that the refetch predicate needs at backfill scale. Repair the 9 corrupt empty-shell `dv_issues` rows from the failed Phase 8 backfill via a `--refetch-empty` second-pass mode. Re-launch the full 2-year backfill once smoke is green.
**Depends on**: Phase 8 (this is its hotfix; same schema, same lex-web `/dv` UI surfaces the new data automatically once backfill completes)
**Requirements**: DV-01 (re-affirmed — Phase 8 passed its smoke gate but failed the actual goal of historical-content reachability)
**Success Criteria** (what must be TRUE):
  1. `dv_acts(issue_id)` btree index exists on live Supabase (greppable via `pg_indexes WHERE indexname='dv_acts_issue_id_idx'`).
  2. `scripts/scrape_dv.py` contains zero references to `_post_tab2`, `_post_issue_toc`, `_post_pagination`, `_get_index` (the broken postback layer is gone).
  3. After running `scripts/scrape_dv.py --issue 2025/100`, dv_acts has exactly 42 rows attributed to (year=2025, issue_number=100), zero jsessionid leaks, zero empty bodies, zero `view_aliasing_detected` events in the smoke log.
  4. After running `scripts/scrape_dv.py --refetch-empty`, the 9 corrupt-shell `dv_issues` rows (Бр.33–41 of 2026) each have ≥1 act and the `LEFT JOIN COUNT=0` predicate returns 0 rows for that range.
  5. The full 2-year backfill is running in background with zero `view_aliasing_detected` events at the 5-minute progress check.
  6. Phase 8 helpers byte-identical: `scripts/_lib/dv_jsf.py` + `scripts/_lib/http_retry.py` + `tests/test_dv_jsf.py` are zero-diff vs Phase 8 (D-06 + D-12 invariants).
**Plans**: 1 plan, 4 tasks (single wave)

Plans:
- [ ] 08.1-01-PLAN.md — Wave 1: (1) lex-web `db/dv_schema.sql` index append + idempotent re-apply; (2) lex-brain `scripts/scrape_dv.py` rewrite (stateless GET TOC + broeveList.faces enum + view-aliasing guard + `--refetch-empty` mode); (3) lex-brain `tests/test_dv_navigation.py` (7 unit + 4 live tests gated by `RUN_LIVE_DV_TESTS=1`); plus **2 BLOCKING checkpoints** — manual smoke + DB verification for 2025/100, then `--refetch-empty` repair + full backfill kickoff (D-04 + D-05).

**UI hint**: no (UI is correct, just starved of data — the existing `/dv` listing + `/dv/[slug]` surfaces populate automatically as backfill runs)

**Cross-repo PRs (mirrors Phase 8 model):**
- lex-web: `db/dv_schema.sql` + ROADMAP + 08.1-01-SUMMARY.md (small, idempotent additive index)
- lex-brain: branch `feat/phase-08.1-scraper-hotfix` — `scripts/scrape_dv.py` rewrite + `tests/test_dv_navigation.py` new file

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

All 8 v2.2 requirements mapped to a phase. ✓

| Requirement | Phase |
|-------------|-------|
| OS-01 | 1 |
| RL-01 | 1 |
| INT-02 | 2 |
| PDF-01 | 2 |
| DV-01 | 8 (closed by 8.1) |
| DV-02 | 8 |
| MOB-01 | 3 |
| CR-01 | 3 |

## Phase 1 progress

| Plan | Status | Duration | Tasks | Files | Completed |
|------|--------|----------|-------|-------|-----------|
| 01-00 | ✓ Complete | 3 min | 3 | 5 | 2026-05-09 |
| 01-01 | ✓ Complete | 10 min | 3 | 4 | 2026-05-09 |
| 01-02 | ✓ Complete | 16 min | 3 | 11 | 2026-05-09 |

## Phase 2 progress

| Plan | Status | Duration | Tasks | Files | Completed |
|------|--------|----------|-------|-------|-----------|
| 02-01 | ✓ Complete | ~25 min | 3 + 1 deviation (Rule 1) | 4 (db/intel_fts.sql, scripts/apply-intel-fts.ts, package.json, bun.lock) | 2026-05-10 |
| 02-02 | ✓ Complete | ~8 min | 3 + 3 auto-fix (Rule 1×2, Rule 3×1) | 9 (lib/intel-search.ts, app/api/intel/quote/route.ts, app/intel/search/{best-matches,best-match-card,best-match-quote}.tsx, app/intel/search/page.tsx, 3 test files) | 2026-05-10 |
| 02-03 | ✓ Complete | ~10 min | 3 + 2 auto-fix (Rule 1×2) | 6 (package.json, next.config.ts, app/api/audit/pdf/route.ts, app/audit/download-pdf-button.tsx, app/audit/page.tsx, __tests__/audit-pdf-route.test.ts) | 2026-05-10 |

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
*Last updated: 2026-05-11 — Phase 8.1 inserted (1 plan, 4 tasks, 2 BLOCKING checkpoints; addresses Phase 8 backfill failure)*
