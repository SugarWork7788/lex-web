# Phase 2 Discussion Log

**Phase:** 02 — New AI features
**Date:** 2026-05-10
**Mode:** discuss (default)
**Workflow:** /gsd-discuss-phase

This log captures the discussion that produced `02-CONTEXT.md`. Human reference only — downstream agents (researcher, planner, executor) consume CONTEXT.md, not this file.

---

## Setup

**Prior context loaded:**
- `.planning/PROJECT.md` (project shape, AI surface conventions, constraints)
- `.planning/ROADMAP.md` (Phase 2 success criteria, plan list)
- `.planning/REQUIREMENTS.md` (INT-02, PDF-01)
- `.planning/STATE.md` (post-Phase-1 state)
- `.planning/phases/01-reliability-observability/01-CONTEXT.md` (D-01 through D-16 — structured log pattern, AUDIT_VOTE_SALT reuse, useRateLimitedFetch hook)

**Carried-forward decisions (not re-asked):**
- Structured-log pattern: `console.log(JSON.stringify({event, route, ip_hash, retry_after, ts}))`, HMAC-SHA-256(ip, AUDIT_VOTE_SALT)→16 hex
- AUDIT_VOTE_SALT reuse with domain prefix (no new salts)
- `useRateLimitedFetch` hook for client 429 handling
- Bulgarian-first prompts; `claude-sonnet-4-6` default; `runtime: "nodejs"` for streaming routes

**Codebase scout (~10% context):**
- Inspected `app/intel/search/page.tsx`, `app/api/intel/search/route.ts`, `app/intel/search/intel-search-summary.tsx`
- Inspected `app/audit/page.tsx`, `app/audit/finding/[id]/page.tsx`, `app/globals.css` print block
- Confirmed: no PDF deps installed; SVG-tile watermark is data-URL background-image in print CSS

---

## Gray Areas Identified

Four phase-specific gray areas, two per workstream:

| # | Area | Why it matters |
|---|------|----------------|
| 1 | Result-card layout (intel) | Drives entire 02-02 UI plan |
| 2 | Ranking + quote attribution (intel) | Defines the data shape and AI cost profile |
| 3 | PDF renderer choice (audit) | Single biggest 02-03 architecture decision |
| 4 | PDF download UX (audit) | Defines route shape and 02-04 button complexity |

User selected: all four.

---

## Discussion

### Area 1 — Result-card layout

**Options presented:**
- Single ranked cross-source feed
- Per-source sections (current shape)
- Hybrid (top "best matches" + per-source breakdown)
- (none of the above) → would have asked freeform

**User selection:** Hybrid — top "best matches" section + per-source breakdown below.

**Follow-up: top-N size**
Options: 3 / 5 (recommended) / 10 / variable (hide if <3)
**User selection:** 5.

**Captured:** D-01 — top section shows up to 5 cross-source ranked cards; per-source sections below preserve existing `LIMIT=10`. If <5 cross-source hits exist, top section shows whatever ranks; if 0, section hidden.

---

### Area 2 — Ranking + quote attribution

**Options presented:**
- Postgres full-text tsvector ranking
- AI re-rank of the 60 raw rows
- Recency / source-authority weights
- Hybrid

**User selection:** Postgres full-text tsvector ranking + recency weights. Quotes from `summary` for articles, source row verbatim for others.

**Follow-up: article quote shape**
Options: full `summary` truncated / `ts_headline()` snippet / AI-extracted 1-2 sentences (recommended) / first 2 sentences
**User selection:** AI-extracted 1-2 sentence quote.

**Claude's discretion (planner-decided, not asked of user):**
- Use `claude-haiku-4-5` for extraction (not Sonnet) — cost + speed; fits <3s budget
- The existing `/api/intel/search` summary endpoint stays as the page-level summary card, unchanged in role. Quote-extraction is a separate AI surface.
- Specific tsvector + recency weight blend is a research/planner concern, not user-facing.
- Source-authority weighting is NOT in scope.

**Captured:** D-02 (ranking signal), D-03 (per-source-type quote attribution), D-04 (Haiku model), D-05 (two distinct AI surfaces).

---

### Area 3 — PDF renderer choice

**Options presented:**
- puppeteer-core + @sparticuz/chromium
- @react-pdf/renderer
- External service (Browserless.io)

**User selection:** puppeteer-core + @sparticuz/chromium — reuses existing print CSS, no reimplementation needed.

**Captured:** D-08 (renderer pick), D-09 (reuses existing `/audit` page render path verbatim via puppeteer navigation + `printBackground: true`).

**Rejected and why:**
- React-pdf would require reimplementing the audit layout in `<Page>/<View>/<Text>` primitives — multi-day churn and the watermark would also need re-creation.
- External service (Browserless.io) adds a network hop, vendor lock-in, and latency variance that endangers the <10s budget.

---

### Area 4 — PDF download UX

**Options presented:**
- Synchronous in-browser download
- Generate + email link via Resend
- Server-cache PDF + share URL

**User selection:** Synchronous in-browser download under 10s. Route: `/api/audit/pdf`. Simple button on audit page.

**Captured:** D-10 (synchronous download), D-11 (route shape `/api/audit/pdf`), D-12 (single button on /audit page).

**Claude's discretion:**
- Runtime: `nodejs` (puppeteer can't run on Edge)
- maxDuration: 60s (6× headroom over the 10s success criterion)
- Filename: `Content-Disposition: attachment; filename="lex-brain-audit-<date>.pdf"`

---

## Deferred Ideas

User did not raise scope creep during the discussion. Deferred items in CONTEXT.md are bookkeeping carryovers (auth-gated features, salt cleanup, fallback strategies) — not user-suggested adds.

---

## Open Questions Surfaced (for research/planner)

7 technical investigations that downstream agents must resolve. Captured in CONTEXT.md `<open_questions>`. Highlights:

1. Are tsvector columns/GIN indexes already populated on the 6 intel tables, or does plan 02-01 need a Supabase migration?
2. Does `@sparticuz/chromium` (~50MB compressed) fit Vercel's bundle limit?
3. Puppeteer cold-start on Vercel — does it stay below the <10s budget cold and warm?
4. What exactly goes in the PDF — listing page only, or page + per-finding bodies?
5. Recency-decay curve shape (e.g., exp half-life vs linear).
6. Does the new ranking endpoint reshape `/api/intel/search` or live at a sibling path?
7. Future: how does puppeteer authenticate when v2.3 auth lands? (Out of scope, noted only.)

---

## Outcome

CONTEXT.md captures 13 implementation decisions (D-01 through D-13), 13 canonical refs, code-context for both workstreams, 7 open questions for research, and 9 deferred ideas. Phase 2 is ready for `/gsd-plan-phase 2`.
