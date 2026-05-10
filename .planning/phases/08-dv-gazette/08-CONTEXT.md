# Phase 8: Държавен вестник (State Gazette) browser - Context

**Gathered:** 2026-05-10
**Status:** Ready for research/planning

<domain>
## Phase Boundary

Two cross-repo workstreams:

1. **DV-01 (lex-brain scraper)** — `scripts/laws/scrape_dv.py` (or sibling) scrapes `dv.parliament.bg/DVWeb/*` (Bulgarian State Gazette), a stateful JSF/Faces application. Backfills 2024 + 2025 + 2026-to-date issues into new Supabase tables `dv_issues` + `dv_acts`. ≥1.5 s polite delay (jittered), identifying User-Agent, resumable by `(year, issue_number)` and `idMat`, structured progress log.

2. **DV-02 (lex-web pages)** — new public-facing browser at `/dv` (issue listing, card grid) and `/dv/[issue]` (per-issue detail, grouped by act type). New nav entry "Държавен вестник" in `app/layout.tsx`. Per-act inline AI summary via new POST `/api/dv/summarize` (Sonnet 4.6 streaming markdown, cached write-back to `dv_acts.summary_ai`).

**Not in this phase:** cross-issue analytics dashboards; email alerts on new issues; full-text export; per-act discussion/annotations (no auth in v2.2); search by issuing body (Президент, КС, МС, etc.); multi-language UI; the future `/about` page where the scraper UA points (deferred). The existing legal corpus on `/laws` is unrelated — DV is a separate corpus of administrative acts published in the gazette.

</domain>

<decisions>
## Implementation Decisions

### DV-01 — Scraper (lex-brain)

- **D-01 — Backfill scope: all of 2024 + 2025 + 2026-to-date.** Year-boundary termination (scraper stops when `year < 2024` is reached). Roughly 105 + 105 + ~42 = ~250 issues × ~30–50 acts ≈ 7500–12500 acts on cold backfill. Subsequent runs are incremental: skip rows that already exist by `(issue_number, year)` for issues and `idMat` for acts.

