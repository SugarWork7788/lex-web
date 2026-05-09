# Phase 2: New AI features - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Two user-visible AI deliverables for v2.2, each with its own workstream:

1. **Intel AI search v2 (INT-02)** — refactor `/intel/search` so the 6-source ILIKE fan-out becomes ranked, multi-source, **quote-attributed** results in <3 s. Hybrid layout: top "best matches" section (5 cross-source ranked cards) + per-source breakdown below (existing `LIMIT=10` per table preserved).

2. **Audit PDF download (PDF-01)** — server-rendered single-file PDF of `/audit` (full 352-finding report) with the existing `LEX.BRAIN` watermark. Synchronous in-browser download under 10 s. Triggered by a "Download as PDF" button on `/audit`.

**Not in this phase:** bookmarking, intel search history, per-source filters, email-delivered PDFs, server-cached PDFs + share links, salt domain-prefix cleanup (Phase 1 carry-over), the in-memory→KV rate-limit migration (Phase 999.2). No changes to the existing `/audit` print-CSS path — the new PDF route reuses it verbatim.

</domain>

<decisions>
## Implementation Decisions

### Intel search v2 — INT-02

- **D-01:** Hybrid layout. **Top section: "best matches" — up to 5 cross-source ranked cards.** Per-source breakdown sections (sanctions / offshore / OLAF / articles / prosecution / NAP) sit below, each preserving the existing `LIMIT=10` from `app/intel/search/page.tsx`. If <5 cross-source hits exist, the top section shows whatever ranks; if 0, the section is hidden so the page jumps to per-source breakdown.

- **D-02:** **Ranking signal = Postgres full-text search (tsvector) + recency weight.** Lexical relevance via `to_tsvector` / `plainto_tsquery` / `ts_rank` on the existing `name` / `title` / `summary` columns; recency boost via `EXTRACT(EPOCH FROM (now() - <date_col>))` decay. Concrete weight blend (e.g., `0.7 * ts_rank + 0.3 * recency_decay`) and per-source query keys are research/planner concerns. **Source-authority weighting is not in scope** — all 6 sources rank against the same blend.

- **D-03:** **Quote attribution is per-source-type.**
  - **Articles** (only source with a `summary` field): **AI-extracted 1–2 sentence quote** via a quick `claude-haiku-4-5` call. The single most-relevant sentence from `summary` for the query, in Bulgarian. Adds ~1 s; fits the <3 s budget.
  - **Sanctions / offshore / OLAF / prosecution / NAP**: **source row verbatim** — show the matched fields directly (entity name + sanctioning body, ICIJ jurisdiction, OLAF fraud_type+amount, etc.), reusing the field shapes already on each per-source page.

- **D-04:** **AI quote extraction uses `claude-haiku-4-5`** (NOT `claude-sonnet-4-6` like the rest of the AI surface). Rationale: extraction is a 1-sentence pick, not generation; Haiku is ~5× cheaper and ~3× faster, and the cost compounds (1 call per article in the top-5, plus per-page renders). Fits inside the <3 s success-criterion budget.

- **D-05:** The existing AI **summary** endpoint (`/api/intel/search` POST → markdown stream) **stays as the page-level summary card** — it's not replaced by the per-card AI quote extraction. Two distinct AI surfaces with different jobs:
  - Summary endpoint: page-top "what we found / observations / recommendation" markdown stream (existing).
  - Quote-extraction: per-card 1-sentence pick for the top-5 best-matches section (new).

- **D-06:** **Reuse `useRateLimitedFetch` from Phase 1** for any new client-side fetches against `/api/intel/search` or a new ranking/quote endpoint. The hook is already wired in `app/intel/search/intel-search-summary.tsx` (plan 01-02 migration); new fetches in the result-card UI follow the same pattern.

- **D-07:** **Reuse the Phase-1 structured-log pattern** (D-09/D-10 from `01-CONTEXT.md`) for any new observability events on the search path: single-line `console.log(JSON.stringify({event, route, ip_hash, retry_after, ts}))`, HMAC-SHA-256(ip, AUDIT_VOTE_SALT)→16 hex. No new salts, no log libraries. Specific event names (e.g., `intel_search_top5_extracted`) are planner-defined.

### Audit PDF download — PDF-01

- **D-08:** **Renderer = `puppeteer-core` + `@sparticuz/chromium`.** Reasoning: the existing `@media print` watermark + page CSS in `app/globals.css` is production-tested and renders the audit page correctly via Cmd+P today. Puppeteer renders that exact CSS path verbatim — zero re-implementation. `@sparticuz/chromium` is the Vercel-compatible chromium binary (forked from `chrome-aws-lambda`, ~50 MB compressed). React-pdf and external services (Browserless.io) are explicitly rejected: re-implementing the audit layout in `<Page>/<View>/<Text>` primitives is multi-day churn, and external services add a network hop + vendor lock-in.

- **D-09:** **The PDF route reuses the existing `/audit` page render path verbatim.** Puppeteer launches a headless chromium instance that navigates to the same URL the user would (relative to `NEXT_PUBLIC_SITE_URL`), waits for `networkidle0`, and `page.pdf({ format: 'A4', printBackground: true, margin: ... })`. The print-CSS watermark prints via `printBackground: true`. **No second render pipeline, no template duplication.**

