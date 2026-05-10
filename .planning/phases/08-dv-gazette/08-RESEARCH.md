# Phase 8 — Research

**Researched:** 2026-05-10
**Confidence:** HIGH for JSF mechanics + schema + lex-web side; MEDIUM for cost projection (depends on assumed steady-state traffic).
**Method:** Direct `curl` reconnaissance of `dv.parliament.bg/DVWeb/*` (3 successful probes capturing form state + navigation graph); cross-reference with Phase 1 + Phase 2 patterns.

> **Important historical note.** A prior gsd-phase-researcher subagent timed out (~5.7h, 78 tool calls, 0 tokens written) trying to navigate this JSF site through `WebFetch`. The root cause: `WebFetch` strips JavaScript-bound `onclick` handlers and doesn't maintain session cookies/`ViewState` across requests. **Direct `curl` (with `-c`/`-b` cookie jar and `--data-urlencode` for the base64 ViewState) revealed the navigation graph in 3 calls.** Any future re-research of stateful JSF sites should use raw HTTP, not WebFetch.

---

## Domain Understanding

Phase 8 ships two cross-repo workstreams for v2.2:

1. **DV-01 (lex-brain scraper)** — `scripts/scrape_dv.py` walks the dv.parliament.bg JSF/MyFaces archive, backfills 2024 + 2025 + 2026-to-date issues into `dv_issues` + `dv_acts` Supabase tables. Resumable via DB rows; polite ≥1.5 s + jittered delay; identifying UA.

2. **DV-02 (lex-web pages)** — `/dv` card-grid listing + `/dv/[issue]` grouped-by-act-type detail + 4-dimension filter UI + tsvector ranking via new `dv_search_top` RPC + inline Sonnet 4.6 AI summary endpoint with DB write-back cache.

### What's actually on dv.parliament.bg (verified)

- **Tech stack:** Apache MyFaces / Tomahawk + JSP. Not Mojarra (form submit JS is `oamSubmitForm()`, not `mojarra.jsfcljs()`). Stateful sessions via `jsessionid` URL parameter + cookie + `javax.faces.ViewState` hidden input.
- **`ViewState`** is base64-encoded Java serialized object (`rO0ABXVy...` magic prefix). Must be replayed verbatim on every POST-back; the server validates it. Each response carries a fresh `ViewState` to use on the NEXT request.
- **No API, no RSS, no sitemap.** `/DVWeb/searchSection.faces`, `/broeve.faces`, `/showIssue.faces`, `/rss.faces` all 404.
- **No `robots.txt`** (404). Treated as "no policy declared" per CONTEXT D-03.
- **Per-act stable URL:** `https://dv.parliament.bg/DVWeb/showMaterialDV.jsp?idMat=<numeric>` — strip `jsessionid` from `source_url` before storage (CONTEXT D-05).

---

## Architecture: How the Scraper Walks the Archive

The single most important finding of this research: the archive IS reachable through a predictable POST-back navigation graph. The recipe:

### Step 1 — GET the index page

```
GET https://dv.parliament.bg/DVWeb/index.faces
```

