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
**Plans**: 2 plans

Plans:
- [ ] 01-01: Stream OpenSanctions CSV via `httpx.stream` + `io.TextIOWrapper` into `csv.DictReader`; add a memory-peak assertion in tests
- [ ] 01-02: Surface `Retry-After` from `lib/rate-limit.ts` 429 responses in the AI chat UI; add structured throttle log lines

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