- **D-10:** **Synchronous in-browser download under 10 s.** No background generation, no email-delivery, no server-cache-and-share-link. The route streams the PDF binary back with `Content-Disposition: attachment; filename="lex-brain-audit-<date>.pdf"`. The 10 s budget includes puppeteer cold-start (~2–3 s on a warm Vercel function, up to ~5 s cold) + page navigation + `page.pdf()` rendering for 352 findings.

- **D-11:** **Route shape: `/api/audit/pdf`** (not `/audit?format=pdf`, not `/audit/pdf` page). Rationale: it's a binary download, not a viewable page. App Router conventions: route handlers under `/api/*` for non-HTML responses. Query-param branching on the existing `/audit` route would mix HTML and PDF response shapes in one handler.

- **D-12:** **UI trigger: a single "Download as PDF" button on `/audit`,** placed near the top of the page (next to the existing reform-timeline visual or in the page header — exact placement is a UI choice for the planner). Click → `<a href="/api/audit/pdf" download>...</a>` (or `fetch + blob` if we need progress states); pure HTTP, no client-side PDF generation, no extra state.

- **D-13:** **Runtime config: `nodejs` runtime, `maxDuration: 60`.** Puppeteer can't run on Edge (V8-isolate runtime). 60 s ceiling gives 6× headroom over the 10 s success-criterion budget — covers cold-start + worst-case render. Memory: default Vercel function memory should be sufficient; planner verifies against `@sparticuz/chromium` minimum (~512 MB recommended).

</decisions>

<canonical_refs>
## Canonical References

Files downstream agents (researcher, planner, executor) MUST consult:

- `.planning/PROJECT.md` — project shape, AI surface conventions (`claude-sonnet-4-6` default, `runtime: "nodejs"` for streaming routes, Bulgarian-first prompts), Anthropic budget context
- `.planning/REQUIREMENTS.md` — INT-02 and PDF-01 acceptance text
- `.planning/ROADMAP.md` — Phase 2 success criteria (<3 s intel results, watermarked PDF, <10 s for 352 findings)
- `.planning/phases/01-reliability-observability/01-CONTEXT.md` — D-09/D-10 (structured log pattern), AUDIT_VOTE_SALT reuse pattern, `useRateLimitedFetch` hook contract (D-01 callers list, D-04 toast placement convention)
- `app/api/intel/search/route.ts` — existing Anthropic streaming summary endpoint; pattern for any new streaming AI calls (Haiku quote-extraction)
- `app/intel/search/page.tsx` — existing 6-source ILIKE fan-out + LIMIT=10 per source; the data-fetch shape Phase 2 ranks on top of
- `app/intel/search/intel-search-summary.tsx` — existing client streamer for the summary endpoint; current rate-limit-hook integration
- `app/audit/page.tsx` (326 lines) — existing audit list + reform timeline; the page puppeteer renders for the PDF
- `app/audit/finding/[id]/page.tsx` — per-finding detail page; in-scope for the PDF if a "full" report includes finding bodies (planner decides what the PDF actually contains)
- `app/globals.css` — `@media print` block with `LEX.BRAIN` SVG-tile watermark (DataURL background-image); the print-CSS path puppeteer renders verbatim
- `lib/use-rate-limited-fetch.ts` — Phase 1 hook for client 429 handling
- `lib/rate-limit.ts` — Phase 1 server-side rate limit + structured log emitter (`hashIp(ip)` helper)
- `lib/queries.ts` — `getAuditFindings` / `getAuditStats` already used by `/audit/page.tsx`; PDF route reuses these (puppeteer renders the page; no duplicate query path)
- `lib/supabase.ts` — anon-key client used by intel search page
- `package.json` — current devDeps (no PDF deps installed; planner adds `puppeteer-core` + `@sparticuz/chromium` to runtime deps, not dev deps)

</canonical_refs>

<code_context>
## Reusable Assets & Integration Points

**Intel search v2 builds on:**
- 6-source parallel `supabase.from(table).ilike(name|title, '%q%').limit(10)` shape in `app/intel/search/page.tsx:14–35`. Phase 2 swaps `ilike` for `textSearch('field', query, { type: 'plain' })` (Supabase tsvector helper) plus a join/sort by computed `ts_rank * weight + recency_decay * weight`.
- Per-source page renderers (`app/intel/sanctions/page.tsx`, `/offshore/page.tsx`, etc.) — the field display logic for source-row-verbatim quotes is already there. Reuse those components in card form, or extract a shared `<IntelCard variant="sanctioned" data={...} />`.
- Existing AI streaming pattern in `app/api/intel/search/route.ts:55–82` (Anthropic SDK + `ReadableStream` + `TextEncoder`) — Haiku quote extraction follows the same shape with a smaller system prompt.
- Phase 1's rate-limit-toast already wraps the search caller (`app/intel/search/intel-search-summary.tsx`) — no migration work for the new flow as long as new fetches go through `useRateLimitedFetch`.

