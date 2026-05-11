# Requirements: lex-web

**Defined:** 2026-05-04
**Core Value:** Every Bulgarian citizen can read, understand, and act on the law that affects them — without paying for a lawyer to translate it.

## Validated Requirements

Shipped before v2.2. Source-of-truth lives in PROJECT.md → "Validated".

### Reader

- ✓ **READ-01**: User can browse all 1240 Bulgarian laws by category (`/laws`)
- ✓ **READ-02**: User can read a full law with article-level navigation and search-highlight (`/laws/[slug]`)
- ✓ **READ-03**: User can follow cross-references between laws (15 364 mapped)
- ✓ **READ-04**: User can compare two laws side-by-side (`/compare/[slug1]/[slug2]`)
- ✓ **READ-05**: User can browse the interactive legal-system map (`/map`)

### AI

- ✓ **AI-01**: User can chat with an AI bound to a single law's text, streaming, Bulgarian markdown (`/api/chat/[slug]`)
- ✓ **AI-02**: User can request multi-pass deep-analysis of a law (`/analyze/[slug]`)
- ✓ **AI-03**: User can read AI summaries of court decisions (`/api/courts/summarize/...`)
- ✓ **AI-04**: User can chat with AI bound to a court decision (`/api/courts/chat/...`)
- ✓ **AI-05**: User can read AI summaries of EU regulations (`/api/eu/summarize/[celex]`)
- ✓ **AI-06**: User can chat with AI bound to an EU regulation (`/api/eu/chat/[celex]`)
- ✓ **AI-07**: AI chat has smart sticky-bottom scroll, jump-down pill, stop button, and propagates client disconnect to upstream Anthropic stream

### Courts

- ✓ **COURT-01**: User can browse VKS / VAS / KS court decisions filtered by year and act type (`/courts`)
- ✓ **COURT-02**: User can open a single court decision with its metadata + full text (`/courts/[court]/[id]`)

### EU

- ✓ **EU-01**: User can browse EU regulations corpus by CELEX (`/eu`)
- ✓ **EU-02**: User can open a single regulation with metadata + text (`/eu/[celex]`)

### Intel

- ✓ **INTEL-01**: User can browse sanctions, offshore entities, OLAF, NAP, prosecution, and articles (`/intel/*`)
- ✓ **INTEL-02**: User can run an AI-powered search across all intel sources v1 (`/api/intel/search`)

### Audit

- ✓ **AUDIT-01**: User can browse all 352 National Legal Audit findings, severity-coded, votable (`/audit`)
- ✓ **AUDIT-02**: User can open a single finding by ID for sharing (`/audit/finding/[id]`)
- ✓ **AUDIT-03**: User can vote on a finding once per IP+fingerprint (`/api/audit/vote`)
- ✓ **AUDIT-04**: User sees a reform-timeline visualization on /audit (3 horizontal lanes, severity-colored squares, click-to-finding)
- ✓ **AUDIT-05**: User can print /audit as a paginated PDF with diagonal `LEX.BRAIN` watermark (print CSS only)

### Alerts

- ✓ **ALERT-01**: User can subscribe to email alerts for a specific law via Resend (`/api/alerts/subscribe`)
- ✓ **ALERT-02**: User can unsubscribe via tokenized link (`/api/alerts/unsubscribe`)

### Security baseline

- ✓ **SEC-01**: All Anthropic-using routes are per-IP per-route rate-limited (`lib/rate-limit.ts`)
- ✓ **SEC-02**: All routes return 6 security headers (CSP / HSTS / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy)
- ✓ **SEC-03**: Audit votes increment atomically via `increment_audit_vote(uuid)` Postgres RPC
- ✓ **SEC-04**: `name_bg` in subscribe is sanitised against email-header injection
- ✓ **SEC-05**: `unsubscribe` returns generic errors (no Supabase error reflection)
- ✓ **SEC-06**: `AUDIT_VOTE_SALT` is required env var (no hardcoded fallback)
- ✓ **SEC-07**: Subscribe is idempotent — repeat POSTs don't re-send confirmation emails

## v2.2 Requirements

Targeted for the next milestone. Mapped to phases below.

### Reliability