- **D-02 — Polite delay: 1.5 s base + jittered ±500 ms.** Effective request cadence ~1–2 s, total cold-backfill wall time ~2–3 hours for ~5000 GETs. Jitter prevents request correlation that some rate-limiters trip on. On `429`: respect `Retry-After` header (sleep then retry once). On `503` / transport errors: exponential backoff 2 s → 4 s → 8 s, max 3 retries (mirror Phase 1's `fetch_with_retry_sync` semantics — D-12/D-13 from `01-CONTEXT.md`).

- **D-03 — Identifying User-Agent + missing-robots-txt policy.** UA exactly: `lex-brain-scraper/1.0 (+https://lex-web-eta.vercel.app; non-commercial public-interest project)`. Include a contact line in the project's future `/about` page (deferred — not Phase 8 scope, but the UA points at the URL we WILL host). Robots.txt at `dv.parliament.bg/robots.txt` returned 404 during research → treat as "no policy declared" rather than "forbidden". Re-check robots.txt at start of each scraper run; if it ever appears and disallows `/DVWeb/`, the scraper aborts with a clear error.

- **D-04 — Resumability granularity.** The scraper checks `dv_issues` and `dv_acts` for existing `(year, issue_number)` and `idMat` rows before fetching. **Skip if present.** Partial-act state (title saved, full_text empty) is detected by `dv_acts.full_text IS NULL OR length(full_text) = 0` and re-fetched. State is in the database, NOT in a separate JSON state file (Phase 1 D-15 precedent: keep state in the DB).

- **D-05 — JSF stateful scraping mechanics (research/planner refines).** The scraper must:
  - Maintain a `httpx.Client` with cookie jar + persistent connection pool
  - Extract `javax.faces.ViewState` from each response and replay it on POST-back navigation
  - Use a parser (BeautifulSoup or lxml) for HTML extraction (acts are inline HTML, no PDF parsing needed per research)
  - The `idMat` numeric ID is the per-act stable identifier (URL pattern `showMaterialDV.jsp?idMat=N`); `jsessionid` in URLs is session-bound and MUST NOT be persisted to `source_url` (strip before save).
  Concrete archive-walking strategy is a research deliverable.

- **D-06 — Schema additions (cross-cutting with DV-02).** User-supplied DDL is the starting point. Phase 8 adds three additions over the user-supplied schema:
  1. `dv_acts.search_vector tsvector GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(title,'')),'A') || setweight(to_tsvector('simple', coalesce(act_type,'')),'B') || setweight(to_tsvector('simple', coalesce(full_text,'')),'C')) STORED`
  2. `dv_issues.search_vector tsvector GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(title,'')),'A')) STORED`
  3. `dv_acts.summary_ai text` (nullable) + `dv_acts.summary_ai_generated_at timestamptz` (nullable) for AI-summary write-back caching
  4. Two GIN indexes (`dv_acts_fts ON dv_acts USING gin(search_vector)`, `dv_issues_fts ON dv_issues USING gin(search_vector)`)
  5. A ranking RPC `dv_search_top(q text, year int DEFAULT NULL, act_type text DEFAULT NULL, limit_n int DEFAULT 50) RETURNS TABLE(...)` mirroring Phase 2's `intel_search_top` shape with the same `0.7 * ts_rank + 0.3 * exp(-age_days / 365)` scoring formula.

- **D-07 — `simple` tsvector config (NOT `bulgarian`).** Postgres has no Bulgarian dictionary. Phase 2 used `simple` for the same reason on intel tables — keeps the FTS pattern consistent across the project. (Researcher confirms whether a community Bulgarian dictionary would change the call.)

### DV-02 — lex-web pages (UI)

- **D-08 — `/dv` listing layout: card grid (issue-as-card).** 2 columns on desktop (`md:grid-cols-2`), 1 on mobile. Each card shows issue # (large display), date, total act count, top-3 act-type pills (using a new `DV_ACT_PILL` map analogous to Phase 2's `SOURCE_PILL`). Click card → navigates to `/dv/[issue_number]?year=YYYY` (or canonical slug TBD by planner). Card primitive verbatim from Phase 2: `rounded-lg border border-stone-800 bg-stone-900/40 p-5`.

- **D-09 — `/dv/[issue]` detail layout: grouped-by-act-type sections.** Same shape as `/courts/page.tsx` — sections per `act_type` with heading + count + cards. Section order: Закони → Наредби → Постановления → Укази → Решения → Обявления → Other. Within a section, acts in the order they appeared in the original gazette.

- **D-10 — Source link policy: inline per-act `↗ Оригинал` link + footer attribution.** Each act card includes a small `↗` icon link to the original `dv.parliament.bg/DVWeb/showMaterialDV.jsp?idMat=N` URL (jsessionid stripped — D-05). Footer of every `/dv*` page credits "Източник: dv.parliament.bg" with the issuing parliament's wordmark for honest attribution.

- **D-11 — Filter dimensions (UI).** Four filters on `/dv` listing (chip/select hybrid):
  1. **`act_type`** — chip-style filter row (multi-select), one chip per type seen in the data
  2. **`year`** — drop-down (2024 / 2025 / 2026 / "all")
  3. **Date range** — `from` + `to` date pickers (inputs), defaults blank
  4. **Issue range** — two number inputs (`from issue` / `to issue`), defaults blank
  All filters are GET-query-string-based (matching `/intel/articles` precedent), so URLs are shareable. URL state is the source of truth.

- **D-12 — Search scope: cross-issue on `/dv`, scoped to one issue on `/dv/[issue]`.** Listing page calls `dv_search_top(q, year, act_type)` and ranks across all matching acts. Detail page does ILIKE within the one issue's acts (cheap; per-issue act count is bounded ~50). The ranked listing surfaces matching acts with their issue context (clickable to jump to `/dv/[issue]#act-{idMat}`).

- **D-13 — AI summary endpoint: POST `/api/dv/summarize` with `{ actId }` body, streams markdown, write-back cache.** Sonnet 4.6 (matches existing AI-streaming routes; see D-14). Rate-limit: `rateLimited(req, "dv-summarize", { windowMs: 60_000, max: 10 })` — stricter than 30/min for cheap Haiku because Sonnet calls are 5× more expensive. `signal: req.signal` forwarded to the Anthropic upstream stream (AI-07 preserved per Phase 1 + Phase 2 contract). The route logic:
  1. Look up the act in `dv_acts` by `id`
  2. If `summary_ai` is non-null, stream the cached value (faux-stream via `ReadableStream` enqueueing chunks of the cached markdown for client UX consistency; OR return `text/plain` with the cached body and a `X-Source: cache` header so client distinguishes — planner picks)
  3. If null: call Anthropic, stream the response back, AND write the full collected text to `dv_acts.summary_ai` + set `summary_ai_generated_at = now()` after streaming completes (write-back done in a `try/finally` so partial streams don't poison the cache; only complete responses cache).
- **D-14 — Sonnet 4.6 + full-text input.** Match existing AI-streaming convention (`/api/intel/search`, `/api/eu/summarize`, `/api/courts/summarize`). Citizen-friendly markdown explaining what the act does, who it affects, what changed. `system_prompt` written in Bulgarian (TBD by planner).

- **D-15 — AI summary trigger: inline button, expands inline within card.** Each act card on `/dv/[issue]` has a small "✦ AI обобщение" button (matching Phase 2's eyebrow `✦ AI обобщение` style on `intel-search-summary.tsx`). Click → expands the card to show the streaming summary below the title. Match Phase 2's `BestMatchQuote` streaming pattern: cursor pulse during stream → settles to full markdown when done; sr-only `aria-live="polite"` debounced to fire only on `status === 'done'` (Phase 2 D-04 / UI-SPEC convention).

### Cross-cutting (carry-forward from prior phases)

- **D-16 — Reuse Phase 1 hooks/helpers.** New client fetches use `useRateLimitedFetch` (lib/use-rate-limited-fetch.ts). New server endpoint emits the canonical structured throttle log via `lib/rate-limit.ts` (HMAC-SHA-256 ip_hash truncated 16 hex, `console.log(JSON.stringify({event, route, ip_hash, retry_after, ts}))`).

- **D-17 — Reuse Phase 2 visual language.** Card primitive, source-pill triplet pattern, streaming-cursor pattern, `aria-live` debouncing convention, `print:hidden` on action buttons. NO new design language.

- **D-18 — Nav placement.** Add `<Link href="/dv">Държавен вестник</Link>` to the existing nav block in `app/layout.tsx`. Position: after `/issues`, before `/compare` (alphabetically reasonable in BG context — "Държавен" begins with "Д"; existing nav is loose but groups "knowledge browsers" together: laws → courts → eu → issues → ↳ DV → compare → map). Planner picks exact placement.

- **D-19 — Threat model considerations.** New endpoint `/api/dv/summarize` is a rate-limited public AI surface (cost concern, T-DV-01 per the planner's STRIDE register). Scraper is a new public outbound dependency on `dv.parliament.bg` (T-DV-02 reliability + reputational). Schema change is additive, idempotent, non-destructive (T-DV-03 — same posture as Phase 2's intel_fts migration).

</decisions>

<canonical_refs>
## Canonical References

Files downstream agents (researcher, planner, executor) MUST consult:

- `.planning/PROJECT.md` — project shape, AI surface conventions (`claude-sonnet-4-6` default, `runtime: "nodejs"` for streaming routes, Bulgarian-first prompts), Anthropic budget context, lex-brain ↔ lex-web split
- `.planning/REQUIREMENTS.md` — DV-01 + DV-02 requirement text
- `.planning/ROADMAP.md` — Phase 8 success criteria (lines under "### Phase 8: Държавен вестник")
- `.planning/phases/01-reliability-observability/01-CONTEXT.md` — D-09/D-10 (structured log + HMAC ip_hash), AUDIT_VOTE_SALT reuse, useRateLimitedFetch hook contract (D-01..D-07 of Phase 1)
- `.planning/phases/02-new-ai-features/02-CONTEXT.md` — D-02 ranking signal (tsvector + recency decay 0.7/0.3/365), D-03/D-04 quote attribution + Haiku model precedent, D-13 runtime config, source-pill triplet pattern
- `.planning/phases/02-new-ai-features/02-RESEARCH.md` — tsvector + GIN migration shape (Pattern 1+2), `0.7 * ts_rank + 0.3 * exp(-age_days/365)` blend, Bulgarian Postgres FTS pitfalls
- `.planning/phases/02-new-ai-features/02-UI-SPEC.md` — design tokens (card primitive, 6 source-pill triplets — extend with 5–6 new act-type pills), aria-live debouncing convention, streaming-cursor pattern
- `.planning/phases/02-new-ai-features/02-PATTERNS.md` — closest-analog mapping discipline (apply same lens for Phase 8 components)
- `app/intel/articles/page.tsx` — closest analog for `/dv` listing (paginated, search form, BG header copy, dark stone theme)
- `app/courts/page.tsx` — closest analog for `/dv/[issue]` grouped-by-type sections
- `app/audit/page.tsx` — page-header + stats-row + filter-pills pattern (lines 76–110)
- `app/api/intel/search/route.ts` — canonical Anthropic streaming POST endpoint shape (`runtime: "nodejs"` + rateLimited + ReadableStream + signal: req.signal)
- `app/api/eu/summarize/[celex]/route.ts` — closest analog for "summarize this thing" endpoint (Sonnet 4.6 streaming)
- `app/api/courts/summarize/[court]/[id]/route.ts` — same; per-record summarize precedent
- `lib/use-rate-limited-fetch.ts` — Phase 1 client hook (`submit()` return shape)
- `lib/rate-limit.ts` — Phase 1 server gate + structured log (`hashIp(ip)` helper)
- `app/components/rate-limit-toast.tsx` — Bulgarian aria-live toast pattern
- `app/layout.tsx` — nav location for the new "Държавен вестник" link
- `lib/queries.ts` — existing data-fetch helpers (`getAuditFindings`, `listInvestigativeArticles`, etc.); add `listDvIssues`, `getDvIssue`, `listDvActs`, `searchDvActs` here
- `lib/supabase.ts` — anon-key client used by all read paths
- (lex-brain) `/Users/beyond/Desktop/lex-brain/scripts/_lib/http_retry.py` — Phase 1 sync + stream helpers; the DV scraper extends this pattern with cookie-jar + ViewState handling
- (lex-brain) `/Users/beyond/Desktop/lex-brain/db/intel_schema.sql` — schema-file convention if one exists; otherwise plan creates `db/dv_schema.sql` mirroring Phase 2's `db/intel_fts.sql`

</canonical_refs>

<code_context>
## Reusable Assets & Integration Points

**Scraper (lex-brain) builds on:**
- `scripts/_lib/http_retry.py` — Phase 1 sync + stream retry helpers. Phase 8 EXTENDS this pattern with: (a) cookie jar for `httpx.Client(cookies=...)` (b) ViewState extraction helper (BeautifulSoup or lxml) (c) the same backoff curve as `fetch_with_retry_sync`. **D-12 from Phase 1 applies: do NOT modify the existing helpers — append a new `fetch_dv_page(client, ...)` style helper or its own module under `scripts/laws/_dv/` to keep `_lib/http_retry.py` byte-identical.**
- Resume-via-DB pattern: `dv_acts.full_text IS NULL` query at scraper start lists incomplete rows (or 0 if a fresh scrape).
- `psutil` (Phase 1 Wave 0 install) is available if memory profiling becomes needed; not anticipated for this scraper since act bodies are tiny (~500 chars typical).

**lex-web pages build on:**
- `app/intel/articles/page.tsx:1–60` — paginated listing with GET-query-string filters; lift the search form + page-state pattern verbatim. Replace data fetcher with `listDvIssues`.
- `app/courts/page.tsx:1–40` — multi-section per-court layout; lift the section-per-act-type pattern. Each section's color comes from a new `DV_ACT_PILL` map (5–6 entries; rotate Phase 2's pill triplets or pick fresh — UI researcher decides during ui-phase if invoked).
- `app/audit/page.tsx:76–110` — page-header + stats row + filter pills with `print:hidden`. Lift wholesale for `/dv/[issue]`.
- `app/api/intel/search/route.ts:55–82` — Anthropic streaming `ReadableStream` + `TextEncoder` + `client.messages.stream({...}, { signal: req.signal })` + `cs.on("text", ...)`. New `/api/dv/summarize` follows this shape verbatim with model + system prompt + actId-keyed lookup added.
- `app/api/audit/vote/route.ts` (if exists) — namespace POST handler convention under `/api/audit/`. The new `/api/dv/summarize` follows the same `/api/dv/...` namespace pattern.
- `app/intel/search/intel-search-summary.tsx` (Phase 1 client streamer) — pattern for the inline AI-summary expansion: `useRateLimitedFetch` + `TextDecoder` reader + idle/streaming/done/error state machine. After Phase 2 merges, `app/intel/search/best-match-quote.tsx` is the closer analog (per-card streaming with aria-live debouncing).

**Schema (cross-repo):**
- `db/intel_fts.sql` (Phase 2) is the migration template — mirror its structure for `db/dv_schema.sql` (or merge into a single `db/dv_fts.sql`): comment header, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS search_vector ... GENERATED ALWAYS AS ... STORED`, `CREATE INDEX IF NOT EXISTS ... USING gin(search_vector)`, `CREATE OR REPLACE FUNCTION dv_search_top(q text, year int, act_type text)`. Idempotent.
- `scripts/apply-intel-fts.ts` (Phase 2) is the applier template — mirror for `scripts/apply-dv-schema.ts` if needed. Or fold the DV schema into a single migration file applied via the same `bun run db:intel-fts`-style script (planner's call).

**Carry-forward from Phase 1 + 2 (locked):**
- `useRateLimitedFetch` for the inline summary button's fetch
- `RateLimitToast` for 429 handling
- `lib/rate-limit.ts` `rateLimited(req, "dv-summarize", { windowMs: 60_000, max: 10 })` server gate
- `hashIp(ip)` HMAC for any new structured logs
- `AUDIT_VOTE_SALT` reused (no new salts; domain prefix in the input if needed: `hashIp("dv-summarize:" + ip)`)

</code_context>

<open_questions>
## Open Questions for Research / Planner

These are not user decisions — they're technical investigations the researcher must resolve before planning.

1. **Archive-walking strategy on dv.parliament.bg.** The site has no discoverable RSS / API / sitemap; `/DVWeb/searchSection.faces`, `/DVWeb/broeve.faces`, `/DVWeb/showIssue.faces` all 404. The research found `showMaterialDV.jsp?idMat=<numeric>` as the per-act stable URL but **no working URL pattern for "list all issues in year N"**. The researcher must:
   - Walk the front-page nav to find the actual archive entry point
   - Document the JSF POST-back form fields (action URL, `javax.faces.ViewState` token shape, command-link source IDs like `j_id_jsp_xxxx_yy`) needed to navigate the archive
   - Determine: does each issue have a stable `idBroi` (or similar) parameter? Or is access ONLY via stateful POST-back?
   - If POST-only, document the exact ViewState replay sequence the scraper must perform.

2. **idMat enumeration per issue.** Once on an issue's table-of-contents, how does the scraper extract all `idMat` values for acts in that issue? Inline anchor hrefs? POST-back to a tab control? Document the exact selector(s).

3. **Act-type extraction.** Is `act_type` (закон / наредба / указ / etc.) available as a category attribute on the issue's table of contents, or must the scraper infer it from the act title's prefix word? Document the canonical source.

4. **Supplementary issues (приложение).** Bulgarian gazettes occasionally publish supplementary issues with the same issue number + a suffix. How does dv.parliament.bg handle these? Schema impact: do we need an `issue_suffix` column, or fold into `issue_number` as decimal?

5. **`simple` vs Bulgarian Postgres FTS dictionary.** Phase 2 used `simple` for intel tables. Is there a community-maintained Bulgarian dictionary on Supabase that would meaningfully improve recall for legal text? If yes, document the install path. If no (likely), confirm `simple` is the stable choice.

6. **AI summary cache: write-during-stream OR write-after-complete?** D-13 says write only on complete responses. Confirm: how does the route handler know the stream completed cleanly vs aborted? `try/finally` on the for-await-of? The cache must NOT poison from partial responses.

7. **Sonnet vs Haiku 4.5 cost projection.** Estimate the 12-month Anthropic cost for Sonnet @ ~$0.10/act × 12500 cold backfill acts (one summary per act, written once via cache) + steady-state usage. If above an unacceptable threshold, fall back to D-14 alternative: Haiku for short administrative acts (<1500 chars), Sonnet for substantive regulations. Researcher provides the math; planner decides.

8. **`/dv/[issue]` URL canonicalization.** With `(year, issue_number)` being the natural key, candidates: `/dv/2026-42` (year-issue slug), `/dv/42?year=2026` (query-param disambiguation), `/dv/2026/42` (nested route). Planner picks; document Open Graph + sitemap implications.

9. **JSF `jsessionid` session lifetime.** How long does a session last? Does the scraper need to renew between long pauses? Researcher determines; impacts whether the scraper can run for hours or must re-establish session periodically.

10. **lex-brain repo location for the scraper.** User said `~/Desktop/lex-brain/scrapers/laws/scrape_dv.py` but the repo's existing pattern is `scripts/scrape_*.py` (e.g., `scripts/scrape_opensanctions.py`). Confirm the correct directory; reconcile if a new `scrapers/` tree is being introduced.

</open_questions>

<deferred>
## Deferred Ideas (out of scope for v2.2 Phase 8)

- **Cross-issue analytics / dashboards** (frequency of act types by year, by issuing body, top legislators) — separate phase, possibly in v2.4.
- **Email alerts on new issues / specific act types** — depends on auth (v2.3) and the existing alerts subscription infrastructure; revisit after v2.3.
- **Full-text export** (downloadable per issue or per query) — niche, not currently requested.
- **Multi-language UI** — corpus is BG; translation is a separate product (already in PROJECT.md "Out of Scope").
- **Per-act discussion / annotations** — needs auth + moderation, neither in v2.2.
- **Search by issuing body (Президент / КС / МС / etc.)** — possible v2.3 enhancement once tsvector indexes are in place; would add an `issuer` column to `dv_acts` and a new filter. Skip for now — `act_type` filter covers most discovery needs.
- **Linking dv_acts to /laws corpus** — if a `dv_act` modifies an existing law in the lex-brain `laws` table, link them. Cross-reference work belongs in a follow-up phase; the schema is forward-compatible (we can add `modifies_law_slug text[]` later).
- **Public scraper status page at `/dv/admin` or `/about/scrapers`** — see scrape progress, last-run timestamps, error counts. Useful for transparency; not v2.2 scope.
- **PDF export of selected acts** — Phase 2 just shipped the `/api/audit/pdf` puppeteer infrastructure; reusing for DV is plausible but not requested.

</deferred>

---

**Phase:** 08
**Slug:** dv-gazette
**Generated by:** /gsd-discuss-phase
**Next:** `/gsd-ui-phase 8` (recommended — UI is substantial: listing layout, detail layout, new pill colors, inline AI expansion) then `/gsd-plan-phase 8`
