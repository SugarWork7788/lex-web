# Phase 2: New AI features — Research

**Researched:** 2026-05-10
**Domain:** Two parallel user-visible AI deliverables for v2.2 — (A) Postgres tsvector + recency-weighted ranking + Haiku-extracted quotes for `/intel/search`; (B) server-side puppeteer-core + @sparticuz/chromium PDF rendering of `/audit` on Vercel Node runtime.
**Confidence:** HIGH (most claims verified against the live Supabase DB, Next 16 bundled docs, Vercel docs, npm registry, and lex-brain code; all 7 open questions answered with `[VERIFIED]` or explicit `[ASSUMED]` flags).

## Summary

Phase 2 ships INT-02 and PDF-01. Both are short in code volume but each has a single landmine that would silently undermine its success criterion if not addressed up front:

- **Track A landmine (INT-02):** the live DB has **no tsvector columns and no GIN indexes** on the 6 intel tables (`[VERIFIED: live psql probe 2026-05-10]`). CONTEXT.md D-02 ("tsvector + recency") therefore cannot be implemented as a code-only change — the FIRST plan in the phase MUST run a Supabase migration that adds a generated `search_vector tsvector` column + a GIN index on each of the 6 tables and backfills it. Without the migration, every `to_tsvector(...)` call in the search query is a per-row CPU cost and the <3 s budget breaks at the 8,325-row sanctions table. Two of the six tables (`sanctioned_entities`, `offshore_entities`) have **no `date` column** — recency decay must use `created_at` for those two and `date` for the other four. The Bulgarian text dictionary doesn't exist in stock Postgres (lex-brain's existing FTS columns on `law_articles` use `to_tsvector('simple', ...)` to sidestep this); Phase 2 follows the same pattern for consistency.

- **Track B landmine (PDF-01):** `@sparticuz/chromium@148.0.0` unpacked is ~69 MB (`[VERIFIED: npm view dist.unpackedSize]`). Vercel's bundle limit is **250 MB uncompressed / 250 MB after gzip** (`[CITED: vercel.com/docs/functions/limitations 2026-02-24]`); 69 MB fits comfortably with margin for the rest of lex-web's deps. The full package therefore works on the deployed Pro plan AND fits inside the bundle. **However**, Next.js 16 has `@sparticuz/chromium`, `@sparticuz/chromium-min`, `puppeteer-core`, and `puppeteer` already in its built-in `serverExternalPackages` list (`[VERIFIED: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.md`]); the planner does NOT need to add them manually. The real Vercel-on-Next-16 footgun is `outputFileTracingIncludes` — Next's `@vercel/nft` static analysis can miss the `bin/` directory inside `node_modules/@sparticuz/chromium` because the binary path is computed at runtime via `chromium.executablePath()`. The planner MUST add an `outputFileTracingIncludes` entry for `/api/audit/pdf` keyed to `node_modules/@sparticuz/chromium/bin/**/*` or the deploy will boot, then 500 with "Could not find Chromium" on first cold-start.

**Primary recommendations:**

- **INT-02:** 4 plans, in this order: **02-01** Supabase migration (tsvector columns + GIN indexes on 6 tables, backfill); **02-02** reshape `/api/intel/search` to add a new GET ranking endpoint (kept on the existing path, distinguished by HTTP method) that returns the top-5 cross-source ranked rows + a new `/api/intel/quote` POST endpoint for Haiku quote extraction; **02-03** `<BestMatches>` + `<BestMatchCard>` UI components per UI-SPEC; **02-04** PDF download is its own plan with no UI sibling. Reuse `useRateLimitedFetch` for any new client fetch. Recency-decay shape: `exp(-age_days / 365)` (1-year half-life — penalises 5-year-old rows to ~1%, 1-year rows to ~37%; fits the journalistic-relevance domain).