- [ ] **OS-01**: OpenSanctions ingestion streams the CSV instead of loading the full ~300-500 MB into memory (audit LOW #10)
- [ ] **RL-01**: Rate-limit responses surface the `Retry-After` header in the UI as a friendly "Try again in Ns" message; basic per-route hit/throttle metrics logged

### Features

- [x] **INT-02**: Intel AI search v2 — better ranking, multi-source quote-style results, more responsive streaming (closed by 02-02 on 2026-05-10)
- [x] **PDF-01**: Server-rendered single-file PDF export of /audit with the `LEX.BRAIN` watermark (closed by 02-03 on 2026-05-10 — `/api/audit/pdf` route via puppeteer-core + @sparticuz/chromium triggers existing `@media print` block; `<DownloadPdfButton />` mounted on /audit stats row)

### UX + Ops

- [ ] **MOB-01**: Mobile UI improvements — audit-page card density, intel-page filter ergonomics, reader font scaling
- [ ] **CR-01**: CodeRabbit GitHub App installed on `SugarWork7788/lex-web` so every PR is auto-reviewed (matches the new PR-only workflow rule)

### State Gazette (added 2026-05-10)

- [ ] **DV-01**: lex-brain scraper for dv.parliament.bg (Държавен вестник) — backfills 2 years of issues (~100 issues, 3000–5000 acts) into `dv_issues` + `dv_acts` Supabase tables; resumable by `(year, issue_number)` and `idMat`; honors ≥1 s polite delay; structured progress log; identifies itself via User-Agent
- [ ] **DV-02**: lex-web `/dv` and `/dv/[issue]` pages — issue listing with pagination + search/filter by act type; per-issue act listing with original-source links; per-act AI summary endpoint (POST `/api/dv/summarize` streaming Anthropic, rate-limited); nav link in `app/layout.tsx`

## v2.3 Requirements

Promoted from backlog 2026-05-05. New milestone after v2.2. Reverses the prior "no user accounts" decision in PROJECT.md (anonymous reading still preserved on `/laws` and `/audit` content).

### Auth foundation

- [ ] **AUTH-01**: User can sign up with email + password (verification flow via Supabase Auth)
- [ ] **AUTH-02**: User can sign in with Google OAuth
- [ ] **AUTH-03**: `user_profiles` table created with RLS — users can only read/update their own row
- [ ] **AUTH-04**: Sign-in / sign-up / sign-out UI pages in Bulgarian + `getSession()` server util + `useSession()` client hook

### Auth middleware + protection

- [ ] **AUTH-05**: Next.js middleware enforces auth on opted-in routes; allowlists public reader routes
- [ ] **AUTH-06**: Unauthenticated request to a protected route → redirect to `/sign-in?returnTo=<path>`; sign-in lands user on returnTo
- [ ] **AUTH-07**: Server Components in protected routes can call `getSession()` and assume non-null

### Page gating

- [ ] **AUTH-08**: `/audit` voting requires authenticated session; vote attributed to `user_id` in `audit_votes`
- [ ] **AUTH-09**: `/intel/*` routes require authenticated session
- [ ] **AUTH-10**: Anonymous users still see `/audit` finding content (vote button shows "Sign in to vote")
- [ ] **AUTH-11**: `/account` page exists — profile view + sign-out

### Favorites / Saved items (Phase 6 backlog — captured 2026-05-11)

- [ ] **FAV-01**: `user_saved_items` table exists `(id uuid pk, user_id uuid → auth.users, item_type text, item_id text, item_slug text, item_title text, saved_at timestamptz)` with RLS — users can read/insert/delete their own rows only; UNIQUE `(user_id, item_type, item_id)`
- [ ] **FAV-02**: Bookmark UI (🔖 filled/outline) appears on every item surface across 6 entity types: Laws (`/laws/[slug]`), Court decisions (`/courts/[court]/[id]`), EU regulations (`/eu/[celex]`), Audit findings (`/audit/finding/[id]`), DV acts (`/dv/[issue]`), Intel entities (`/intel/sanctions`, `/intel/offshore`)
- [ ] **FAV-03**: Click toggles save/unsave; optimistic update in UI; rollback on error; one round-trip per toggle
- [ ] **FAV-04**: Anonymous users see "Sign in to save" prompt linking to `/sign-in?returnTo=…` — mirrors `<VoteButton>` anonymous variant from AUTH-10
- [ ] **FAV-05**: `/profile/saved` page lists all saved items grouped by type, with type-filter chips (Закони / Решения / ЕС / Одит / ДВ / Разузнаване) defaulting to "All"
- [ ] **FAV-06**: In-list search box on `/profile/saved` filters by `item_title` substring (case-insensitive, Cyrillic-aware)

### Premium tier hooks

- [ ] **AUTH-12**: `user_profiles.tier` enum (`free`, `premium`) added; existing rows backfilled to `free`
- [ ] **AUTH-13**: `useUserTier()` client hook + `getUserTier()` server util — return enum value or `null` for anonymous
- [ ] **AUTH-14**: One demo premium-gated capability wired end-to-end (e.g. 5 audit votes/day for premium vs 1 for free)

## v3.x Backlog (deferred)

These were captured during planning but not in the v2.2 or v2.3 milestones. See `.planning/backlog/` for details once `/gsd-add-backlog` populates them.

- Stitch design integration (design-system codification)
- Fine-grained per-route rate-limit tuning + Vercel KV-backed distributed limiter
- Authenticated saved-laws / saved-findings (now unlockable post-v2.3 since auth lands)
- Court-decision similarity search
- Stripe / billing wiring (v2.3 only ships the gating hooks; payment is its own milestone)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Native mobile app | Web-first; reader works on mobile, app would 5x scope |
| User accounts / login | Anonymous reader app — keeps friction zero; only optional email opt-in |
| Comments / threads on laws | Moderation cost dwarfs reader value; alerts cover the watch use-case |
| Editorial CMS | Laws come from scrapers (lex-brain), not human-authored content |
| Paid tier / subscriptions | Non-commercial public service |
| Languages other than Bulgarian | Corpus is BG; translation is a separate product |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| OS-01 | Phase 1 | Pending |
| RL-01 | Phase 1 | Pending |
| INT-02 | Phase 2 | ✓ Complete (02-02) |
| PDF-01 | Phase 2 | ✓ Complete (02-03) |
| MOB-01 | Phase 3 | Pending |
| CR-01 | Phase 3 | Pending |
| DV-01 | Phase 8 | Pending |
| DV-02 | Phase 8 | Pending |

**Coverage (v2.2):**
- v2.2 requirements: 8 total
- Mapped to phases: 8
- Unmapped: 0 ✓

### v2.3 (Auth & Premium hooks)

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 4 | Pending |
| AUTH-02 | Phase 4 | Pending |
| AUTH-03 | Phase 4 | Pending |
| AUTH-04 | Phase 4 | Pending |
| AUTH-05 | Phase 5 | Pending |
| AUTH-06 | Phase 5 | Pending |
| AUTH-07 | Phase 5 | Pending |
| AUTH-08 | Phase 6 | Pending |
| AUTH-09 | Phase 6 | Pending |
| AUTH-10 | Phase 6 | Pending |
| AUTH-11 | Phase 6 | Pending |
| AUTH-12 | Phase 7 | Pending |
| AUTH-13 | Phase 7 | Pending |
| AUTH-14 | Phase 7 | Pending |
| FAV-01 | Phase 6 (backlog) | Pending |
| FAV-02 | Phase 6 (backlog) | Pending |
| FAV-03 | Phase 6 (backlog) | Pending |
| FAV-04 | Phase 6 (backlog) | Pending |
| FAV-05 | Phase 6 (backlog) | Pending |
| FAV-06 | Phase 6 (backlog) | Pending |

**Coverage (v2.3):**
- v2.3 requirements: 20 total (14 AUTH + 6 FAV)
- Mapped to phases: 20
- Unmapped: 0 ✓
- **Note:** FAV-01..FAV-06 are Phase 6 *backlog* — captured but not yet committed to plan-phase scope. Likely justifies splitting Phase 6 into 6.1 (gating) and 6.2 (favorites) when discuss-phase runs. See ROADMAP.md §"Phase 6 / Backlog (post-initial-cut)".

---
*Requirements defined: 2026-05-04 (auto mode, brownfield from session context)*
*Last updated: 2026-05-05 — added v2.3 Auth & Premium hooks milestone*
