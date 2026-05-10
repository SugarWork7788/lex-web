# Phase 8 Discussion Log

**Phase:** 08 — Държавен вестник (State Gazette) browser
**Date:** 2026-05-10
**Mode:** discuss (default)
**Workflow:** /gsd-discuss-phase

This log captures the discussion that produced `08-CONTEXT.md`. Human reference only — downstream agents (researcher, planner, executor) consume CONTEXT.md, not this file.

---

## Setup

**Phase added to ROADMAP earlier this session** as a new entry in the v2.2 milestone, between Phase 2 and Phase 3, with non-monotonic ID 8 (chosen over decimal 2.5 to keep the filesystem convention `02-`, `03-`, `08-` clean). Two requirements added: DV-01 (lex-brain scraper) and DV-02 (lex-web pages).

**Prior context loaded:**
- `.planning/PROJECT.md` (project shape, AI surface conventions)
- `.planning/ROADMAP.md` (Phase 8 success criteria)
- `.planning/REQUIREMENTS.md` (DV-01 + DV-02)
- `.planning/STATE.md` (post-Phase-1 state on `main`; Phase 2 in flight on its own branch)
- `.planning/phases/01-reliability-observability/01-CONTEXT.md` (rate-limit hook + structured-log pattern + AUDIT_VOTE_SALT reuse — all carry-forward)
- `.planning/phases/02-new-ai-features/02-CONTEXT.md` (intel ranking + tsvector + recency decay + source-pill triplet pattern + card primitive — all reusable)

**Carried-forward decisions (not re-asked):**
- Bulgarian copy only
- `runtime: "nodejs"` for streaming routes
- Anthropic SDK already in deps
- `useRateLimitedFetch` hook + `RateLimitToast` for client 429 handling
- `lib/rate-limit.ts` server gate + structured throttle log
- HMAC-SHA-256 ip_hash truncated 16 hex
- AUDIT_VOTE_SALT reused (no new salts; domain-prefix in input if needed)
- Tailwind 4 + React 19 + bun + Next 16 (NOT what training data describes — heed AGENTS.md)
- Dark stone theme, Phase 2 card primitive, source-pill triplet pattern