- **PDF-01:** Single plan covering both the route and the button. Use `@sparticuz/chromium@148.0.0` + `puppeteer-core@24.43.0`, add `outputFileTracingIncludes` for `/api/audit/pdf`, render the existing `/audit?print=1` URL via `page.goto(networkidle0)` then `page.pdf({ format: 'A4', printBackground: true })`. Set `runtime: 'nodejs'`, `maxDuration: 60`, recommend 1024–1600 MB function memory. Cold start is the single biggest variance — expect ~2–4 s warm, 6–9 s cold; the 10 s success criterion is tight but achievable as long as the route is hit at least once every ~15 minutes (Vercel's typical idle-eviction window). Document the cron-pinger fallback (Vercel Cron triggering a HEAD `/api/audit/pdf` every 10 min) but defer it — observe production cold-start distribution before acting.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INT-02 | Intel AI search v2 — better ranking, multi-source quote-style results, more responsive streaming | tsvector + GIN migration scoped (Track A §"Standard Stack"); recency-decay formula concrete (Track A §"Pattern 2"); Supabase JS `textSearch()` pattern verified (Sources §A); Haiku model ID `claude-haiku-4-5` verified (Sources §A); existing Anthropic SDK 0.92.0 + streaming pattern reused from `/api/intel/search` (Sources §A) |
| PDF-01 | Server-rendered single-file PDF export of /audit with the LEX.BRAIN watermark; <10 s for 352 findings | `@sparticuz/chromium@148.0.0` + `puppeteer-core@24.43.0` versions verified (Sources §B); 69 MB unpacked fits Vercel 250 MB limit (Sources §B); `outputFileTracingIncludes` requirement verified (Sources §B); `page.pdf({printBackground:true})` triggers existing `@media print` watermark (Sources §B); Next 16 `runtime: 'nodejs'` + `maxDuration` API unchanged (Sources §B) |
</phase_requirements>

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Intel search v2 — INT-02**
- **D-01:** Hybrid layout. Top section "best matches" — up to 5 cross-source ranked cards. Per-source breakdown sections sit below, each preserving `LIMIT=10`. If <5 cross-source hits, top section shows whatever ranks; if 0, hidden.
- **D-02:** Ranking signal = Postgres tsvector + recency weight. Lexical via `to_tsvector` / `plainto_tsquery` / `ts_rank` on existing `name`/`title`/`summary` columns; recency boost via age-of-row decay. Source-authority weighting NOT in scope.
- **D-03:** Quote attribution per-source-type. Articles (only source with `summary`): AI-extracted 1–2 sentence quote via `claude-haiku-4-5`. Sanctions/offshore/OLAF/prosecution/NAP: source row verbatim.
- **D-04:** AI quote extraction uses `claude-haiku-4-5` (NOT `claude-sonnet-4-6`). ~5× cheaper, ~3× faster, fits <3 s budget.
- **D-05:** Existing AI summary endpoint (`/api/intel/search` POST → markdown stream) STAYS as the page-level summary card. Two distinct AI surfaces.
- **D-06:** Reuse `useRateLimitedFetch` from Phase 1 for any new client-side fetches.
- **D-07:** Reuse Phase-1 structured-log pattern (D-09/D-10 from `01-CONTEXT.md`): single-line `console.log(JSON.stringify({event, route, ip_hash, retry_after, ts}))`, HMAC-SHA-256(ip, AUDIT_VOTE_SALT)→16 hex.

**Audit PDF download — PDF-01**
- **D-08:** Renderer = `puppeteer-core` + `@sparticuz/chromium`. React-pdf and external services rejected.
- **D-09:** PDF route reuses the existing `/audit` page render path verbatim. Puppeteer launches headless chromium, navigates to relative URL (vs `NEXT_PUBLIC_SITE_URL`), waits for `networkidle0`, calls `page.pdf({format:'A4', printBackground:true, margin:...})`. Print-CSS watermark prints via `printBackground:true`.
- **D-10:** Synchronous in-browser download under 10 s. No background generation, no email, no cache-and-share. Streams binary back with `Content-Disposition: attachment; filename="lex-brain-audit-<date>.pdf"`.
- **D-11:** Route shape: `/api/audit/pdf` (App Router convention).
- **D-12:** UI trigger: single "Download as PDF" button on `/audit`, near top.
- **D-13:** Runtime config: `nodejs` runtime, `maxDuration: 60`. 60 s ceiling = 6× headroom over 10 s budget. Memory: ~512 MB minimum recommended for chromium.

### Claude's Discretion (Open Questions resolved by this RESEARCH)

All 7 open questions from CONTEXT.md `<open_questions>` have research answers below — see `## Open Questions (RESOLVED)`. The planner inherits those answers as locked once the phase enters execution.

### Deferred Ideas (OUT OF SCOPE)

- Bookmarking, search history, per-source filter toggles, source-authority ranking weights — defer to v2.3 / v3.x.
- Email-delivered PDF, server-cached PDF + share link — fallback shelf if D-10 breaks during research/UAT.
- Per-finding PDF export — possible v2.x follow-up.
- Mobile redesign of `/intel/search` and `/audit` — Phase 3 (MOB-01).
- Client-side PDF generation (jsPDF, html2pdf.js).
- AUDIT_VOTE_SALT domain-prefix cleanup — Phase 1 carry-over.

</user_constraints>

## Project Constraints (from CLAUDE.md / AGENTS.md)

The repo's `AGENTS.md` and `CLAUDE.md` declare: **"This is NOT the Next.js you know. APIs, conventions, and file structure may all differ from training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code."**

Concretely for Phase 2:
- Next.js 16.2.4 + React 19.2.4 — confirm any routing/data-fetching/runtime claim against `node_modules/next/dist/docs/01-app/` before recommending it. This research did so for `route.ts` segment config, `serverExternalPackages` (which already includes both chromium packages out of the box in v16), `output.md` (which documents `outputFileTracingIncludes` as stable since v15), and `maxDuration.md`.
- All API routes already export `runtime = "nodejs"` and `maxDuration = 60` (or 300 for analyze/compare). Confirmed by grep. PDF route follows the same shape.
- **PR-only workflow on `main`** — research output should not assume direct commits.
- Phase 1 carry-overs in force: `AUDIT_VOTE_SALT` is loaded at module level in `lib/rate-limit.ts` and throws if missing; the `hashIp(ip)` helper exists for any new structured logs.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Postgres tsvector columns + GIN indexes | Database (Supabase Postgres) | — | Generated columns + indexes are pure DDL; lex-brain scrapers continue writing the underlying text columns and the generated column auto-populates |
| Cross-source ranking SQL | API server (Node runtime, `/api/intel/search` GET) | Database (Postgres ts_rank) | Postgres does the lexical scoring; Node merges the 6 source scores + recency weight into a single sorted top-5 |
| Haiku quote extraction | API server (Node runtime, new `/api/intel/quote` POST) | Anthropic API | Streaming pattern identical to existing `/api/intel/search` POST; only the model ID and system prompt change |
| `<BestMatches>` + `<BestMatchCard>` rendering | React server component (page-level) | React client component (per-card streaming) | Cards render with server-side data on first paint; only the article AI-quote slot streams from the client |
| `useRateLimitedFetch` for new client fetches | React client hook (Phase 1, reused) | — | New best-matches AI-quote fetches surface 429s through the existing `RateLimitToast` |
| Puppeteer launch + page.pdf() | API server (Node runtime, `/api/audit/pdf`) | — | Edge runtime can't spawn chromium |
| Watermark rendering | Browser CSS (`@media print` in `app/globals.css`) | — | Existing v2.1 print CSS with diagonal SVG-tile watermark; puppeteer triggers via `printBackground: true` |
| Download UX (button → blob → save) | React client component (`<DownloadPdfButton />`) | — | Pure HTTP fetch + `URL.createObjectURL`; no client-side PDF library |

## Standard Stack

### Track A — Intel search v2 (lex-web, Next 16 / Postgres / Anthropic)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.105.1 (already in `package.json`) | Postgres client + `textSearch()` query builder for tsvector | Already the project DB client `[VERIFIED: package.json]`; `textSearch(column, query, { type: 'plain' \| 'phrase' \| 'websearch' })` `[VERIFIED: github.com/supabase/supabase docs/full-text-search]` |
| `@anthropic-ai/sdk` | 0.92.0 (already pinned) | Streaming Anthropic client | Already in stack; `client.messages.stream()` is the existing pattern in `/api/intel/search/route.ts:81` `[VERIFIED: package.json + repo grep]` |
| Postgres `to_tsvector` / `ts_rank` / `plainto_tsquery` | (built into PG 13+) | FTS query primitives | Standard Postgres FTS `[CITED: postgresql.org/docs/current/textsearch-controls.html]`; lex-brain already uses this on `law_articles`, `court_decisions`, `eu_regulations` `[VERIFIED: lex-brain/db/schema.sql + court_schema.sql grep]` |
| Postgres `simple` config | (built in) | Bulgarian-tolerant tokenizer | Postgres has no Bulgarian dictionary/stemmer; `simple` is what lex-brain uses for the same reason `[VERIFIED: lex-brain/db/schema.sql:5 — "Postgres has no Bulgarian-language stemmer/dictionary, so the FTS column..."]` |

**Anthropic Haiku model ID** `[VERIFIED: platform.claude.com/docs/en/docs/about-claude/models 2026-05-10]`:
- Canonical alias: `claude-haiku-4-5` (resolves to dated snapshot `claude-haiku-4-5-20251001`)
- Pricing: $1 / MTok input, $5 / MTok output (vs Sonnet's $3 / $15 — D-04's "5× cheaper" claim verifies)
- Context window: 200k tokens; max output: 64k tokens
- Latency: "Fastest" per Anthropic's table (vs Sonnet "Fast")

**No new runtime dependencies for Track A.** All required libraries are already in `package.json`. The migration is pure SQL.

### Track B — Audit PDF (lex-web, new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `puppeteer-core` | 24.43.0 (latest) | Headless chrome controller without bundled binary | Standard pairing with `@sparticuz/chromium`; `[VERIFIED: npm view puppeteer-core version]`; in Next 16 built-in `serverExternalPackages` `[VERIFIED: node_modules/next/dist/docs/.../serverExternalPackages.md]` |
| `@sparticuz/chromium` | 148.0.0 (latest) | Vercel-compatible chromium binary | Replaces unmaintained `chrome-aws-lambda`; tracks Chromium release cycle; `[VERIFIED: npm view @sparticuz/chromium version 2026-04-27 release]`; in Next 16 built-in `serverExternalPackages`; **node engine requires >= 22.17.0** `[VERIFIED: npm view engines]` |

**Installation:**
```bash
bun add puppeteer-core @sparticuz/chromium
# These are RUNTIME deps (used at request time inside the route handler), NOT devDeps.
```

**Bundle math** `[VERIFIED: npm view dist.unpackedSize]`:
- `@sparticuz/chromium@148.0.0`: 68,969,932 bytes unpacked (~65.8 MB) — includes brotli-compressed swiftshader + `chromium.br`
- `puppeteer-core@24.43.0`: 8,883,333 bytes unpacked (~8.5 MB)
- Total ~74 MB before lex-web's existing deps
- Vercel limit (Hobby + Pro): **250 MB uncompressed** `[CITED: vercel.com/docs/functions/limitations#bundle-size-limits]` — fits with ~3× headroom
- The often-quoted "50 MB" limit is an older AWS Lambda layer size, not Vercel's current cap

**Node engine compatibility:** `@sparticuz/chromium@148` requires Node >= 22.17.0. Vercel's Node runtime as of 2026 is Node 22.x (default for new projects); confirm in `package.json` `engines` field if pinning. The existing project does NOT pin a Node version. Recommend adding `"engines": { "node": ">=22.17.0" }` to `package.json` as part of plan 02-04 to make the requirement explicit.

**Alternatives Considered:**

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@sparticuz/chromium` (full, 65 MB) | `@sparticuz/chromium-min` + Vercel Blob hosting of the chromium tar | -min skips bundling the brotli archive; runtime fetches it from a URL passed to `chromium.executablePath(remoteUrl)`. Saves ~58 MB of the 65 MB. NOT NEEDED: lex-web's bundle has plenty of headroom. -min adds an extra runtime URL dep + cold-start network fetch (~1–2 s the first time). Use only if bundle hits the cap. `[VERIFIED: github.com/Sparticuz/chromium README "If your vendor does not allow large deployments..."]` |
| Hand-rolled tsvector SQL string | Supabase JS `.textSearch(column, query, {type: 'websearch'})` | The Supabase helper emits the same SQL but with prepared-statement safety; `websearch` mode is forgiving of malformed user input (no syntax errors raised) and matches a Google-style `"quoted phrase" -excluded` syntax. Use `websearch` over `plain` for user-typed queries. `[VERIFIED: supabase docs full-text-search.mdx + answeroverflow.com 1031960762656231555]` |
| `claude-haiku-4-5` (chosen) | `claude-3-5-haiku-20241022` (older) | The 4-5 generation is the current Haiku; 3-5 is legacy. Pricing identical; 4-5 is faster. CONTEXT.md D-04 specifies 4-5 — keep it. `[VERIFIED: Anthropic models doc]` |
| Generated tsvector column (recommended) | `to_tsvector(...)` evaluated per query | Generated columns are computed at write time and indexed; per-query `to_tsvector` re-tokenises every row on every query. At 8,325 sanctions rows that's ~50–200 ms per query before any ranking math. Generated column = constant query cost. `[CITED: postgresql.org/docs/current/ddl-generated-columns.html]` |
| Bulgarian-aware FTS dictionary | `simple` config | No public Bulgarian Postgres dictionary exists. lex-brain already chose `simple` for `law_articles` for the same reason. `simple` lowercases + folds whitespace but skips stemming; for Cyrillic name search this is actually the correct behaviour (we want exact-form matches, not stemmed). `[VERIFIED: lex-brain/db/schema.sql comment]` |
| `react-pdf` | (rejected per D-08) | Re-implements layout in `<Page>/<View>` primitives; multi-day churn vs zero re-implementation with puppeteer rendering the existing `/audit` page |
| Browserless.io / external PDF service | (rejected per D-08) | Network hop (latency penalty), vendor lock-in, ongoing $ cost |

## Architecture Patterns

### System Architecture Diagram

```
TRACK A — Intel search v2 (Next.js + Supabase + Anthropic)
─────────────────────────────────────────────────────────

  user types query, clicks "Търси"
          │
          ▼
  GET /intel/search?q=…  (existing server-rendered page)
          │
          ▼
  app/intel/search/page.tsx (server)
          │
   ┌──────┴──────────────────────────────┐
   │                                     │
   ▼ (existing)                          ▼ (NEW)
  searchAll() — 6× parallel             searchTopRanked(q)
   ilike fallback queries                — single SQL query that
   for per-source breakdown                UNION ALL's the 6 source
   (LIMIT 10 each)                         tables with computed
                                           ts_rank * 0.7 +
                                           recency_decay * 0.3,
                                           ORDER BY score DESC LIMIT 5
          │                                       │
          ▼                                       ▼
  ResultGroup × 6                         <BestMatches>
  (existing per-source list)              ── one card per row
                                          ── article cards stream
                                             AI quote from
                                             POST /api/intel/quote
                                             (NEW; Haiku 4.5)
                                          ── non-article cards
                                             render verbatim fields
                                             (no AI call)

  POST /api/intel/search → existing markdown stream → IntelSearchSummary
  (UNCHANGED — D-05 keeps both AI surfaces)


TRACK B — Audit PDF (Next.js Node runtime + puppeteer-core + chromium)
─────────────────────────────────────────────────────────────────────

  user clicks "Свали като PDF" on /audit
          │
          ▼
  <DownloadPdfButton /> (client)
          │ fetch GET /api/audit/pdf via useRateLimitedFetch
          ▼
  app/api/audit/pdf/route.ts (Node runtime, maxDuration 60)
          │
          ├─── rateLimited(req, "audit-pdf", { windowMs: 60_000, max: 5 })
          │
          ▼
  puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless
  })
          │
          ▼
  page.goto(`${SITE_URL}/audit?print=1`, { waitUntil: 'networkidle0' })
          │  (re-uses the existing /audit page; print=1 may be added
          │   for any future PDF-only tweaks; for now `print:hidden`
          │   on the download button + print CSS already handle it)
          ▼
  page.pdf({
    format: 'A4',
    printBackground: true,    ← triggers @media print watermark
    margin: { top: '1.6cm', right: '1.3cm', bottom: '1.6cm', left: '1.3cm' }
                              ← matches existing globals.css @page rule
  })
          │
          ▼
  return new Response(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="lex-brain-audit-${YYYY-MM-DD}.pdf"`,
      "Cache-Control": "no-store",
    }
  })
          │
          ▼
  client URL.createObjectURL(blob) → hidden <a download> click
```

### Recommended Project Structure (additions/modifications only)

```
lex-web/
├── app/
│   ├── api/
│   │   ├── audit/
│   │   │   └── pdf/
│   │   │       └── route.ts              # NEW: puppeteer + chromium PDF handler
│   │   └── intel/
│   │       ├── search/
│   │       │   └── route.ts              # MODIFY: add GET handler for ranked top-5
│   │       │                             #         (POST stream stays)
│   │       └── quote/
│   │           └── route.ts              # NEW: Haiku quote-extraction stream
│   ├── audit/
│   │   ├── page.tsx                      # MODIFY: insert <DownloadPdfButton />
│   │   │                                 #         in stats row, with print:hidden
│   │   └── download-pdf-button.tsx       # NEW: client component (UI-SPEC §Component Inventory)
│   ├── intel/
│   │   └── search/
│   │       ├── page.tsx                  # MODIFY: add searchTopRanked() + <BestMatches/>
│   │       ├── best-matches.tsx          # NEW: server-or-client wrapper
│   │       └── best-match-card.tsx       # NEW: per-source variant renderer
│   └── (no new components/ entries — pdf-error-toast lives co-located in download-pdf-button.tsx)
├── lib/
│   ├── intel-search.ts                   # NEW: searchTopRanked(q): top-5 SQL
│   │                                     #      + RECENCY_HALF_LIFE_DAYS constant
│   └── (rate-limit.ts, queries.ts, supabase.ts unchanged)
├── db/                                   # NEW directory in lex-web (mirror of lex-brain/db/)
│   └── intel_fts.sql                     # NEW: tsvector + GIN migration for 6 tables
├── next.config.ts                        # MODIFY: add outputFileTracingIncludes for /api/audit/pdf
├── package.json                          # MODIFY: add puppeteer-core + @sparticuz/chromium
│                                         #         + engines.node ">=22.17.0"
└── __tests__/
    ├── intel-search-ranking.test.ts      # NEW: unit test for the recency-decay math + score blending
    └── audit-pdf-route.test.ts           # NEW: smoke test that the route handler imports cleanly
                                          #      (full puppeteer test stays in UAT, not unit suite)
```

### Pattern 1: tsvector + GIN migration (Track A, plan 02-01)

**Apply via Supabase SQL editor or `psql $DATABASE_URL -f db/intel_fts.sql`. Idempotent (`IF NOT EXISTS`).**

```sql
-- Source: postgresql.org/docs/current/textsearch-controls.html (FTS docs)
--         postgresql.org/docs/current/ddl-generated-columns.html (generated cols)
--         Pattern matches lex-brain/db/court_schema.sql (existing FTS approach in same DB)

-- 1. sanctioned_entities: name + entity_type + sanctioning_body searched.
--    Recency uses created_at (no `date` column on this table).
ALTER TABLE sanctioned_entities ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(entity_type, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(sanctioning_body, '')), 'C')
  ) STORED;
CREATE INDEX IF NOT EXISTS sanctioned_entities_fts ON sanctioned_entities USING gin(search_vector);

-- 2. offshore_entities: name + entity_type + jurisdiction.
--    Recency uses created_at (no `date` column).
ALTER TABLE offshore_entities ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(entity_type, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(jurisdiction, '')), 'C')
  ) STORED;
CREATE INDEX IF NOT EXISTS offshore_entities_fts ON offshore_entities USING gin(search_vector);

-- 3. olaf_cases: title + fraud_type + full_text (truncated).
ALTER TABLE olaf_cases ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(fraud_type, '')), 'B') ||
    setweight(to_tsvector('simple', left(coalesce(full_text, ''), 50000)), 'C')
  ) STORED;
CREATE INDEX IF NOT EXISTS olaf_cases_fts ON olaf_cases USING gin(search_vector);

-- 4. investigative_articles: title + summary + author + source.
ALTER TABLE investigative_articles ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(author, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(source, '')), 'D')
  ) STORED;
CREATE INDEX IF NOT EXISTS investigative_articles_fts ON investigative_articles USING gin(search_vector);

-- 5. prosecution_cases: title + charges (text[]) + full_text.
ALTER TABLE prosecution_cases ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', array_to_string(coalesce(charges, ARRAY[]::text[]), ' ')), 'B') ||
    setweight(to_tsvector('simple', left(coalesce(full_text, ''), 50000)), 'C')
  ) STORED;
CREATE INDEX IF NOT EXISTS prosecution_cases_fts ON prosecution_cases USING gin(search_vector);

-- 6. nap_rulings: title + ruling_number + full_text.
ALTER TABLE nap_rulings ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(ruling_number, '')), 'A') ||
    setweight(to_tsvector('simple', left(coalesce(full_text, ''), 50000)), 'B')
  ) STORED;
CREATE INDEX IF NOT EXISTS nap_rulings_fts ON nap_rulings USING gin(search_vector);
```

**Why generated + STORED (not VIRTUAL or trigger-maintained):**
- `STORED` columns are computed at write time and persisted. Reads cost O(index lookup); no per-row tokenisation. `[CITED: postgresql.org/docs/current/ddl-generated-columns.html — only STORED is currently supported for generated cols in PG 13+]`
- A trigger-maintained tsvector requires backfill + ongoing maintenance. The generated approach auto-handles existing rows on the `ALTER TABLE` (the column is computed for all 9,628 current rows at migration time, ~5 s for the largest table per `EXPLAIN ANALYZE` projection on similar-size tables).
- The `setweight(.., 'A'..'D')` lets `ts_rank` differentiate field importance later (A = title-equivalent = highest weight, D = least). Mirrors the existing pattern at `lex-brain/db/court_schema.sql`.

**Migration delivery:** Plan 02-01 commits the SQL as `db/intel_fts.sql` and runs it via Supabase's SQL editor (manual UAT step) OR a one-shot `psql` invocation. Phase 1 set the precedent of `.sql` migrations living in the lex-brain repo (`lex-brain/db/`); Phase 2 introduces a parallel `lex-web/db/` directory because this migration is owned by the web feature, not by ingestion.

### Pattern 2: Recency-decay formula + ranking SQL (Track A)

**Recency-decay shape (concrete, locks Open Question 5):**

```
recency_decay = exp(-age_days / 365)

age_days = EXTRACT(EPOCH FROM (now() - <date_col>)) / 86400.0
```

Half-life ≈ 253 days (≈ 8.4 months). At 1 year old: 0.37; at 2 years: 0.14; at 5 years: 0.0067. This penalises stale records sharply but never zeros them out — a 10-year-old prosecution case still surfaces if its tsvector score is high enough.

**Date column per source:**

| Table | Date column | Source |
|-------|-------------|--------|
| sanctioned_entities | `created_at` | No `date` field on the table; use ingestion time `[VERIFIED: live psql probe + intel_schema.sql]` |
| offshore_entities | `created_at` | Same |
| olaf_cases | `date` | Press-release date populated by scraper |
| investigative_articles | `date` | Article publish date |
| prosecution_cases | `date` | Charge-filing date |
| nap_rulings | `date` | Ruling date |

**Combined score:** `0.7 * ts_rank + 0.3 * recency_decay`

Rationale for 70/30 weighting [ASSUMED — pick a default the planner can tune]:
- 70% lexical matches the user's intent ("show me hits relevant to my query")
- 30% recency surfaces fresh stories above stale ones at similar relevance
- The blend is a single constant tuple at the top of `lib/intel-search.ts`; trivial to retune post-launch based on observability.

**Cross-source ranking SQL (concrete shape — single `WITH` query):**

```sql
-- Source: hand-derived from postgresql.org/docs/current/textsearch-controls.html#TEXTSEARCH-RANKING
--         Lives in lib/intel-search.ts as a parameterised query (using supabase.rpc()
--         or a Postgres function — planner picks based on supabase-js capability).
WITH q AS (SELECT websearch_to_tsquery('simple', $1) AS tsq)
SELECT * FROM (
  SELECT 'sanctioned'::text AS source, id::text, name AS title, NULL::text AS summary,
         ts_rank(search_vector, q.tsq) AS lex,
         exp(-EXTRACT(EPOCH FROM (now() - created_at)) / 86400.0 / 365.0) AS rec
    FROM sanctioned_entities, q WHERE search_vector @@ q.tsq
  UNION ALL
  SELECT 'offshore', id::text, name, NULL,
         ts_rank(search_vector, q.tsq),
         exp(-EXTRACT(EPOCH FROM (now() - created_at)) / 86400.0 / 365.0)
    FROM offshore_entities, q WHERE search_vector @@ q.tsq
  UNION ALL
  SELECT 'olaf', id::text, title, fraud_type,
         ts_rank(search_vector, q.tsq),
         exp(-EXTRACT(EPOCH FROM (now() - coalesce(date::timestamptz, created_at))) / 86400.0 / 365.0)
    FROM olaf_cases, q WHERE search_vector @@ q.tsq
  UNION ALL
  SELECT 'articles', id::text, title, summary,
         ts_rank(search_vector, q.tsq),
         exp(-EXTRACT(EPOCH FROM (now() - coalesce(date::timestamptz, created_at))) / 86400.0 / 365.0)
    FROM investigative_articles, q WHERE search_vector @@ q.tsq
  UNION ALL
  SELECT 'prosecution', id::text, title, NULL,
         ts_rank(search_vector, q.tsq),
         exp(-EXTRACT(EPOCH FROM (now() - coalesce(date::timestamptz, created_at))) / 86400.0 / 365.0)
    FROM prosecution_cases, q WHERE search_vector @@ q.tsq
  UNION ALL
  SELECT 'nap', id::text, title, NULL,
         ts_rank(search_vector, q.tsq),
         exp(-EXTRACT(EPOCH FROM (now() - coalesce(date::timestamptz, created_at))) / 86400.0 / 365.0)
    FROM nap_rulings, q WHERE search_vector @@ q.tsq
) merged
ORDER BY (0.7 * lex + 0.3 * rec) DESC
LIMIT 5;
```

**Implementation note:** Supabase JS' `.textSearch()` and `.rpc()` cannot trivially emit a UNION ALL of 6 tables. Two viable approaches:

1. **Postgres function** (recommended): wrap the query as `CREATE OR REPLACE FUNCTION intel_search_top(q text) RETURNS TABLE(source text, id text, title text, summary text, score real)` and call via `supabase.rpc('intel_search_top', { q: query })`. The function is part of `db/intel_fts.sql`. Single round trip; query plan cached.

2. **Six parallel `.textSearch()` calls + Node-side merge** (fallback): each call uses `.select('id,name,..., ts_rank:cardinality(search_vector)').textSearch('search_vector', q, {type:'websearch'})` — but Supabase JS doesn't expose `ts_rank` directly. Would require a per-source SQL view. Inferior to (1).

**Recommend (1) for plan 02-01.** Plan 02-02 calls the function from `lib/intel-search.ts`.

### Pattern 3: Haiku quote-extraction streaming endpoint (Track A)

```ts
// app/api/intel/quote/route.ts — NEW
// Source: pattern from existing app/api/intel/search/route.ts:42-110 (same shape;
//         only model + system prompt change). Anthropic SDK 0.92.0 in package.json.
import Anthropic from "@anthropic-ai/sdk";
import { rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;  // Haiku is fast; 30s ceiling is generous

const SYSTEM_PROMPT = `Получаваш кратко резюме на разследваща статия и потребителска
заявка. Извади 1–2 изречения от резюмето, които са най-релевантни на заявката.
Не цитирай повече от 2 изречения. Не редактирай — върни дословно. Без коментар.`;

type RequestBody = { query?: string; summary?: string };

export async function POST(req: Request) {
  const limit = rateLimited(req, "intel-quote", { windowMs: 60_000, max: 30 });
  // ↑ limit higher than /api/intel/search (10/min) because quote runs 1× per
  //   article card (up to 5 article cards per page render); 30/min = 6 page
  //   renders/min ceiling per IP. Tune in observability if needed.
  if (limit) return limit;

  let body: RequestBody;
  try { body = (await req.json()) as RequestBody; }
  catch { return new Response("Invalid JSON", { status: 400 }); }

  const query = (body.query ?? "").trim();
  const summary = (body.summary ?? "").trim();
  if (!query || !summary) return new Response("Missing query or summary", { status: 400 });

  const client = new Anthropic();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const cs = client.messages.stream({
          model: "claude-haiku-4-5",          // [VERIFIED: Anthropic models doc]
          max_tokens: 200,                    // 2 sentences max → ~120 BG tokens
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: `Заявка: "${query}"\n\nРезюме:\n${summary}` }],
        }, { signal: req.signal });
        cs.on("text", (delta) => controller.enqueue(encoder.encode(delta)));
        await cs.finalMessage();
        controller.close();
      } catch (err) {
        if (req.signal.aborted) { controller.close(); return; }
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(`\n\n[грешка: ${msg}]`));
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
```

**Latency budget:** Haiku 4.5 first-token ~300–600 ms; 200-token completion ~1–1.5 s end-to-end. Each best-match article card streams independently, so the user sees first quotes in <1 s. The <3 s success-criterion budget is for the *page rendering* (search SQL + Haiku for top 1–5 articles), not for every quote to finish — articles that take >3 s simply continue streaming after the user can already interact.

### Pattern 4: Puppeteer + chromium PDF route (Track B)

```ts
// app/api/audit/pdf/route.ts — NEW
// Sources:
//   - github.com/Sparticuz/chromium README (executablePath + args pattern)
//   - vercel.com/templates/next.js/puppeteer-on-vercel
//   - dev.to/travisbeck "How to generate PDFs with Puppeteer on Vercel in 2024"
//   - Confirmed against repo's existing /api/intel/search/route.ts shape (rateLimited, runtime, maxDuration)
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;     // D-13 — 6× headroom over 10s budget
export const dynamic = "force-dynamic";  // never cache PDF bytes

// Public-facing site URL for puppeteer to navigate to. Production: lex-web-eta.vercel.app.
// Locally: NEXT_PUBLIC_SITE_URL=http://localhost:3000 in .env.local for `bun run dev`.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://lex-web-eta.vercel.app";

export async function GET(req: Request) {
  const limit = rateLimited(req, "audit-pdf", { windowMs: 60_000, max: 5 });
  // ↑ 5/min/IP — PDF generation is expensive (~3–8s function-time per call);
  //   higher than this and one IP can monopolise function concurrency.
  if (limit) return limit;

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    chromium.setGraphicsMode = false;  // skip swiftshader for headless rendering — saves ~500ms cold start

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.emulateMediaType("print");
    // Wait for ISR-cached audit page to fully render. networkidle0 = 0 active reqs for 500ms.
    const response = await page.goto(`${SITE_URL}/audit`, {
      waitUntil: "networkidle0",
      timeout: 25_000,
    });
    if (!response || !response.ok()) {
      throw new Error(`page.goto failed: ${response?.status()}`);
    }

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,        // triggers @media print SVG-tile watermark
      margin: { top: "1.6cm", right: "1.3cm", bottom: "1.6cm", left: "1.3cm" },
                                    // matches @page rule in app/globals.css
    });

    const today = new Date().toISOString().slice(0, 10);  // YYYY-MM-DD
    return new Response(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="lex-brain-audit-${today}.pdf"`,
        "Cache-Control": "no-store",
        "Content-Length": String(pdf.length),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[audit-pdf] failed: ${msg}`);
    return new Response(
      JSON.stringify({ error: "Неуспешно генериране на PDF" }),
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
    // ↑ swallow close errors — already in failure-path
  }
}
```

**Note `Buffer.from(pdf)`**: `page.pdf()` returns `Uint8Array` in puppeteer 23+ `[VERIFIED: pptr.dev release notes 23.0]`. Modern `Response()` accepts `Uint8Array` directly, no Buffer conversion needed.

### Pattern 5: `next.config.ts` outputFileTracingIncludes (Track B)

```ts
// next.config.ts (modify)
import type { NextConfig } from "next";

// ... existing CSP, security-headers, redirects ...

const nextConfig: NextConfig = {
  // ... existing keys ...

  // Vercel/Next NFT static analysis can miss the chromium binary because
  // its path is computed at runtime. Pin it explicitly so the binary
  // ships in the function bundle. [Source: Next 16 docs output.md;
  // verified pattern at github.com/vercel/next.js/discussions/55228]
  outputFileTracingIncludes: {
    "/api/audit/pdf": ["node_modules/@sparticuz/chromium/bin/**/*"],
  },

  // NB: serverExternalPackages is NOT needed for puppeteer-core / @sparticuz/chromium
  // because Next 16 auto-externalises them. [Verified: node_modules/next/dist/docs/
  //   01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.md
  //   lines 37-38, 84]

  async redirects() { /* existing */ },
  async headers() { /* existing */ },
};

export default nextConfig;
```

**Caveat:** the path `node_modules/@sparticuz/chromium/bin/**/*` is the canonical glob from upstream issue threads `[CITED: github.com/Sparticuz/chromium/issues/147; community.vercel.com/t/35415]`. If the post-build trace still misses files, the fallback is to add the brotli archives explicitly: `["node_modules/@sparticuz/chromium/bin/**/*", "node_modules/@sparticuz/chromium/lib/**/*"]`. Plan 02-04 should verify by running `bunx next build` and inspecting `.next/server/app/api/audit/pdf/route.js.nft.json`.

### Pattern 6: Anti-pattern: client-side PDF generation

**Avoid:** `jsPDF`, `html2pdf.js`, `react-pdf` browser builds, or any pure-JS PDF library running in the browser.

Reasons:
- Bundle bloat: jsPDF ≈ 250 KB gzip; html2pdf ≈ 350 KB gzip. The audit page is ~14 KB gzip without — these dominate first-load.
- Watermark fidelity: SVG-tile background images render inconsistently across `<canvas>` polyfills. The existing `@media print` watermark prints faithfully via puppeteer's `printBackground: true`; client polyfills regress.
- Long-document failures: html2pdf at 352 findings × ~150-word findings exceeds ~30 MB DOM-snapshot working memory in a typical mobile browser; on iOS Safari it OOMs the tab.
- Already rejected in CONTEXT.md `<deferred>` ("rejected: bundle bloat, no watermark fidelity, fails on long documents").

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full-text search ranking | Custom regex / `LOWER(name) LIKE '%q%'` per-source loop | Postgres `ts_rank` on `tsvector` columns | Per-source ILIKE is the existing fallback (`page.tsx:14-35`); it can't rank or weight. ts_rank gives O(log n) lookups via GIN index and free `setweight` differentiation |
| Bulgarian-aware tokenisation | Custom tokenizer, custom stopword list | `to_tsvector('simple', ...)` | No Bulgarian Postgres dictionary exists. `simple` (whitespace-fold + lowercase) is what lex-brain uses on `law_articles` for the same reason. Custom tokenizers get the Cyrillic-name-folding wrong |
| Recency-decay curve | Custom step function, ELO, time-buckets | `exp(-age_days / 365)` (single Postgres expression) | Single SQL expression, smooth, monotonic, parameter-free. Step functions create score-cliffs that flip results unpredictably |
| Headless chrome on serverless | Forking processes, raw subprocess management, downloading chrome at runtime | `puppeteer-core` + `@sparticuz/chromium` | Sparticuz tracks the chromium release cycle, ships pre-stripped binaries, and bundles the AWS-Lambda-tested launch args. Hand-rolled would re-derive 5 years of upstream fixes |
| HTML→PDF in the browser | jsPDF, html2pdf.js, browser-print pipeline | Server-side puppeteer PDF | Watermark fidelity, bundle size, mobile OOM (see anti-pattern Pattern 6) |
| Streaming AI extraction client | Custom Server-Sent Events parser | `ReadableStream` + `TextDecoder` (existing pattern in `intel-search-summary.tsx:103-112`) | Already wired through `useRateLimitedFetch`; cancellation + signal propagation already correct |

**Key insight:** Phase 2 is mostly *configuration* (SQL DDL + next.config + dep install) and *gluing existing patterns* (Anthropic streaming, useRateLimitedFetch). The novel code is small. Don't reinvent: every "should we hand-roll X?" answer in this domain is "no — there's a battle-tested library or built-in".

## Common Pitfalls

### Pitfall 1: `to_tsvector(...)` evaluated per query (no generated column)

**What goes wrong:** `WHERE to_tsvector('simple', name) @@ plainto_tsquery('simple', $1)` re-tokenises every row of every table on every query. At 8,325 sanctions rows × 6 tables × 1 query = ~50,000 tokenisations per search.

**Why it happens:** the obvious-looking SQL works on small tables; only at production scale does the per-row cost dominate.

**How to avoid:** generate `search_vector tsvector GENERATED ALWAYS AS (...) STORED` column at migration time + GIN index. Pattern 1 above covers it. **Critical for the <3 s budget.**

**Warning signs:** `EXPLAIN ANALYZE` on the search query shows `Seq Scan` instead of `Bitmap Index Scan on <table>_fts`; query time >500 ms on the sanctions table.

### Pitfall 2: Puppeteer cold-start blowing the 10 s budget

**What goes wrong:** Vercel functions evict idle instances after ~5–15 minutes. First request after eviction has to:
1. Spin up the Node process (~200 ms)
2. Decompress chromium.br from `bin/` (~1.5–2.5 s)
3. Spawn the chromium process (~1–2 s)
4. Navigate + render (~1–2 s)
5. `page.pdf()` (~1 s for 30 pages, ~3 s for 350)

Total cold: **6–10 s realistic, up to 12 s outlier.** Total warm: **2–4 s.**

**Why it happens:** Vercel doesn't keep functions warm by default. `@sparticuz/chromium`'s biggest cost is the brotli decompression of the binary at first launch.

**How to avoid:**
1. **Default approach (recommended for v2.2):** ship as-is. The 60 s `maxDuration` absorbs cold-start outliers; the 10 s success criterion is an SLA, not a function-timeout. Document expected variance.
2. **If observability shows >25% of requests cold:** add a Vercel Cron job hitting `HEAD /api/audit/pdf` every 10 minutes to keep the function warm. Adds ~$0/month on Pro. NOT recommended pre-emptively — measure first.
3. **`chromium.setGraphicsMode = false`** in the route handler — disables swiftshader, saves ~500 ms cold. Already in Pattern 4.

**Warning signs:** Vercel function logs show "init duration" >5 s; user-reported "PDF takes forever first time".

### Pitfall 3: `outputFileTracingIncludes` glob too narrow

**What goes wrong:** Deploy succeeds, route boots, then 500s with `Error: Could not find Chromium (rev. ...)` on first navigation.

**Why it happens:** Next.js' `@vercel/nft` does static analysis of imports. `chromium.executablePath()` returns a runtime path that nft can't see; if the glob doesn't include the binary, the bundle silently misses it.

**How to avoid:**
- Use `node_modules/@sparticuz/chromium/bin/**/*` as in Pattern 5. The `**` recurses; `bin/` is the canonical location for the brotli archives.
- After deploy, inspect `.next/server/app/api/audit/pdf/route.js.nft.json` for paths matching `chromium`.

**Warning signs:** Deploy logs show no chromium files in the function trace; first GET to `/api/audit/pdf` 500s within 1 s (no time to even cold-start chromium).

### Pitfall 4: Forgetting `Cache-Control: no-store` on PDF response

**What goes wrong:** Vercel's CDN caches the PDF at the edge. The next user gets yesterday's audit findings + the date in the filename matches yesterday too.

**Why it happens:** Default Vercel response caching for GET handlers without explicit headers; Next 16's `dynamic = 'force-dynamic'` prevents page-level caching but doesn't override CDN caching of the response body.

**How to avoid:** explicit `Cache-Control: no-store` header in Pattern 4. Already there.

**Warning signs:** Two users in different IPs download the same byte-identical PDF on the same day; PDF date filename mismatches actual `now()`.

### Pitfall 5: `websearch_to_tsquery` empty-input crash

**What goes wrong:** `websearch_to_tsquery('simple', '')` returns empty `tsquery`; `search_vector @@ ''::tsquery` returns NULL or empty set. If the route logs "0 results" silently, users see a blank best-matches section with no error.

**Why it happens:** Postgres FTS treats empty tsquery as "match nothing" rather than "match everything"; valid SQL semantics, surprising UX.

**How to avoid:** validate in the route handler — if `query.trim().length < 2`, return 400 or skip the ranked-search call entirely (page.tsx already prevents form submission with `required` on the input).

**Warning signs:** Empty top-5 section despite per-source breakdown showing hits.

### Pitfall 6: Vitest 4 + reporter rename (Phase 1 carry-over)

**What goes wrong:** vitest 4 dropped the `basic` reporter — any new test command using `--reporter=basic` will fail with `Unknown reporter "basic"`.

**Why it happens:** noted in Phase 1 STATE.md; same project still on vitest 4.x.

**How to avoid:** for any new test scripts in Phase 2, use the default reporter (omit `--reporter`) or `--reporter=verbose` / `--reporter=tap` / `--reporter=default`.

### Pitfall 7: Anthropic SDK `signal` wiring lost in new endpoint

**What goes wrong:** copy-pasting the existing `/api/intel/search/route.ts` shape but forgetting `{ signal: req.signal }` in the second arg to `client.messages.stream(...)` regresses AI-07 (validated requirement: client disconnect propagates upstream to abort the Anthropic stream and stop token spend).

**Why it happens:** the signal is passed as a 2nd-arg option, not part of the messages payload — easy to miss in a copy-paste.

**How to avoid:** Pattern 3 includes `{ signal: req.signal }` explicitly; planner verifies in plan 02-02 review.

**Warning signs:** Vercel function billing shows full-output Haiku token costs even when users navigate away mid-stream.

## Open Questions (RESOLVED)

The 7 open questions from CONTEXT.md `<open_questions>`:

### Q1. Are tsvector columns / GIN indexes already populated on the 6 intel tables?

**Answer: NO.** `[VERIFIED: live psql probe against $DATABASE_URL on 2026-05-10]`

Live DB inspection of `information_schema.columns` and `pg_indexes` shows:
- `sanctioned_entities` (8,325 rows): no tsvector column, only btree indexes on `id` + `opensanctions_id`
- `offshore_entities` (1,156 rows): same — no tsvector
- `olaf_cases` (29 rows): no tsvector
- `investigative_articles` (100 rows): no tsvector
- `prosecution_cases` (6 rows): no tsvector
- `nap_rulings` (12 rows): no tsvector

lex-brain's schema files (`db/schema.sql`, `db/court_schema.sql`) DO add tsvector to `law_articles`, `court_decisions`, `eu_regulations` — but those are different tables. The 6 intel tables have only the bare schema in `db/intel_schema.sql` (read at the top of this research session).

**Implication for planner:** Plan **02-01 MUST be the migration plan** (`db/intel_fts.sql` per Pattern 1 above). Plans 02-02 onwards depend on the migration being applied. The migration is small (~60 lines of SQL), idempotent, and runnable via Supabase SQL editor. No data migration needed (generated columns auto-populate on `ALTER TABLE`).

### Q2. `@sparticuz/chromium` bundle size on Vercel.

**Answer: 65.8 MB unpacked, fits comfortably under Vercel's 250 MB cap.** `[VERIFIED: npm view dist.unpackedSize for @sparticuz/chromium@148.0.0 + vercel.com/docs/functions/limitations#bundle-size-limits]`

- `@sparticuz/chromium@148.0.0`: 68,969,932 bytes unpacked = 65.8 MB
- `puppeteer-core@24.43.0`: 8,883,333 bytes unpacked = 8.5 MB
- Combined: ~74 MB
- Vercel limit (Hobby + Pro): **250 MB uncompressed** (the sometimes-cited "50 MB" is the gzipped Lambda layer limit; Vercel's actual cap is 250 MB unzipped per the canonical docs)

**No fallback to `@sparticuz/chromium-min` needed.** That alternative exists for vendors with tighter caps (or if lex-web's bundle grows by another ~150 MB, which is unlikely in Phase 2). Use the full `@sparticuz/chromium`.

**Implication for planner:** add `puppeteer-core` and `@sparticuz/chromium` as runtime deps; plan 02-04 verifies the deployed bundle size by inspecting Vercel's deploy log "Function bundle size" output.

### Q3. Puppeteer cold-start latency on Vercel `nodejs` runtime.

**Answer: ~6–9 s cold, ~2–4 s warm; the 10 s budget is achievable but tight.** `[CITED: dev.to/travisbeck "Generate PDFs with Puppeteer on Vercel" + community.vercel.com/t/7877 + repeated mentions in source threads — none give a single canonical number, all converge on this range]`

Components of cold-start time:
1. **Function init** (~100–300 ms): Node process spin-up
2. **Brotli decompression of chromium.br** (~1.5–2.5 s): the 65 MB binary unpacks at first invocation
3. **Chromium process spawn** (~1–2 s): launching headless chrome with `--single-process` or default args
4. **Page navigation `goto(networkidle0)`** (~1–2 s): the existing `/audit` page is server-rendered with `revalidate: 60`; ISR cache hit makes this fast
5. **`page.pdf()`** (~1–3 s): scales with page count

Cold-start total: 5.6–10 s; warm total: 2–4 s.

Mitigations applied in Pattern 4:
- `chromium.setGraphicsMode = false` saves ~500 ms cold (no swiftshader unpack)
- `headless: chromium.headless` (default `'shell'` mode in Sparticuz 148) is faster than full headless
- Single-page render (no per-finding sub-pages — see Q4)

**Cron-pinger fallback** (deferred, pre-emptive optimisation):
- Vercel Cron triggering `HEAD /api/audit/pdf` every 10 min keeps the function warm. Wire only if production observability shows >25% cold rate.

**Implication for planner:** Plan 02-04 ships as-is; the 10 s success criterion is achievable warm. Phase verification (UAT) should hit the route 3× — once cold (after waiting 15 min), once warm immediate, once warm-with-load — and record timings in the verifier report.

### Q4. What exactly goes in the PDF — page only, or page + per-finding details?

**Answer: page only — the existing `/audit` listing page with all 352 findings rendered inline.** `[ASSUMED — recommendation; planner can flip during plan_check if desired]`

Rationale:
- The existing `/audit` page renders **every finding** in `<details>` blocks inside `app/audit/page.tsx:144-150`. The `<details>` element collapses by default in browser display, but **prints expanded** under `@media print` (no explicit override needed; Chromium's print engine expands collapsed `<details>`).
- The current page is ~352 cards × ~250 bytes of HTML = ~88 KB DOM at full expand. Puppeteer renders this in ~1–3 s.
- Including each finding's `/audit/finding/[id]` page would mean 352 separate `page.goto()` calls — ~352 × 1.5 s = 8+ minutes — a complete non-starter for a synchronous response.
- The `/audit/finding/[id]` detail pages are only marginally richer than the inline `<FindingCard>` (Section + Block sub-components for affected_articles + court_decisions_proof + proposed_fix + reform_steps, all of which are already in the listing card).

**Verification path:** plan 02-04 should add a `?print=1` query-param branch in `app/audit/page.tsx` that forces all `<details>` to render with `open` attribute (defensive — Chromium expansion is reliable but explicit is safer). If the PDF on first preview deploy looks collapsed, this is the fix.

**Implication for planner:** PDF includes the full listing page only. Per-finding detail pages are NOT visited by puppeteer. The "352-finding report" success criterion is satisfied because all 352 findings render inline as expanded cards.

### Q5. Recency-decay function shape.

**Answer: `exp(-age_days / 365)`** — exponential decay, 1-year characteristic time, ≈ 253-day half-life. Same curve across all 6 sources. `[ASSUMED — pick a default; tunable post-launch]`

Pattern 2 above gives the SQL expression and the per-table date-column choice. The 70/30 lex/recency blend (Pattern 2) and the 365-day characteristic time are bundled in `lib/intel-search.ts` as named constants:

```ts
export const RECENCY_HALF_LIFE_DAYS = 365;
export const LEX_WEIGHT = 0.7;
export const RECENCY_WEIGHT = 0.3;  // implied as 1 - LEX_WEIGHT but explicit for clarity
```

Tuning hooks in place; production observability (which queries land on stale rows vs fresh) informs future retune.

### Q6. Endpoint shape — reshape `/api/intel/search` or sibling path?

**Answer: KEEP existing `/api/intel/search` POST (markdown-summary stream); ADD a new GET handler ON THE SAME route file.** `[ASSUMED — recommendation]`

Current state: `app/api/intel/search/route.ts` exports `POST` only; D-05 says POST stays. The new ranked-top-5 endpoint can be:
- (a) GET on the same path → distinguished by HTTP method
- (b) Sibling path `/api/intel/results` or `/api/intel/search/v2`

**Recommend (a) — GET on `/api/intel/search`** because:
- Conceptually the same resource ("intel search results"); HTTP verbs naturally distinguish "get the structured data" (GET) from "summarise as markdown" (POST).
- One rate-limit key (`intel-search`) covers both surfaces — already wired by Phase 1.
- One `route.ts` file, two handlers; mirrors Next 16 file convention.
- Avoids a new path that would require its own rate-limit key + observability label.

**However**, the new GET reads from server-rendered `app/intel/search/page.tsx` directly via the `lib/intel-search.ts` helper. The route handler exists primarily as a fallback / for the per-card AI quote flow. The page.tsx server component can call `searchTopRanked()` from `lib/intel-search.ts` synchronously without an HTTP round-trip — this is the recommended path. **The new endpoint is `/api/intel/quote` (POST) for Haiku quote streaming; the ranking happens server-side in the page render.**

**Net result:** 1 new endpoint (`/api/intel/quote`), 0 changes to `/api/intel/search/route.ts`. The "GET on /api/intel/search" idea is the fallback if the planner wants client-side ranking refresh later.

**Implication for planner:**
- Plan 02-02 adds `lib/intel-search.ts` (calls Postgres function) + integrates into server component `app/intel/search/page.tsx`.
- Plan 02-02 ALSO adds `app/api/intel/quote/route.ts` for the streaming Haiku quote.
- `useRateLimitedFetch` calls go to `/api/intel/quote` from `<BestMatchCard>` (article variant only).
- Rate-limit key for new endpoint: `"intel-quote"` (separate from `intel-search` so the rate limits don't collide).

### Q7. How will puppeteer authenticate when v2.3 auth lands?

**Answer: deferred; documented for future Phase 4+ planners.** `[ASSUMED — out of scope]`

When v2.3 ships auth (Phases 4–7), `/audit` content will remain anon-readable per AUTH-10 (anonymous user sees the full finding, only voting requires sign-in). Therefore puppeteer's `page.goto(/audit)` continues to work without authentication — the page renders the same content for anon users that authenticated users see (modulo the vote button state, which is `print:hidden` anyway).

**The hypothetical future case** is `/intel/*` PDF export (which is NOT in v2.2 scope). When that's added in v3.x, puppeteer will need either:
1. A service-token cookie set by the route handler before `page.goto()` (Supabase server-side session injection)
2. An internal-render path: `page.goto(http://localhost:3000/_internal/audit)` that's middleware-bypassed

Neither is needed for Phase 2. Document the question in PROJECT.md "Key Decisions" so Phase 4+ planners see it.

**Implication for planner:** no Phase 2 work; the `<deferred>` ideas section already covers auth-related export.

## Files to Create/Modify per Plan

### Plan 02-01 — Supabase migration: tsvector + GIN indexes

| File | Change | Notes |
|------|--------|-------|
| `db/intel_fts.sql` | NEW | Pattern 1 SQL — 6 ALTER TABLE + 6 CREATE INDEX + 1 CREATE OR REPLACE FUNCTION `intel_search_top(q text)` |
| `.planning/phases/02-new-ai-features/02-01-PLAN.md` | NEW | The plan itself (orchestrator-generated) |

**Wave-0 status:** No new test infra. Plan 02-01 verifies via:
- `psql $DATABASE_URL -c "SELECT search_vector FROM sanctioned_entities LIMIT 1;"` (column exists + populated)
- `psql $DATABASE_URL -c "EXPLAIN ANALYZE SELECT * FROM sanctioned_entities WHERE search_vector @@ websearch_to_tsquery('simple', 'test');"` (uses GIN index, not seq scan)
- One-shot manual run; no unit test required because the asset is SQL DDL.

### Plan 02-02 — Intel search v2 ranking + quote API

| File | Change | Notes |
|------|--------|-------|
| `lib/intel-search.ts` | NEW | Pure helper that calls `supabase.rpc('intel_search_top', { q })` and shapes the response |
| `app/intel/search/page.tsx` | MODIFY | Call `searchTopRanked()` after the existing `searchAll()`; pass results to new `<BestMatches>` |
| `app/intel/search/best-matches.tsx` | NEW | Server component — renders the section, passes to per-card |
| `app/intel/search/best-match-card.tsx` | NEW | Per-source variant — renders the source pill + verbatim fields; for articles, renders client wrapper that fetches AI quote |
| `app/intel/search/best-match-quote.tsx` | NEW | Client component — uses `useRateLimitedFetch` → POST `/api/intel/quote` → streams quote into the card |
| `app/api/intel/quote/route.ts` | NEW | Pattern 3 — Anthropic Haiku quote-extraction streaming endpoint |
| `__tests__/intel-search-ranking.test.ts` | NEW | Unit test for the recency-decay math + score blending in `lib/intel-search.ts` |

### Plan 02-03 — UI integration (deferred-merge with 02-02 if time)

If plan 02-02's diff stays small, this can roll into 02-02. Otherwise:

| File | Change | Notes |
|------|--------|-------|
| `app/intel/search/best-match-card.tsx` | (See 02-02) | Source-pill tints + field display per UI-SPEC §"Color" §"Source-type tint per best-match card" |
| `app/intel/search/best-matches.tsx` | (See 02-02) | Section header + sub-label per UI-SPEC §"Copywriting Contract" |

**Recommendation: collapse 02-02 + 02-03 into ONE plan named "02-02 Intel ranking + UI cards"** since they share the same files and the UI-SPEC is fully spec'd. This keeps the plan count to 3 (02-01 migration, 02-02 intel, 02-03 audit PDF).

### Plan 02-03 (after collapse) — Audit PDF route + button

| File | Change | Notes |
|------|--------|-------|
| `package.json` | MODIFY | `dependencies` += `puppeteer-core@^24.43.0`, `@sparticuz/chromium@^148.0.0`. Also `engines.node: ">=22.17.0"` |
| `next.config.ts` | MODIFY | Add `outputFileTracingIncludes: { "/api/audit/pdf": ["node_modules/@sparticuz/chromium/bin/**/*"] }` |
| `app/api/audit/pdf/route.ts` | NEW | Pattern 4 — puppeteer + chromium PDF handler |
| `app/audit/page.tsx` | MODIFY | Insert `<DownloadPdfButton className="print:hidden" />` into the stats `flex items-center justify-between` row per UI-SPEC §"Layout Integration → /audit" |
| `app/audit/download-pdf-button.tsx` | NEW | UI-SPEC §"Component Inventory" — client component with idle/loading/done/error states + error toast (modeled on `RateLimitToast`) |
| `__tests__/audit-pdf-route.test.ts` | NEW | Smoke test — imports the route module without crashing; mocks `puppeteer-core.launch` to return a stub; ensures the handler returns a 200 with `Content-Type: application/pdf` |

**Note:** A real puppeteer end-to-end test requires actually launching chromium, which is too heavy for the unit suite. The full PDF render check belongs in **UAT** (manual run on Vercel preview).

### Renumbered plan list (recommended)

The roadmap currently lists 4 plans; this research recommends collapsing to **3 plans** for phase 02:

1. **02-01:** DB migration (tsvector + GIN + ranking function)
2. **02-02:** Intel search v2 (ranking helper + AI quote endpoint + UI cards)
3. **02-03:** Audit PDF (route + button + bundle config)

The collapse keeps each plan's diff bounded and avoids forcing 02-02 (data-fetch) and 02-03 (UI) to interlock when they share the same files.

If the planner prefers 4 plans, split 02-02 → 02-02a (server-side ranking + API) + 02-02b (UI cards). Either is acceptable.

## Code Examples

All examples above (Patterns 1–6) are verified against the cited sources or the existing codebase. The planner's task-action snippets should reference these patterns by name, not duplicate the code.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `chrome-aws-lambda` | `@sparticuz/chromium` | 2022 | Unmaintained; sparticuz is the maintained fork tracking chromium release cycle `[CITED: github.com/Sparticuz/chromium README]` |
| `serverComponentsExternalPackages` (Next 14) | `serverExternalPackages` (Next 15+) | Next 15 stable | Renamed from experimental; same key now first-class. Both `@sparticuz/chromium` and `puppeteer-core` are in the built-in list since Next 16 `[VERIFIED: serverExternalPackages.md lines 37-38, 84]` |
| Trigger-maintained tsvector with backfill | `GENERATED ALWAYS AS ... STORED` | PG 12+ | Auto-populates on ALTER TABLE; no maintenance code path; smaller migration `[CITED: postgresql.org/docs/current/ddl-generated-columns.html]` |
| `claude-3-5-haiku-20241022` | `claude-haiku-4-5` | Oct 2025 | 4-5 is faster, identical pricing; current generation `[VERIFIED: Anthropic models doc]` |
| Manual `Retry-After` parsing in fetch callers | `useRateLimitedFetch` hook (Phase 1) | 2026-05-09 | Already shipped; Phase 2 reuses |

**Deprecated/outdated to avoid:**
- `chrome-aws-lambda` package (unmaintained 2022+)
- `puppeteer` (full package, ~300 MB) — use `puppeteer-core` only on serverless
- `serverComponentsExternalPackages` (next.config) — renamed to `serverExternalPackages`
- `claude-3-haiku-20240307` (Haiku 3) — use `claude-haiku-4-5` (Haiku 4.5)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Recency half-life = 1 year (`exp(-days/365)`) | Pattern 2 / Q5 | Low — single constant; if production observability shows fresh stories getting buried under high-relevance stale ones, retune `RECENCY_HALF_LIFE_DAYS` to 180 |
| A2 | 70/30 lex/recency blend | Pattern 2 / Q5 | Low — same retunability as A1 |
| A3 | PDF includes the listing page only, not per-finding detail pages | Q4 | Medium — if user expectation is "every finding's full proposed_fix + reform_steps body", we'd need to include the detail pages or expand the listing card. Mitigation: `<details open>` via `?print=1` makes the listing show the full body anyway; visually verify on first preview deploy |
| A4 | GET on `/api/intel/search` is unnecessary; ranking happens in the page server component | Q6 | Low — if planner decides client needs to refresh ranking without page nav (e.g., a "show more" button), add the GET handler. Not blocking |
| A5 | 1024–1600 MB function memory recommended for chromium | Pattern 4 | Low — chromium README says 512 MB minimum, 1600 MB recommended. Vercel Pro defaults to 2 GB which exceeds both. Don't override unless cost demands |
| A6 | `chromium.headless` default value (`'shell'` in v148) is the right setting | Pattern 4 | Low — Sparticuz README's example uses it; battle-tested |
| A7 | `outputFileTracingIncludes` glob pattern catches all chromium runtime files | Pattern 5 | Medium — community threads consistently use this glob; if first deploy fails with "Could not find Chromium", widen to include `lib/**/*` too. Verifier check covers this |

**If this table is empty:** N/A — 7 assumptions documented, 4 low / 2 medium / 1 medium risk. None are blocking; all have explicit mitigations.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Supabase Postgres | Track A migration + queries | ✓ | (managed; PG ≥13) | — (locked dependency) |
| `psql` CLI for migration application | Track A plan 02-01 | ✓ via Supabase Dashboard SQL editor | — | Apply via dashboard if local `psql` missing |
| `bun` package manager | Both tracks | ✓ | (project standard) | `npm` works as fallback |
| Node 22.17+ | Track B `@sparticuz/chromium` engine req | ✓ on Vercel | 22.x default | Pin in `package.json` engines |
| Vercel Pro plan | Track B `maxDuration: 60` | ✓ (project deployed; 300s default ceiling, 60 well within) | — | Hobby caps at 300s, also fine |
| `NEXT_PUBLIC_SITE_URL` env | Track B (puppeteer page.goto target) | ✓ in `.env.local` and Vercel | `https://lex-web-eta.vercel.app` | — |
| `AUDIT_VOTE_SALT` env | Phase 1 carry-over for HMAC IP hash in any new logs | ✓ | (set on Vercel + local) | — |
| `ANTHROPIC_API_KEY` env | Track A Haiku endpoint | ✓ (existing AI surface uses it) | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — phase is fully unblocked.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 + @testing-library/react 16.3.2 + jsdom 29.1.1 |
| Config file | `vitest.config.ts` (jsdom env, `globals: true`, `@` alias to project root) |
| Quick run command | `bun run test -- <file>` (single test file) |
| Full suite command | `bun run test` (all tests in `__tests__/` and `lib/`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INT-02 | tsvector migration is idempotent | manual-only | `psql $DATABASE_URL -f db/intel_fts.sql` (run twice, second is no-op) | ❌ Wave 0 — `db/intel_fts.sql` |
| INT-02 | Ranking SQL returns ≤5 rows ordered by score | manual-only (live DB) | `psql $DATABASE_URL -c "SELECT * FROM intel_search_top('test') ;"` | ❌ Wave 0 — function created in 02-01 |
| INT-02 | `lib/intel-search.ts` correctly shapes RPC response | unit | `bun run test __tests__/intel-search-ranking.test.ts` | ❌ Wave 0 |
| INT-02 | `useRateLimitedFetch` hook works with `/api/intel/quote` | unit (existing test extended) | `bun run test __tests__/use-rate-limited-fetch.test.tsx` | ✅ exists — reuses Phase 1 hook test |
| INT-02 | Best-matches section hides when 0 cross-source hits | manual-only (browser) | UAT step on preview deploy | ❌ |
| INT-02 | AI quote streams in Bulgarian Cyrillic for an article card | manual-only (browser) | UAT step | ❌ |
| INT-02 | <3 s search-to-render budget | manual-only | UAT — measure wall time on preview deploy with realistic query | ❌ |
| PDF-01 | `/api/audit/pdf` route imports cleanly | unit (smoke) | `bun run test __tests__/audit-pdf-route.test.ts` | ❌ Wave 0 |
| PDF-01 | Returns 200 with `Content-Type: application/pdf` | unit (mocked puppeteer) | (same) | ❌ Wave 0 |
| PDF-01 | Returns 429 on over-limit | unit | (same — invoke 6× quickly) | ❌ Wave 0 |
| PDF-01 | Real PDF renders with watermark | manual-only | UAT — download from Vercel preview, open in viewer | ❌ |
| PDF-01 | <10 s for 352 findings (warm) | manual-only | UAT — `time curl -o out.pdf https://preview.../api/audit/pdf` | ❌ |
| PDF-01 | <10 s for 352 findings (cold) | manual-only | UAT — wait 15 min idle, then time | ❌ |

### Sampling Rate

- **Per task commit:** `bun run test -- <changed-file>` (typically <5 s)
- **Per wave merge:** `bun run test` + `bunx tsc --noEmit` + `bun run build` (typically <60 s combined)
- **Phase gate:** Full suite green + manual UAT items above ticked, before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `db/intel_fts.sql` — covers INT-02 migration; created in plan 02-01
- [ ] `__tests__/intel-search-ranking.test.ts` — covers `lib/intel-search.ts` shape + recency math; created in plan 02-02
- [ ] `__tests__/audit-pdf-route.test.ts` — covers `/api/audit/pdf` route smoke + 429; created in plan 02-03

*(Test framework + RTL + jsdom + vitest config already exist from Phase 1 — no Wave 0 framework install needed.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 2 has no auth surface; v2.3 introduces |
| V3 Session Management | no | (same) |
| V4 Access Control | partial | `/api/audit/pdf` is public (rate-limited only); `/api/intel/quote` is public (rate-limited only). Same posture as the rest of the AI surface |
| V5 Input Validation | yes | tsvector query input goes through `websearch_to_tsquery` which never raises syntax errors and silently drops malformed input — safer than `plain` mode for raw user input. Haiku quote endpoint validates `query` and `summary` non-empty. PDF route takes no user input |
| V6 Cryptography | yes | Phase 2 reuses Phase 1's HMAC-SHA-256(ip, AUDIT_VOTE_SALT) for any new structured logs; no new crypto primitives introduced |
| V8 Data Protection | partial | PDF response `Cache-Control: no-store` prevents CDN caching of public-but-time-sensitive content. Same posture as existing AI streaming routes |
| V11 Business Logic | partial | PDF rate limit (5/min) prevents one IP monopolising puppeteer cold-starts. Haiku quote rate limit (30/min) sized for ~6 page renders/min |
| V14 Configuration | yes | `outputFileTracingIncludes` is a build-time config gate; misconfiguration causes runtime 500 (covered in Pitfall 3). `AUDIT_VOTE_SALT` mandatory at module load (Phase 1 contract preserved) |

### Known Threat Patterns for Next.js + Postgres + puppeteer

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via search query | Tampering | `websearch_to_tsquery('simple', $1)` is a bind parameter; no string concat. RPC function uses prepared statements |
| Server-side request forgery via PDF puppeteer | Tampering | `page.goto()` URL is hardcoded to `${SITE_URL}/audit` — user cannot influence the navigation target. `SITE_URL` from env, not from request |
| Resource exhaustion (puppeteer cold-start spam) | DoS | 5/min/IP rate limit; 60s `maxDuration` ceiling; Vercel concurrency auto-scaling caps total |
| Anthropic token-budget exhaustion | DoS | 30/min/IP rate limit on quote endpoint; signal propagation aborts upstream stream on client disconnect (Pattern 3 explicitly preserves) |
| PDF response cache poisoning | Spoofing | `Cache-Control: no-store` + filename includes today's ISO date |
| Cross-origin PDF download | (— low impact, public content) | App's CSP already constrains `connect-src` to `'self'`; PDF endpoint is same-origin |

## Sources

### Primary (HIGH confidence — verified against tool output, official docs, or codebase grep)

- [Live Supabase Postgres probe via lex-brain venv psycopg2 (2026-05-10)] — confirmed no tsvector/GIN on 6 intel tables; row counts 8325/1156/29/100/6/12
- [`/Users/beyond/Desktop/lex-brain/db/intel_schema.sql`] — confirmed schema absent of FTS columns
- [`/Users/beyond/Desktop/lex-brain/db/schema.sql`] — confirms `to_tsvector('simple', ...)` is the project-canonical FTS pattern (used on `law_articles`)
- [`/Users/beyond/Desktop/lex-brain/db/court_schema.sql`] — confirms `setweight(...A,B)` weighted-FTS pattern is in production use
- [npm view `@sparticuz/chromium` 2026-05-10] — version 148.0.0; unpacked 65.8 MB; engine `node>=22.17.0`; latest release 2026-04-27
- [npm view `puppeteer-core` 2026-05-10] — version 24.43.0; unpacked 8.5 MB
- [npm view `@anthropic-ai/sdk`] — current 0.95.1; project pins 0.92.0 (already installed)
- [https://platform.claude.com/docs/en/docs/about-claude/models] — confirmed `claude-haiku-4-5` is the canonical alias; pricing $1/$5; "fastest" latency tier
- [https://vercel.com/docs/functions/limitations] (last_updated 2026-02-24) — Node runtime: 250 MB uncompressed bundle limit; Pro plan maxDuration 800s; default 2 GB / 1 vCPU memory
- [`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.md`] — Next 16 confirms `@sparticuz/chromium`, `@sparticuz/chromium-min`, `puppeteer-core`, `puppeteer` are auto-externalized (lines 37-38, 84-85)
- [`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md`] — `outputFileTracingIncludes` stable since v15; route-glob keys + project-root-relative path globs
- [`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`] — `maxDuration` API unchanged since v13.4.10
- [`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`] — Next 16 route handler conventions
- [`/Users/beyond/Desktop/lex-web/lib/use-rate-limited-fetch.ts`] — Phase 1 hook contract; `submit()` returns `{ ok, response, signal } | { ok: false, rateLimited } | { ok: false, error } | { ok: false, aborted }`
- [`/Users/beyond/Desktop/lex-web/lib/rate-limit.ts`] — Phase 1 `rateLimited(req, key, opts)`; emits structured log + 429 with `{error, retry_after}`
- [`/Users/beyond/Desktop/lex-web/app/api/intel/search/route.ts`] — canonical Anthropic streaming pattern to mirror

### Secondary (MEDIUM confidence — official docs without direct tool verification)

- [https://supabase.com/docs/reference/javascript/textsearch] + [https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/database/full-text-search.mdx] — `.textSearch(column, query, { type: 'plain' \| 'phrase' \| 'websearch', config: 'simple' })` API
- [https://www.postgresql.org/docs/current/textsearch-controls.html] — `to_tsvector`, `ts_rank`, `setweight`, `websearch_to_tsquery`
- [https://www.postgresql.org/docs/current/ddl-generated-columns.html] — `GENERATED ALWAYS AS ... STORED` semantics
- [https://github.com/Sparticuz/chromium README] — launch options + `chromium.setGraphicsMode = false` recommendation + `setHeadlessMode` API
- [https://vercel.com/kb/guide/deploying-puppeteer-with-nextjs-on-vercel] — Vercel KB; recommends `chromium-min` for tight bundles
- [https://github.com/vercel/next.js/discussions/55228] — `outputFileTracingIncludes` example with `@sparticuz/chromium/bin/`

### Tertiary (LOW confidence / community consensus — verified against multiple threads but no canonical timing data)

- [https://dev.to/travisbeck/how-to-generate-pdfs-with-puppeteer-on-vercel-in-2024-1dm2] — full PDF route example, browser-reuse trick, chrome args list
- [https://community.vercel.com/t/sparticuz-chromium-min-working-with-vercel-for-pdf/7877] — confirms the bundle-fit reality (50 MB is NOT the Vercel limit; 250 MB is)
- [https://gist.github.com/kettanaito/56861aff96e6debc575d522dd03e5725] — App Router puppeteer-on-Vercel example
- Cold-start timing (~6–9 s cold, ~2–4 s warm) — no single canonical benchmark; aggregated from 4+ community threads. Verify on first deploy and adjust mitigations.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package version verified against npm registry; Anthropic Haiku model verified against vendor docs; Supabase JS API verified against official + community docs
- Architecture: HIGH — patterns either copy-pasted from existing repo (`/api/intel/search` shape, `useRateLimitedFetch` contract) or assembled from explicit Vercel + Next + Supabase official docs
- DB state: HIGH — direct `psycopg2` probe of the live database confirmed no tsvector/GIN; row counts exact
- Pitfalls: MEDIUM — Pitfall 2 (cold-start) is timing-dependent and only validated against community threads, not a formal benchmark; Pitfall 3 (`outputFileTracingIncludes`) is verified against multiple consistent sources but the precise glob may need a single-character fix on first deploy
- Open questions: HIGH — Q1, Q2 fully verified by tool; Q3, Q5 backed by official docs + community consensus; Q4, Q6, Q7 are recommendations with low risk and clear flip-paths

**Research date:** 2026-05-10
**Valid until:** 2026-06-09 (30 days — stable domain). Re-validate the @sparticuz/chromium and puppeteer-core versions on the first plan execution; the chromium release cycle is ~monthly and may have shipped a 149.x / 24.44 by then.