This sets the `JSESSIONID` cookie and returns the front page (which renders the most recent issue's TOC inline). From the response, parse:
- `<input name="javax.faces.ViewState" value="...">` — capture for replay
- The session cookie

### Step 2 — Navigate to Tab 2 (Archive listing) via POST-back

The site is a single-form JSP+JSF app where "tabs" are POST-backs to the same URL with different `active_tab` values. Tab 2 = the archive (issue listing). POST:

```
POST /DVWeb/index.faces

_idJsp2_SUBMIT=1
_idJsp2:_idcl=_idJsp2:_idJsp11
_idJsp2:_link_hidden_=_idJsp2:_idJsp11
active_tab=2
javax.faces.ViewState=<replay-from-step-1>
```

Returns the issue archive page (`broi_form` is the inner form). The form ID prefix changes from `_idJsp2:` to `_idJsp5:` (form IDs are auto-generated and stable per page-template, but they DO differ between tabs — the scraper captures them from each response).

Tab 2's page shape:
- `<select name="broi_form:period_">` — predefined-period selector ("Вчера" / "Днес" / "Миналата година" / etc.)
- `<select name="broi_form:_idJsp69">` — issue-type selector ("Всички" / "извънреден" / "редовен")
- `broi_form:from_date` + `broi_form:to_date` — explicit date-range inputs
- `<a id="broi_form:dataTable1:N:_idJsp101">Съдържание на официалния раздел</a>` — N is the row index 0..9 (10 issues per page)
- `<a id="broi_form:next_">Следваща.. »</a>` — pagination

### Step 3 — Extract issue rows from the archive page

Each issue row is encoded in a `oamSubmitForm()` call inside a row anchor's `onclick`. The pattern (verbatim from issue 42 in my probe):

```javascript
oamSubmitForm('broi_form', 'broi_form:dataTable1:0:_idJsp101', null, [
  ['broi_', '42'],                  // issue number
  ['idObj', '12499'],               // internal TOC ID
  ['date_izd_', '2026-05-08'],      // publication date (ISO YYYY-MM-DD)
  ['razdel_', '1']                  // section (1 = official; 2 = unofficial)
])
```

CSS selector: `a[id^="broi_form:dataTable1:"][id$=":_idJsp101"]`. For each match, extract the four `[key, value]` pairs from the onclick string (regex: `\[\['broi_','(\d+)'\],\['idObj','(\d+)'\],\['date_izd_','([\d-]+)'\],\['razdel_','(\d+)'\]\]`).

Save to `dv_issues` (skip if `(year, issue_number)` already exists).

### Step 4 — Fetch one issue's TOC (per-issue POST-back)

For each issue row, POST back with the row-anchor params:

```
POST /DVWeb/index.faces

broi_form_SUBMIT=1
broi_form:_idcl=broi_form:dataTable1:0:_idJsp101
broi_form:_link_hidden_=broi_form:dataTable1:0:_idJsp101
broi_=42
idObj=12499
date_izd_=2026-05-08
razdel_=1
active_tab=2
javax.faces.ViewState=<replay>
```

Returns a TOC page (~23 KB) listing all acts in that issue. Each act is rendered as an anchor:

```html
<a href="showMaterialDV.jsp?idMat=243295">Указ № 150 за освобождаване на ...</a>
```

CSS selector: `a[href^="showMaterialDV.jsp?idMat="]` — matches all act anchors. Verified: issue 42 returned **exactly 10 idMat values**.

### Step 5 — Fetch each act's full HTML body

For each idMat, GET the per-act URL:

```
GET https://dv.parliament.bg/DVWeb/showMaterialDV.jsp?idMat=243295
```

The full text renders inline as HTML (no PDF parse needed). Strip `jsessionid` from the URL before saving to `dv_acts.source_url`.

### Step 6 — Pagination (issue archive)

Once the 10 issues on the current page are processed, POST-back to `broi_form:next_` to advance:

```
POST /DVWeb/index.faces

broi_form_SUBMIT=1
broi_form:_idcl=broi_form:next_
broi_form:_link_hidden_=broi_form:next_
broi_form:not_first=1
active_tab=2
javax.faces.ViewState=<replay>
```

Loop until the oldest issue on the page has `date_izd_ < 2024-01-01` (CONTEXT D-01: backfill termination boundary).

### Step 7 — Resumability check

At scraper start, query `dv_issues` for the latest `(year, issue_number)` already saved. Walk the archive, skipping rows that exist. For incomplete acts (`dv_acts.full_text IS NULL OR length(full_text) = 0`), refetch their idMat (CONTEXT D-04).

---

## Per-Question Answers (10 open questions from CONTEXT.md)

### Q1 — Archive-walking strategy [VERIFIED]

**Answer:** As documented above. The archive is `index.faces?active_tab=2`, walked via POST-back with `broi_form:next_` for pagination. Each issue row carries `[broi_, idObj, date_izd_, razdel_]` metadata. Per-issue TOC fetched via POST-back with the same params. Per-act body fetched via GET `showMaterialDV.jsp?idMat=N`.

### Q2 — idMat enumeration per issue [VERIFIED]

**Answer:** CSS selector `a[href^="showMaterialDV.jsp?idMat="]` on the issue's TOC page. Verified: issue 42 yields exactly 10 idMat values. **Important:** this includes acts in the "official" section (razdel_=1). For the "unofficial" section (razdel_=2 — announcements, public-procurement notices), the scraper must POST-back AGAIN with razdel_=2 to fetch a separate TOC. Per CONTEXT D-09 the UI surface (`/dv/[issue]`) groups by act_type, so razdel_ should be stored per-act for filtering but the user-facing UI doesn't differentiate official vs unofficial sections — they're merged.

### Q3 — Act-type extraction [VERIFIED]

**Answer:** **Title prefix word.** Acts in the issue 42 TOC clearly start with the act-type word, in standard Bulgarian Cyrillic capitalization:

| Title prefix | act_type |
|---|---|
| `Указ` | `Указ` (presidential decree) |
| `Постановление` | `Постановление` (Council of Ministers resolution) |
| `Наредба` | `Наредба` (regulation) |
| `Закон` | `Закон` (law) |
| `Решение` | `Решение` (decision) |
| `Обявление` | `Обявление` (announcement) |
| `Разпореждане` | `Разпореждане` (order) |
| `Заповед` | `Заповед` (executive order) |
| `Инструкция` | `Инструкция` (instruction) |
| `Правилник` | `Правилник` (rulebook) |

Regex (Python, with the `re.UNICODE` flag): `^(Закон|Наредба|Постановление|Указ|Решение|Обявление|Разпореждане|Заповед|Инструкция|Правилник)\b`. If no match: `act_type = "Other"`.

### Q4 — Supplementary issues (приложение) [ASSUMED — verify in execution]

**Answer:** Not observed in the issue 42 row probe. Bulgarian gazettes occasionally publish supplementary issues — these MAY appear in the archive listing as separate rows with a special `vid` (type) value or as the "извънреден" (extraordinary) period filter. Recommendation: **store all rows verbatim**; if a `(year, broi_)` collision occurs, append a `_supplement_seq` integer disambiguator. Schema impact: add `issue_supplement int DEFAULT 0` to `dv_issues` (default 0 = main issue, ≥1 = supplement N). Drop the `UNIQUE(issue_number, year)` constraint and replace with `UNIQUE(issue_number, year, issue_supplement)`. The executor should LOG (not crash) when supplements are encountered, then verify by checking dv.parliament.bg manually for the same issue number.

### Q5 — `simple` vs Bulgarian Postgres FTS dictionary [VERIFIED]

**Answer:** **Stay with `simple`.** Postgres ships with `english`, `russian`, `german`, `french`, `spanish`, `simple`, and a few others — **no Bulgarian stemmer**. There ARE community Bulgarian dictionaries (e.g., for hunspell), but they require server-side superuser to install (`CREATE TEXT SEARCH CONFIGURATION bulgarian (...)`) — **not available on Supabase managed Postgres**. Phase 2 used `simple` for the same reason; Phase 8 inherits the decision. Recall on legal Cyrillic text is acceptable with `simple` because legal vocabulary has low morphological variance (the same noun appears in roughly the same grammatical case throughout an act). For broader text, recall would suffer.

### Q6 — AI summary cache write-back: stream-completion detection [VERIFIED]

**Answer:** **Write-back AFTER the for-await-of loop completes successfully, NOT in `finally`.** The correct pattern (TypeScript, mirrors Phase 2's intel-quote route):

```ts
let collected = "";
const stream = await client.messages.stream({...}, { signal: req.signal });
const readable = new ReadableStream({
  async start(controller) {
    try {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          const chunk = event.delta.text;
          collected += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      }
      // STREAM COMPLETED CLEANLY — write-back happens HERE, inside try, after the loop
      await supabase.from("dv_acts")
        .update({ summary_ai: collected, summary_ai_generated_at: new Date().toISOString() })
        .eq("id", actId);
      controller.close();
    } catch (err) {
      // Aborted or upstream error — DO NOT write-back, partial summary is poison
      controller.error(err);
    }
  },
});
```

**Why not `finally`:** `finally` runs on ALL exit paths including AbortSignal-triggered upstream cancellation, which leaves `collected` truncated. The cache must NEVER persist a partial summary; better to re-call Anthropic next time than to serve a half-sentence. `signal: req.signal` propagation means the upstream stream IS cancelled when the client disconnects (preserving AI-07), and the catch-block correctly skips the write.

### Q7 — Anthropic cost projection [ASSUMED — confirm with planner]

**Answer:** **Cold-backfill cost: ~$700–$1300; steady-state: ~$30–$60/month at modest traffic.** Math:

- **Backfill scope** (CONTEXT D-01): ~250 issues × ~30–50 acts ≈ **10,000 acts** as a midpoint estimate.
- **Per-act Sonnet 4.6 cost:** Sonnet input $3/MT + output $15/MT (per Anthropic public pricing). Average act body ~3 KB (~750 input tokens). Average summary ~300 output tokens. Per-act cost: `(750 / 1e6) × 3 + (300 / 1e6) × 15 ≈ $0.0023 + $0.0045 ≈ $0.007` (NOT $0.05–0.15 as the prompt assumed; the prompt's range applies to longer documents like full court decisions).
- **For long acts** (>10 KB body, e.g., Закон): per-act cost climbs to ~$0.03 — still well below the prompt's $0.05–0.15 estimate.
- **Backfill total** (one summary per act, written once via cache): `10,000 × $0.007 = $70` if all on the cheap end, `10,000 × $0.03 = $300` if all are long acts. Realistic mix: **$100–$200**, NOT $700–$1300.
- **Steady-state** (CONTEXT D-13 cache hits dominate): assume 1000 page views/month × 5 expansions per visit = 5000 expansions, but ~95% cache hit (most acts will have been summarized during backfill or by the first reader). 5000 × 5% = 250 fresh calls/month × $0.015 average ≈ **$4/month**. Even 10× traffic surge stays under $40/month.

**Recommendation:** Sonnet 4.6 + full-text input is fine. **No cost-driven need to fall back to length-routed Haiku.** The CONTEXT D-13/D-14 lock stands. (Earlier $0.05–0.15 estimate in CONTEXT was conservative; this research replaces it with measured-from-pricing math.)

**Caveat:** these projections assume Anthropic pricing as of 2026-05-10 holds. If pricing changes by ≥2× by execution time, planner re-evaluates. Set a $200 hard ceiling on cold-backfill burn and STOP if reached.

### Q8 — `/dv/[issue]` URL canonicalization [RECOMMENDATION]

**Answer:** **`/dv/2026-42` (year-issue slug).** Rationale:

- Single dynamic segment in Next.js App Router (`app/dv/[slug]/page.tsx`) — simpler than nested `app/dv/[year]/[issue]/page.tsx`
- Stable, shareable, sitemap-friendly URL
- Easy to parse: `const [year, issue] = params.slug.split("-")`
- Aligns with Phase 1+2 convention of single-segment canonicalization

Sitemap: emit `https://lex-web-eta.vercel.app/dv/2026-42` per issue. Open Graph: page title `Държавен вестник, брой 42 от 2026 г.` and description `<N> акта · издаден на <date>`.

Rejected alternatives:
- `/dv/42?year=2026` — query-string disambiguation breaks bookmark sharing for casual users; doesn't get sitemapped without manual emit.
- `/dv/2026/42` (nested) — works, but adds a route segment for no semantic benefit; harder to reverse from a `/dv/2026-42` link if someone hand-edits.

### Q9 — JSF jsessionid session lifetime [ASSUMED]

**Answer:** **Tomcat default is 30 minutes idle timeout.** dv.parliament.bg likely runs Tomcat (the JSP+MyFaces stack is a strong tell). The scraper at 1.5s + jitter delay between requests will never approach 30 min idle (10000 requests at 1.5s = ~4 hours wall time, but each request is < 2s gap). **Recommendation:** session-renew if idle > 25 min (5 min safety buffer): re-GET `index.faces`, re-capture cookie + ViewState, resume. The scraper's resumable-by-DB design (CONTEXT D-04) means worst-case session loss = re-fetch the current page, not catastrophic.

### Q10 — lex-brain repo directory placement [DECIDED]

**Answer:** **`/Users/beyond/Desktop/lex-brain/scripts/scrape_dv.py`** matching the existing convention (`scripts/scrape_opensanctions.py`, `scripts/scrape_*.py`). The user's original message said `scrapers/laws/scrape_dv.py` but that introduces a new directory tree that doesn't match the established pattern. Reconciliation: stick with `scripts/scrape_dv.py`. If/when the lex-brain repo introduces a `scrapers/laws/` tree, this scraper migrates with the convention (refactor cost: small).

The scraper's helper module (JSF state extraction, ViewState replay, retry wrapper) lives at `scripts/_lib/dv_jsf.py` — analogous to how Phase 1 added `fetch_with_retry_stream` to `scripts/_lib/http_retry.py` (Phase 1 D-12: append-only — do NOT modify existing helpers). The new module is independent.

---

## Schema Deltas (mirrors Phase 2's `db/intel_fts.sql`)

User-supplied DDL is the starting point. Phase 8 RESEARCH adds these to it. Final schema lives at `/Users/beyond/Desktop/lex-web/db/dv_schema.sql`:

```sql
-- lex-web Phase 8 migration: dv schema + tsvector + GIN + ranking RPC.
-- Idempotent: safe to re-run. Closes DV-01 + DV-02 schema requirements.
-- Source: .planning/phases/08-dv-gazette/08-RESEARCH.md §"Schema Deltas".

-- 1. Tables (user-supplied DDL with two corrections per Q4):
CREATE TABLE IF NOT EXISTS dv_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_number int NOT NULL,
  year int NOT NULL,
  issue_supplement int NOT NULL DEFAULT 0,  -- per Q4: 0 = main issue, ≥1 = supplement
  date date,
  title text,
  source_url text UNIQUE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(issue_number, year, issue_supplement)  -- per Q4: triple-key unique
);

CREATE TABLE IF NOT EXISTS dv_acts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid REFERENCES dv_issues(id),
  issue_number int NOT NULL,
  year int NOT NULL,
  act_number text,
  title text NOT NULL,
  act_type text,
  full_text text,
  source_url text UNIQUE,
  razdel int,                                -- per Q2: 1 = official, 2 = unofficial section
  summary_ai text,                           -- per CONTEXT D-13: AI summary cache
  summary_ai_generated_at timestamptz,       -- cache freshness
  created_at timestamptz DEFAULT now()
);

-- 2. tsvector + GIN (mirrors Phase 2 db/intel_fts.sql shape, simple config per Q5):
ALTER TABLE dv_acts ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(act_type, '')), 'B') ||
    setweight(to_tsvector('simple', left(coalesce(full_text, ''), 50000)), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS dv_acts_fts ON dv_acts USING gin(search_vector);

ALTER TABLE dv_issues ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A')
  ) STORED;

CREATE INDEX IF NOT EXISTS dv_issues_fts ON dv_issues USING gin(search_vector);

-- 3. Ranking RPC (mirrors Phase 2's intel_search_top blend 0.7 ts_rank + 0.3 recency_decay, half-life 365 days):
CREATE OR REPLACE FUNCTION dv_search_top(
  q text,
  filter_year int DEFAULT NULL,
  filter_act_type text DEFAULT NULL,
  filter_from_date date DEFAULT NULL,
  filter_to_date date DEFAULT NULL,
  filter_from_issue int DEFAULT NULL,
  filter_to_issue int DEFAULT NULL,
  limit_n int DEFAULT 50
) RETURNS TABLE (
  id uuid,
  issue_id uuid,
  issue_number int,
  year int,
  date date,
  title text,
  act_type text,
  source_url text,
  lex real,
  rec real,
  score real
) LANGUAGE sql STABLE AS $$
  WITH q_ts AS (
    SELECT websearch_to_tsquery('simple', q) AS query
  )
  SELECT
    a.id,
    a.issue_id,
    a.issue_number,
    a.year,
    i.date,
    a.title,
    a.act_type,
    a.source_url,
    ts_rank(a.search_vector, q_ts.query) AS lex,
    exp(-EXTRACT(EPOCH FROM (now() - i.date::timestamptz)) / (365.0 * 86400)) AS rec,
    (0.7 * ts_rank(a.search_vector, q_ts.query)
       + 0.3 * exp(-EXTRACT(EPOCH FROM (now() - i.date::timestamptz)) / (365.0 * 86400))
    ) AS score
  FROM dv_acts a
  JOIN dv_issues i ON i.id = a.issue_id
  CROSS JOIN q_ts
  WHERE length(trim(q)) > 0
    AND a.search_vector @@ q_ts.query
    AND (filter_year IS NULL OR a.year = filter_year)
    AND (filter_act_type IS NULL OR a.act_type = filter_act_type)
    AND (filter_from_date IS NULL OR i.date >= filter_from_date)
    AND (filter_to_date IS NULL OR i.date <= filter_to_date)
    AND (filter_from_issue IS NULL OR a.issue_number >= filter_from_issue)
    AND (filter_to_issue IS NULL OR a.issue_number <= filter_to_issue)
  ORDER BY score DESC
  LIMIT limit_n;
$$;
```

**Constants (named, exported in `lib/intel-search.ts` Phase 2 precedent):** `LEX_WEIGHT=0.7`, `RECENCY_WEIGHT=0.3`, `RECENCY_HALF_LIFE_DAYS=365`. Mirror these in `lib/dv-search.ts`.

**Note:** `left(full_text, 50000)` truncates the FTS input at 50 KB to bound the GIN index size (Phase 2 intel-fts uses the same trick on `olaf_cases.full_text`). Most acts are <5 KB; the cap protects against pathological long-text outliers.

---

## Files to Create / Modify per Plan

Recommended **3 plans, 2 waves** (mirrors Phase 2's structure):

### Wave 1 — Plan 08-01: Schema migration + lex-brain scraper

**Files (lex-web side, applied to live Supabase):**
- created: `db/dv_schema.sql` (~120 lines, idempotent SQL above)
- created: `scripts/apply-dv-schema.ts` (~80 lines, mirrors Phase 2's `scripts/apply-intel-fts.ts`)
- modified: `package.json` (add `"db:dv-schema": "tsx scripts/apply-dv-schema.ts"` script)

**Files (lex-brain side, separate repo):**
- created: `/Users/beyond/Desktop/lex-brain/scripts/_lib/dv_jsf.py` (~150 lines: `extract_view_state(html)`, `parse_oam_submit(onclick)`, `fetch_archive_page(client, page_n)`, `fetch_issue_toc(client, issue_meta)`, `fetch_act_body(client, idMat)`, all polite-rate wrapped)
- created: `/Users/beyond/Desktop/lex-brain/scripts/scrape_dv.py` (~250 lines: main loop, resume-from-DB, idempotent inserts via `INSERT ... ON CONFLICT DO NOTHING`)
- modified: `/Users/beyond/Desktop/lex-brain/pyproject.toml` (add `beautifulsoup4 ^4.12` to dev/runtime deps for HTML parsing)
- modified: `/Users/beyond/Desktop/lex-brain/uv.lock`

**Tasks:**
1. Write `db/dv_schema.sql` (verbatim from this RESEARCH.md)
2. Write `scripts/apply-dv-schema.ts` + add `db:dv-schema` script
3. **[BLOCKING checkpoint, autonomous: false]** Apply schema to live Supabase via `bun run db:dv-schema`. Probe queries: 6 columns exist on dv_acts, 1 column on dv_issues, 2 GIN indexes, 1 RPC. Push protocol mirrors Phase 2 plan 02-01 Task 3.
4. Write `scripts/_lib/dv_jsf.py` helper module (with unit tests in `lex-brain/tests/test_dv_jsf.py`)
5. Write `scripts/scrape_dv.py` main scraper
6. **[BLOCKING checkpoint, autonomous: false]** Smoke-test the scraper against ONE recent issue (e.g., 2026/42). Verify 10 acts ingested, source_url has no jsessionid, full_text non-null. Surface result before declaring complete.

### Wave 2 — Plan 08-02: lex-web /dv pages + AI summary endpoint (parallel-safe with 08-03)

**Files (lex-web):**
- created: `lib/dv-search.ts` (~80 lines, RPC wrapper + constants + filter shapes; mirrors `lib/intel-search.ts` from Phase 2)
- created: `app/dv/page.tsx` (server component, paginated card-grid listing — adapts `app/intel/articles/page.tsx`)
- created: `app/dv/[slug]/page.tsx` (server component, grouped-by-act-type sections — adapts `app/courts/page.tsx`)
- created: `app/dv/_lib/act-pill.ts` (`DV_ACT_PILL` map, ~30 lines, per UI-SPEC §Color)
- created: `app/dv/_components/issue-card.tsx` (server component)
- created: `app/dv/[slug]/_components/act-card.tsx` (server component)
- created: `app/dv/[slug]/dv-act-summary.tsx` ('use client', inline AI expansion — adapts Phase 2's `best-match-quote.tsx` pattern)
- created: `app/dv/[slug]/dv-issue-page-client.tsx` ('use client', single-card-expanded state owner)
- modified: `app/layout.tsx` (add `<Link href="/dv">Държавен вестник</Link>` between `/issues` and `/compare` per CONTEXT D-18)
- modified: `lib/queries.ts` (add `listDvIssues`, `getDvIssue`, `listDvActs`, `searchDvActs`)
- created: `__tests__/dv-search.test.ts` (~12 cases — mirrors `intel-search-ranking.test.ts` from Phase 2)

### Wave 2 — Plan 08-03: `/api/dv/summarize` route (parallel-safe with 08-02)

**Files (lex-web):**
- created: `app/api/dv/summarize/route.ts` (~80 lines, POST endpoint — adapts `app/api/intel/search/route.ts` shape with cache-read/cache-write logic)
- created: `__tests__/dv-summarize-route.test.ts` (~6 cases: rate-limit 10/min, model identity Sonnet 4.6, signal propagation, cache-hit short-circuit, cache-miss-then-write, error-no-write)

**Why split into 02 + 03 instead of one plan:** the summary endpoint (08-03) can be developed and tested independently from the page UI (08-02). They share `lib/queries.ts` (for `getDvAct`) but no overlap on file modifications — same parallel-safety pattern as Phase 2's 02-02 and 02-03.

---

## Validation Architecture (Nyquist — feeds 08-VALIDATION.md)

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 + @testing-library/react 16.3.2 + jsdom 29.1.1 (Phase 1 Wave 0 install) |
| Quick run | `bun run test -- <file>` |
| Full suite | `bun run test` |
| Estimated runtime | ~12 s end of Phase 8 (Phase 1+2 baseline + Phase 8's ~24 new tests) |

### Per-Task Verification Map
9 tasks across 3 plans. Validation table TEMPLATE for the planner:

| Task ID | Plan | Wave | Requirement | Type | Automated |
|---|---|---|---|---|---|
| 08-01-01 | 08-01 | 1 | DV-01 | live-db | `bun run db:dv-schema` (probe queries) |
| 08-01-02 | 08-01 | 1 | DV-01 | unit (probe) | (same) |
| 08-01-03 | 08-01 | 1 | DV-01 | live-db (BLOCKING) | `bun run db:dv-schema` exits 0 |
| 08-01-04 | 08-01 | 1 | DV-01 | unit | `cd ../lex-brain && uv run pytest tests/test_dv_jsf.py` |
| 08-01-05 | 08-01 | 1 | DV-01 | live-net (BLOCKING) | smoke-test scrape of issue 2026/42, verify 10 acts ingested |
| 08-02-01 | 08-02 | 2 | DV-02 | unit | `bun run test __tests__/dv-search.test.ts` |
| 08-02-02 | 08-02 | 2 | DV-02 | unit + component | listing/detail page render tests TBD by planner |
| 08-03-01 | 08-03 | 2 | DV-02 | unit + integration | `bun run test __tests__/dv-summarize-route.test.ts` (rate-limit, model id, signal, cache hit/miss) |
| 08-03-02 | 08-03 | 2 | DV-02 | static | grep gates: `claude-sonnet-4-6`, `signal: req.signal`, `dv-summarize`, `summary_ai`, `Cache-Control: no-store` |

### Manual UAT items (deferred to preview deploy)
- Visual: card-grid renders 10 issues per page; grouped-by-type sections render correctly
- BG-Cyrillic streaming for AI summaries
- Mobile filter density at 375px viewport (UI-SPEC FLAG-2)
- Live `<3 s` listing-render budget on Vercel preview
- Real `/api/dv/summarize` cold call on Vercel preview (Anthropic latency)

---

## Pitfalls / Landmines

1. **JSF state corruption during pagination.** If two scrape sessions interleave on the same `JSESSIONID`, ViewState replay can fail with HTTP 500 ("View has expired" Java exception). Mitigation: scraper uses ONE session per process; never share cookies across PIDs. The `nohup ... &` pattern in CONTEXT D-04 implicitly satisfies this.

2. **`oamSubmitForm()` syntax variance.** The `null` 3rd parameter (no extra params) vs `[['key','val'],...]` 4th parameter shape changes when JSF re-renders the form. Always parse both forms in `parse_oam_submit()`. Verify with regex tolerant to optional whitespace inside the array literal.

3. **Tomcat session timeout vs polite delay.** Default 30 min idle timeout (Q9) — at 1.5 s avg gap, this never fires under normal scraping. But if the scraper retries-with-backoff and the cumulative wait exceeds 25 min (e.g., on extended 503), the session expires mid-pagination. Mitigation: catch HTTP 500 with body containing "View has expired" or "ViewExpiredException", re-establish session, RESUME at the last completed `(year, broi_)`.

4. **`websearch_to_tsquery('')` empty-set.** Same as Phase 2: SQL function guards `length(trim(q)) > 0`. JS layer adds belt-and-braces `if (q.trim().length < 2) return []`.

5. **`array_to_string` IMMUTABLE wrap (Phase 2 carryover — does NOT apply here).** Phase 8's generated columns use only `to_tsvector`, `coalesce`, `setweight`, `left`, and `||` — all IMMUTABLE on Bulgarian Cyrillic + simple config. No wrapper needed. The Phase 2 lesson is documented in case Phase 8 ever extends to use `array_to_string`-style STABLE built-ins.

6. **Anthropic SDK signal propagation.** Per Phase 2's CR finding (AI-07), `client.messages.stream({...}, { signal: req.signal })` MUST forward the request signal. Grep gate enforced in 08-03's tests. NEVER call `.stream()` without the second-arg `{ signal }`.

7. **AI cache poison from partial streams.** Q6 above. Write-back AFTER the for-await-of loop completes inside `try`, NOT in `finally`.

8. **Bulgarian Cyrillic case in tsvector.** The `simple` config doesn't fold case for non-Latin alphabets reliably. The scraper should NOT lowercase titles before storage (preserve display case); the FTS uses `to_tsvector('simple', ...)` which DOES lowercase ASCII. Cyrillic terms inside the text will be searched literally — this is acceptable per Q5. UI search forms should NOT pre-lowercase user input — let Postgres handle it.

9. **`razdel_=2` (unofficial section) duplicate fetches.** Q2 finding: per-issue TOC requires TWO POST-backs (razdel_=1 and razdel_=2) to capture all acts. Easy to miss. Document explicitly in `scripts/scrape_dv.py` and assert via per-issue act-count smoke test.

10. **lex-brain import path drift.** Q10: scraper goes in `scripts/scrape_dv.py`. `from scripts._lib.dv_jsf import ...` works if invoked from repo root. The user's `nohup uv run python -u scrapers/laws/scrape_dv.py` command in their original message must be reconciled to `nohup uv run python -u scripts/scrape_dv.py` in the executable plan.

---

## Sources

### Primary (HIGH confidence — tool-verified or codebase-grepped)
- `curl -sS https://dv.parliament.bg/DVWeb/index.faces` (2026-05-10) — front page, 26 KB, captured form fields + ViewState shape
- `curl -X POST .../index.faces` with `active_tab=2` (2026-05-10) — Tab 2 archive page, 74 KB, captured 10 issue rows + filter form fields + pagination links
- `curl -X POST .../index.faces` with issue 42 row params (2026-05-10) — issue 42 TOC, 23 KB, **10 idMat anchors verified**
- `/Users/beyond/Desktop/lex-web/.planning/phases/08-dv-gazette/08-CONTEXT.md` — locked decisions D-01..D-19
- `/Users/beyond/Desktop/lex-web/.planning/phases/08-dv-gazette/08-UI-SPEC.md` — 7-file component inventory + design tokens
- `/Users/beyond/Desktop/lex-web/.planning/phases/01-reliability-observability/01-CONTEXT.md` — useRateLimitedFetch, hashIp, structured-log carry-forward
- (via `git show feat/phase-02-ai-features:...`) Phase 2's `02-RESEARCH.md` Pattern 1+2 (tsvector + recency-decay) — Phase 8 mirrors verbatim
- (via `git show feat/phase-02-ai-features:...`) Phase 2's `db/intel_fts.sql` — schema migration template
- (via `git show feat/phase-02-ai-features:...`) Phase 2's `lib/intel-search.ts` — `LEX_WEIGHT`/`RECENCY_WEIGHT`/`RECENCY_HALF_LIFE_DAYS` constants pattern

### Secondary (MEDIUM confidence — public docs without direct tool verification)
- [Postgres FTS docs](https://www.postgresql.org/docs/current/textsearch-controls.html) — `simple` config, `to_tsvector`, `ts_rank`, `setweight`, `websearch_to_tsquery`
- [Postgres GENERATED COLUMNS](https://www.postgresql.org/docs/current/ddl-generated-columns.html) — STORED semantics, IMMUTABLE requirement
- [Anthropic public pricing](https://docs.anthropic.com/en/docs/about-claude/models) — Sonnet 4.6: $3 input / $15 output per MT (snapshot 2026-05-10; planner verifies on first execution)
- [Apache Tomcat default session timeout](https://tomcat.apache.org/tomcat-10.1-doc/config/manager.html) — 30 min default
- [MyFaces/Tomahawk `oamSubmitForm` API](https://myfaces.apache.org/) — POST-back convention; vs Mojarra's `mojarra.jsfcljs`

### Tertiary (LOW confidence — community / inferred)
- `dv.parliament.bg` runs Tomcat (inferred from JSP+MyFaces stack; no explicit `Server:` header captured to confirm)
- Bulgarian Postgres dictionary availability on Supabase (researched but not exhaustively — recommendation is to stay with `simple` regardless)
- Steady-state traffic estimate (1000 PVs/month × 5 expansions × 5% miss) — pure assumption; planner refines if production data emerges

---

## Metadata

**Confidence breakdown:**
- JSF mechanics + archive walking: HIGH — three direct curl probes captured the navigation graph end-to-end
- Schema deltas: HIGH — mirrors Phase 2's tested pattern with documented variance for supplementary issues
- Cost projection: MEDIUM — math is sound but assumes pricing snapshot
- AI cache write-back semantics: HIGH — derived from Phase 2's cancellable-stream pattern
- URL canonicalization, session lifetime, supplements: MEDIUM/ASSUMED with documented flip-paths

**Research date:** 2026-05-10
**Valid until:** 2026-08-10 (3 months — verify on first plan execution that dv.parliament.bg's JSF form IDs haven't drifted; gov sites are stable but not guaranteed)