**Audit PDF builds on:**
- Existing `@media print` block in `app/globals.css` — already production-tested (users do Cmd+P → Save as PDF today, watermark renders correctly). Puppeteer's `printBackground: true` triggers the same CSS path.
- `app/audit/page.tsx` is server-rendered with `revalidate: 60` — puppeteer hits the live URL; ISR cache means the same render the user sees is what gets PDF'd.
- No existing puppeteer/PDF infrastructure → planner adds `puppeteer-core` + `@sparticuz/chromium` to `dependencies` (not `devDependencies` — runtime use). Bun installs both.
- Vercel function constraints (`maxDuration`, runtime, memory) are a known pattern from existing routes like `/api/analyze/[slug]` (300 s, nodejs) — `/api/audit/pdf` follows the same shape with a tighter budget.

**Cross-stream:**
- AUDIT_VOTE_SALT is loaded at module level in `lib/rate-limit.ts` (Phase 1 D-09 contract). If Phase 2 needs HMAC anywhere (e.g., stable PDF filenames), reuse the same env var with a domain prefix in the input (`hmac.update("audit-pdf:" + ip)`). Not anticipated for Phase 2 but worth noting.

</code_context>

<open_questions>
## Open Questions for Research / Planner

These are not user decisions — they're technical investigations that research/planner must resolve before execution. Captured here so they aren't asked of the user in plan-phase.

1. **Are tsvector columns / GIN indexes already populated on the 6 intel tables?** The lex-brain scrapers may already write `tsvector` columns; if not, Phase 2 needs a Supabase migration as part of plan 02-01. Research: query `pg_indexes` and `information_schema.columns` against the live DB. If absent, the migration is in scope (one-time DB DDL).

2. **`@sparticuz/chromium` bundle size on Vercel.** The package is ~50 MB compressed. Vercel's serverless function limit is 50 MB compressed (250 MB unzipped). Research: confirm current Vercel plan limits, verify the chromium binary fits, and that no other dep is also pushing the bundle near the cap. If it doesn't fit: fallback to Browserless.io (rejected in D-08 — would require re-opening that decision).

3. **Puppeteer cold-start latency on Vercel `nodejs` runtime, in seconds.** D-13 budgets 60 s `maxDuration` and the success criterion is <10 s. If cold-start is consistently 8+ s, the warm-vs-cold variance breaks the budget. Research: measure on a Vercel preview deploy; if too slow, options are pre-warming (cron ping) or background-generation (would re-open D-10).

4. **How does puppeteer authenticate to `/audit` if it ever needs to?** Today `/audit` is anon-readable (no login). v2.3 introduces auth. For Phase 2 this is a non-issue, but document so future-Phase-4+ plans know puppeteer would need either a service-token cookie or a server-internal render path.

5. **What exactly goes in the PDF — page only, or page + per-finding details?** D-12 says the button is on `/audit`; the success criterion says "352-finding report". Decide whether the PDF is the listing page alone (~30 pages of cards) or includes each finding's detail page expanded (~200+ pages, much heavier). Research: look at `app/audit/page.tsx` rendered output at scale; planner picks scope.

6. **Recency-decay function shape.** D-02 says "tsvector + recency weight" but the curve isn't specified. Research: pick a canonical shape — e.g., `exp(-age_days / half_life_days)` with `half_life=730` for 2-year half-life, or linear decay to zero past 5 years. Same curve across all 6 sources (each has a `date` or equivalent column).

7. **Does the existing `/api/intel/search` summary endpoint stay reachable on the same path, or move?** D-05 keeps both surfaces. Decide whether the new ranking + Haiku-quote endpoint is `/api/intel/search` (reshape the existing route) or a sibling like `/api/intel/search/v2` or `/api/intel/results`. Affects the rate-limit key (`intel-search` route name in `rateLimited()`).

</open_questions>

<deferred>
## Deferred Ideas (out of scope for v2.2)

- **Bookmarking intel search results** — would need user identity; defer to v2.3 (auth milestone).
- **Search history / recent queries** — same constraint.
- **Per-source filter toggles** ("only show me sanctions") — UX enhancement, not a v2.2 requirement.
- **Source-authority weighting in ranking** — would need a curated weight table per source; defer until we see how plain tsvector + recency performs.
- **Email-delivered PDF** (Resend) — kept on the shelf in case the synchronous 10 s budget breaks during research. If D-10 can't hold, this is the first fallback.
- **Server-cached PDF + share link** — same shelf as email-delivery. Would also re-open the auth question.
- **AUDIT_VOTE_SALT domain-prefix cleanup** — Phase 1 carry-over; not a Phase 2 deliverable.
- **PDF for individual findings** (`/audit/finding/[id]?format=pdf`) — possible follow-up; out of scope here.
- **Client-side PDF generation** (jsPDF, html2pdf.js) — rejected: bundle bloat, no watermark fidelity, fails on long documents.

</deferred>

---

**Phase:** 02
**Slug:** new-ai-features
**Generated by:** /gsd-discuss-phase
**Next:** `/gsd-plan-phase 2`