**Pre-discussion research (Task 1 of the user's original message):**
Direct fetches against `dv.parliament.bg/DVWeb/*` confirmed:
- Stateful JSF/Faces (Java) — `jsessionid` in URLs, `ViewState` tokens required for POST-back navigation
- Per-act stable URL: `/DVWeb/showMaterialDV.jsp?idMat=<numeric>`
- No RSS / API / sitemap (`/rss.faces`, `/searchSection.faces`, `/broeve.faces`, `/showIssue.faces` all 404)
- No `robots.txt` (404)
- Full text rendered inline as HTML (no PDF parse needed)
- 5 visible act types: Указ, Постановление, Наредба, Споразумение, Решение

**Codebase scout:**
| Surface | Closest analog |
|---|---|
| `/dv` listing | `app/intel/articles/page.tsx` (paginated + search form) |
| `/dv/[issue]` detail | `app/courts/page.tsx` (multi-section grouped layout) |
| Page header / stats / filters | `app/audit/page.tsx` lines 76–110 |
| `/api/dv/summarize` | `app/api/intel/search/route.ts` (Anthropic streaming) + `app/api/eu/summarize/[celex]/route.ts` (per-record summarize) |
| Schema migration | Phase 2's `db/intel_fts.sql` (idempotent, `IF NOT EXISTS`, applier script) |
| Nav addition | `app/layout.tsx` existing 7-link nav block |

---

## Gray Areas Identified

Four phase-specific gray areas were presented:

| # | Area | Why it matters |
|---|------|----------------|
| 1 | Backfill scope + scraper politeness | Drives DV-01 plan size, scrape duration, risk profile |
| 2 | Search + filtering + schema additions | Determines whether Phase 8 adds tsvector (Phase 2 parity) or stays with ILIKE; affects schema |
| 3 | AI summary scope + caching | Cost/quality trade-off (Sonnet vs Haiku, full vs excerpt, cache vs always-fresh) |
| 4 | Listing & detail page layout | Card grid vs table; grouped vs flat; source-link policy; AI trigger UX |

User selected: all four.

---

## Discussion

### Area 1 — Backfill scope + scraper politeness

**Q1.1 Backfill window?**
Options: 2024+2025+YTD / rolling 24mo / since 2024-01-01 / current+previous year only.
**User selected:** All of 2024 + 2025 + 2026-to-date (Recommended). Year-boundary termination, ~250 issues, 7500–12500 acts.

**Q1.2 Polite delay?**
Options: 1.5s + jitter / 1s flat / 3s base / adaptive.
**User selected:** 1.5 s base + jittered ±500 ms; back off on 429/503 (Recommended). Effective ~1–2s/req, ~2–3 hours total cold backfill.

**Q1.3 User-Agent + robots.txt behavior?**
Options: Identifying UA + ignore missing robots / Generic UA / Identifying UA + abort if robots appears.
**User selected:** Identifying UA + ignore missing robots.txt (Recommended). UA points at lex-web-eta.vercel.app (future `/about` page deferred — UA points to a placeholder URL we'll honor).

**Captured:** D-01 (backfill window), D-02 (polite delay + retry), D-03 (UA + robots policy).

---

### Area 2 — Search + filtering + schema additions

**Q2.1 Search implementation?**
Options: tsvector + GIN (Phase 2 parity) / ILIKE only / hybrid (FTS on acts, ILIKE on issues).
**User selected:** Add tsvector + GIN (Phase 2 parity) (Recommended). Adds ~50 lines DDL; enables ranked cross-issue search.

**Q2.2 Filter dimensions (multi-select)?**
Options: act_type / year / date range / issue range.
**User selected:** All four. Filter UI on `/dv` listing carries all dimensions.

**Q2.3 Search scope?**
Options: Cross-issue listing + scoped detail / Cross-issue both / Issue-only listing + act detail.
**User selected:** Cross-issue on `/dv`; scoped to one issue on `/dv/[issue]` (Recommended).

**Captured:** D-04 (resumability via DB), D-06 (schema additions: tsvector + GIN + summary_ai column + `dv_search_top` RPC), D-07 (`simple` tsvector config), D-11 (4 filter dimensions), D-12 (search scope split).

---

### Area 3 — AI summary scope + caching

**Q3.1 Model + input shape?**
Options: Sonnet + full text / Haiku + full text / Sonnet + 4k cap / length-routed Haiku-or-Sonnet.
**User selected:** Sonnet 4.6 + full text (Recommended). Citizen-friendly markdown explanation; ~$0.05–$0.15/act.

**Q3.2 Caching strategy?**
Options: DB write-back / no cache / in-mem LRU / Vercel Runtime Cache.
**User selected:** Write-back to `dv_acts.summary_ai` column on first call (Recommended). DB-cache amortizes cost across all readers; future research can adopt Vercel Runtime Cache if DB pressure becomes a concern.

**Q3.3 Route shape + rate limit?**
Options: POST /api/dv/summarize streaming / GET with query param / RSC pre-render.
**User selected:** POST `/api/dv/summarize` body `{ actId }` streaming markdown (Recommended). Rate-limit: 10/min/IP (stricter than Haiku quote 30/min because Sonnet is 5× more expensive).

**Captured:** D-13 (route shape + rate limit + cache logic), D-14 (Sonnet + full-text input).

**Researcher's job (open question Q7):** project the 12-month Anthropic cost for the chosen model + cache. If above an acceptable threshold, planner can re-route to length-based Haiku/Sonnet split (D-14 alternative).

---

### Area 4 — Listing & detail page layout

**Q4.1 `/dv` listing layout?**
Options: Card grid (issue-as-card) / paginated table / hybrid hero+table.
**User selected:** Card grid (Recommended). 2-col desktop, 1-col mobile. Each card = issue # + date + act count + top-3 act-type pills.

**Q4.2 `/dv/[issue]` detail layout?**
Options: Grouped-by-act-type (like /courts) / flat ordered / sidebar nav + flat.
**User selected:** Grouped-by-act-type sections (Recommended). Section order: Закони → Наредби → Постановления → Укази → Решения → Обявления → Other.

**Q4.3 Source link policy?**
Options: Inline + footer attribution / inline only / footer only with hover.
**User selected:** Inline per-act `↗ Оригинал` + footer attribution (Recommended). `jsessionid` stripped from `source_url` before save (D-05).

**Q4.4 AI summary trigger UX?**
Options: Inline button expanding within card / modal-drawer / dedicated `/dv/[issue]/[actId]` route.
**User selected:** Inline button expanding within card (Recommended). Match Phase 2's BestMatchQuote streaming pattern.

**Captured:** D-08 (listing layout), D-09 (detail layout), D-10 (source links), D-15 (AI trigger UX).

---

## Decisions Out of Scope for User (Claude's discretion → researcher/planner)

These were noted as needing investigation but not asked of the user — they're technical-implementation calls:

- ViewState extraction parser (BeautifulSoup vs lxml) — researcher picks
- DV_ACT_PILL color assignments (5–6 act types × triplet from existing Phase 2 palette or fresh) — UI researcher picks during ui-phase
- `dv_search_top` RPC signature details (parameter defaults, NULL handling) — planner picks during plan-phase
- `summary_ai` write-during-stream vs write-after-complete (D-13 says complete only; researcher/planner confirms the `try/finally` mechanic)
- `/dv/[issue]` URL canonicalization (slug vs query vs nested) — planner picks
- `lex-brain` directory placement (`scripts/scrape_dv.py` vs `scrapers/laws/scrape_dv.py` per user's original message) — researcher reconciles

---

## Open Questions Surfaced (10 — for research/planner)

Captured in CONTEXT.md `<open_questions>`. Highlights:

1. Archive-walking strategy on dv.parliament.bg (no API; needs JSF POST-back exploration)
2. idMat enumeration per issue
3. Act-type extraction (attribute vs title-prefix inference)
4. Supplementary issues (`приложение`)
5. `simple` vs Bulgarian Postgres FTS dictionary
6. Stream-completion detection for cache write-back
7. Anthropic cost projection (Sonnet × ~12500 acts)
8. URL canonicalization for `/dv/[issue]`
9. JSF session lifetime
10. lex-brain repo directory layout

---

## Deferred Ideas (out of scope for v2.2 Phase 8)

User did not raise scope creep during the discussion. Deferred items in CONTEXT.md (cross-issue analytics, email alerts, full-text export, multi-lingual UI, per-act discussion, issuer search, /laws-corpus linking, scraper status page, PDF export) are bookkeeping for the future — not user-suggested adds.

---

## Outcome

CONTEXT.md captures 19 implementation decisions (D-01 through D-19) across the two workstreams, 18 canonical refs, code-context for both lex-brain (scraper extending Phase 1's http_retry helpers + cookie-jar/ViewState additions) and lex-web (5 distinct UI surfaces with concrete analog files), 10 open questions for the researcher, and 9 deferred ideas. Phase 8 is ready for `/gsd-ui-phase 8` (recommended given the UI surface area) then `/gsd-plan-phase 8`.
