# Phase 8: Държавен вестник scraper + browser — Pattern Map

**Mapped:** 2026-05-10
**Files analyzed:** 18 (lex-web: 14 new + 2 modified; lex-brain: 2 new + 2 modified)
**Analogs found:** 14 / 18 strong, 2 partial, 2 no-precedent
**Working branch:** `feat/phase-01-reliability` — Phase 2 has not merged here yet, so all "Phase 2" patterns referenced in RESEARCH.md must be reproduced from on-branch precedents.

---

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| **Wave 1 — Plan 08-01 (schema + scraper)** | | | | |
| `db/dv_schema.sql` (NEW) | migration / DDL | batch-DDL | `scripts/schema.sql` | partial (idempotent-DDL idiom only) |
| `scripts/apply-dv-schema.ts` (NEW) | applier / config | batch | `scripts/apply-schema.ts` | exact (role + flow) |
| `package.json` (MODIFIED) | config | n/a | existing `scripts` block | exact |
| **lex-brain side** | | | | |
| `/Users/beyond/Desktop/lex-brain/scripts/_lib/dv_jsf.py` (NEW) | helper module | request-response | `scripts/_lib/http_retry.py` | role-match (helper module shape) |
| `/Users/beyond/Desktop/lex-brain/scripts/scrape_dv.py` (NEW) | scraper main | streaming + batch DB writes | `scripts/scrape_opensanctions.py` | exact (role) |
| `/Users/beyond/Desktop/lex-brain/pyproject.toml` (MODIFIED) | config | n/a | n/a | n/a |
| **Wave 2 — Plan 08-02 (lex-web pages)** | | | | |
| `lib/dv-search.ts` (NEW) | service / RPC wrapper | request-response | `lib/queries.ts` (RPC helpers `searchArticles`, `searchDecisions`) | partial (Phase 2 `lib/intel-search.ts` is on a different branch) |
| `app/dv/page.tsx` (NEW) | server component / page | request-response | `app/intel/articles/page.tsx` | exact |
| `app/dv/[slug]/page.tsx` (NEW) | server component / page | request-response | `app/audit/page.tsx` (grouped sections) | exact (multi-section grouping) |
| `app/dv/_lib/act-pill.ts` (NEW) | utility / map | n/a | `app/audit/page.tsx` lines 11–25 (`SEV_BADGE` Record map) | exact (Record<string,string> idiom) |
| `app/dv/_components/issue-card.tsx` (NEW) | server component | n/a | `app/audit/page.tsx:145` finding-card primitive + `app/intel/articles/page.tsx:53` list-item card | exact |
| `app/dv/[slug]/_components/act-card.tsx` (NEW) | client component (owns AI fetch) | request-response | `app/intel/articles/page.tsx:53–80` (per-record card with link) | role-match |
| `app/dv/[slug]/dv-act-summary.tsx` (NEW, 'use client') | client / streaming consumer | streaming | `app/intel/search/intel-search-summary.tsx` | exact (line-for-line state machine) |
| `app/dv/[slug]/dv-issue-page-client.tsx` (NEW, 'use client') | client / state container | event-driven | none — minimal `useState` shell wrapping toast + section list | no precedent |
| `app/layout.tsx` (MODIFIED) | layout | n/a | `app/layout.tsx` lines 65–106 (existing nav) | exact (in-place insertion) |
| `lib/queries.ts` (MODIFIED) | service / data | CRUD | existing helpers `getAuditFindings`, `listInvestigativeArticles`, `listCourtDecisions`, `getCourtDecision` | exact |
| `__tests__/dv-search.test.ts` (NEW) | test | n/a | `__tests__/rate-limit.test.ts` + `__tests__/use-rate-limited-fetch.test.tsx` (vitest shape) | role-match |
| **Wave 2 — Plan 08-03 (AI route)** | | | | |
| `app/api/dv/summarize/route.ts` (NEW) | controller / API route | streaming POST | `app/api/intel/search/route.ts` + `app/api/eu/summarize/[celex]/route.ts` | exact (composite) |
| `__tests__/dv-summarize-route.test.ts` (NEW) | test | n/a | `__tests__/rate-limit.test.ts` | role-match |

---

## Pattern Assignments

### `db/dv_schema.sql` (NEW migration)

**Analog:** `scripts/schema.sql` (only on-branch idempotent-DDL precedent — `db/intel_fts.sql` referenced in CONTEXT/RESEARCH lives on Phase 2's branch and is NOT on this branch).

**Idempotent-DDL idiom — copy verbatim** (`scripts/schema.sql` lines 1–16):
```sql
-- lex-web schema migration: analyses, issues, alerts
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS law_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  law_slug text NOT NULL,
  ...
  UNIQUE (law_slug, analyzed_at)
);
```

**Index pattern** (`scripts/schema.sql` lines 36–41):
```sql
CREATE INDEX IF NOT EXISTS law_issues_analysis_id ON law_issues(analysis_id);
CREATE INDEX IF NOT EXISTS law_issues_law_slug ON law_issues(law_slug);
```

**Phase 8 must establish a new `db/` directory** — it does not exist on this branch (verified). The full SQL body is dictated by 08-RESEARCH.md §"Schema Deltas" (lines 256–361) — copy that block verbatim. The on-branch precedent provides only the convention: leading comment header + `IF NOT EXISTS` everywhere + `CREATE OR REPLACE FUNCTION` for the RPC.

---

### `scripts/apply-dv-schema.ts` (NEW)

**Analog:** `scripts/apply-schema.ts` — exact role match (one-shot pg-client schema applier with probe).

**Imports + connection pattern** (`scripts/apply-schema.ts` lines 1–19):
```typescript
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set in the environment.");
    process.exit(1);
  }

  const sqlPath = resolve(import.meta.dirname ?? "scripts", "schema.sql");
  const sql = readFileSync(sqlPath, "utf8");

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
```

**Probe + report pattern** (`scripts/apply-schema.ts` lines 20–32):
```typescript
  try {
    console.log(`Applying schema from ${sqlPath} to ${maskUrl(url)}…`);
    await client.query(sql);
    console.log("Schema applied successfully.");

    const tables = await client.query(
      `SELECT tablename FROM pg_tables WHERE tablename IN ('law_analyses','law_issues','law_alerts') ORDER BY tablename;`,
    );
    console.log("Tables present:", tables.rows.map((r) => r.tablename).join(", "));
  } finally {
    await client.end();
  }
```

**Url-mask + error trap** (`scripts/apply-schema.ts` lines 34–42):
```typescript
function maskUrl(u: string): string {
  return u.replace(/:[^@/]+@/, ":***@");
}

main().catch((err) => {
  console.error("Schema apply failed:", err);
  process.exit(1);
});
```

**Phase 8 deltas:** Path becomes `db/dv_schema.sql` (NOT `scripts/dv_schema.sql`). Probes (per Validation 08-01-02) must check: 6 columns on `dv_acts` (`search_vector`, `summary_ai`, `summary_ai_generated_at`, `razdel`, `issue_id`, `issue_supplement` if added there), 1 column on `dv_issues` (`search_vector`), 2 GIN indexes (`dv_acts_fts`, `dv_issues_fts`), 1 RPC (`dv_search_top`). Use `pg_indexes` + `pg_proc` + `information_schema.columns` queries (planner picks exact SQL).

---

### `package.json` (MODIFIED)

**Analog:** existing `scripts` block (lines 5–12 of `package.json`).

**Current shape:**
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest"
},
```

**Phase 8 insertion:** Add `"db:dv-schema": "tsx scripts/apply-dv-schema.ts"` (mirrors the existing single-line script convention). Note: `tsx` is not currently a devDependency on this branch — planner must verify whether to add it or invoke via `bunx tsx` (the existing `scripts/apply-schema.ts` has no `package.json` script entry, so the convention is unsettled — Phase 8 establishes it).

---

### `/Users/beyond/Desktop/lex-brain/scripts/_lib/dv_jsf.py` (NEW helper module)

**Analog:** `/Users/beyond/Desktop/lex-brain/scripts/_lib/http_retry.py` — role-match (sibling helper module under `_lib/`). Phase 1 D-12 lock: **DO NOT modify `http_retry.py`** — `dv_jsf.py` is a NEW append-only sibling.

**Module docstring + import pattern** (`http_retry.py` lines 1–43):
```python
"""HTTP retry helper shared by all httpx-using ``scripts/scrape_*.py``.

Generalises the backoff pattern previously embedded in ``scrape_eurlex_v2.py``
and ``scrape_olaf.py``. Per ``.planning/phases/02-scraper-resilience/02-CONTEXT.md``:

  D-01: backoff curve = 30s / 90s / 240s (3 retries, ~6 min worst case)
  D-02: retry on 5xx, 429, ``httpx.TimeoutException``, ``httpx.TransportError``
  ...
"""
from __future__ import annotations

import asyncio
import contextlib
import time
from typing import Any

import httpx
```

**`httpx.Client` usage in callers** (from `scrape_opensanctions.py` lines 38–41, 101–102):
```python
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; LexBrainBot/1.0; +https://lex-web-eta.vercel.app)",
    "Accept": "text/csv,*/*",
}
...
with httpx.Client(headers=HEADERS, follow_redirects=True, timeout=120) as client:
    with fetch_with_retry_stream(client, CSV_URL) as r:
```

**Phase 8 deltas for `dv_jsf.py`:**
- New UA per CONTEXT D-03: `lex-brain-scraper/1.0 (+https://lex-web-eta.vercel.app; non-commercial public-interest project)`
- `httpx.Client(cookies=..., follow_redirects=False)` (JSF state requires session cookies + manual redirect handling)
- Helpers per RESEARCH §"Files to Create" line 381: `extract_view_state(html)`, `parse_oam_submit(onclick)`, `fetch_archive_page(client, page_n)`, `fetch_issue_toc(client, issue_meta)`, `fetch_act_body(client, idMat)`
- Polite-rate wrapping (1.5 s + jitter ±500 ms per CONTEXT D-02) — INTERNAL to this module, NOT in `http_retry.py`
- Use `BeautifulSoup` (added to `pyproject.toml`) for HTML parsing

**Re-use** `fetch_with_retry_sync` from `http_retry.py` directly — DV scraper's per-request retry semantics are identical to other scrapers (5xx, 429, TimeoutException, TransportError → 30/90/240 s backoff). Add Tomcat-specific "View has expired" recovery on top (catch HTTP 500 with body `"ViewExpiredException"`, re-establish session, resume from last completed `(year, broi_)`).

---

### `/Users/beyond/Desktop/lex-brain/scripts/scrape_dv.py` (NEW)

**Analog:** `/Users/beyond/Desktop/lex-brain/scripts/scrape_opensanctions.py` — exact (resumable scraper writing to Supabase via psycopg2 with `INSERT ... ON CONFLICT DO NOTHING`).

**Imports + path bootstrap** (`scrape_opensanctions.py` lines 18–35):
```python
from __future__ import annotations

import csv
import io
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import httpx
import psycopg2
from dotenv import load_dotenv

from _lib.http_retry import fetch_with_retry_stream

load_dotenv(Path(__file__).parent.parent / ".env")
```

**DB-connection helper** (`scrape_opensanctions.py` lines 44–45):
```python
def get_pg():
    return psycopg2.connect(os.environ["DATABASE_URL"])
```

**Idempotent insert pattern** (`scrape_opensanctions.py` lines 143–158):
```python
try:
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO sanctioned_entities
               (name, entity_type, sanction_type, sanctioning_body,
                country, opensanctions_id)
               VALUES (%(name)s, %(entity_type)s, %(sanction_type)s,
                       %(sanctioning_body)s, %(country)s, %(opensanctions_id)s)
               ON CONFLICT (opensanctions_id) DO NOTHING
               RETURNING id""", rec,
        )
        inserted = cur.fetchone() is not None
    conn.commit()
except Exception as e:
    conn.rollback(); fail += 1
    print(f"    ! DB error {rec['opensanctions_id']}: {e}")
    continue
```

**Structured progress logging** (`scrape_opensanctions.py` lines 160–169):
```python
if inserted:
    ok += 1
    if ok <= 50 or ok % 50 == 0:
        print(f"    [{ok:>4}] {rec['entity_type']:<12} {rec['sanctioning_body']:<14} | {rec['name'][:80]}")
else:
    skip += 1
print(f"  finished streaming in {time.monotonic()-t0:.1f}s ({bg_count} BG rows seen)")
...
print(f"\n✓ OpenSanctions done. Bulgarian rows seen: {bg_count} | "
      f"Saved: {ok} | Skipped: {skip} | Failed: {fail}")
```

**Phase 8 deltas:**
- Resume-via-DB: at start, `SELECT issue_number, year FROM dv_issues` → set; query `SELECT id_mat FROM dv_acts WHERE full_text IS NOT NULL AND length(full_text) > 0` → set; skip these during walk (CONTEXT D-04).
- ON CONFLICT key for `dv_issues`: `ON CONFLICT (issue_number, year, issue_supplement) DO NOTHING`
- ON CONFLICT key for `dv_acts`: `ON CONFLICT (source_url) DO NOTHING` (per RESEARCH schema `source_url UNIQUE`)
- Termination boundary: `if date_izd_ < "2024-01-01": break` (CONTEXT D-01)
- `from _lib.dv_jsf import fetch_archive_page, fetch_issue_toc, fetch_act_body, extract_view_state, parse_oam_submit`
- Strip `jsessionid` from URLs before save (CONTEXT D-05): `url.split(";jsessionid=")[0]`

---

### `lib/dv-search.ts` (NEW)

**Analog:** `lib/queries.ts` `searchArticles` (lines 93–104) and `searchDecisions` (lines 490–518) — RPC wrapper shape. Phase 2's `lib/intel-search.ts` (with `LEX_WEIGHT`/`RECENCY_WEIGHT`/`RECENCY_HALF_LIFE_DAYS` constants) is **not on this branch** — the constants pattern is documented inline in 08-RESEARCH.md §"Schema Deltas" line 363; copy from there.

**RPC wrapper pattern** (`lib/queries.ts` lines 93–104):
```typescript
export async function searchArticles(query: string, limit = 50): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  // Defined as a Postgres function in db/schema.sql or via inline RPC.
  // Use Supabase's `rpc` to call a function `search_articles(q text, lim int)`.
  const { data, error } = await supabase.rpc("search_articles", {
    q: trimmed,
    lim: limit,
  });
  if (error) throw new Error(`searchArticles: ${error.message}`);
  return (data ?? []) as SearchHit[];
}
```

**RPC-with-fallback pattern** (`lib/queries.ts` lines 490–518) — useful if `dv_search_top` is missing during dev:
```typescript
export async function searchDecisions(
  query: string,
  limit = 5,
  courtCode?: string,
): Promise<CourtDecision[]> {
  try {
    const { data } = await supabase.rpc("search_decisions", {
      query,
      p_court: courtCode ?? null,
      p_year: null,
      lim: limit,
    });
    if (data && Array.isArray(data) && data.length > 0) {
      return data as CourtDecision[];
    }
  } catch {
    // RPC not available — fall through to ilike fallback.
  }
  let q = supabase
    .from("court_decisions")
    ...
}
```

**Phase 8 deltas:**
- Constants block at top of file (per RESEARCH §"Schema Deltas" line 363):
  ```typescript
  export const LEX_WEIGHT = 0.7;
  export const RECENCY_WEIGHT = 0.3;
  export const RECENCY_HALF_LIFE_DAYS = 365;
  ```
- Filter shape exported as a type matching the 7 RPC params: `q, filter_year, filter_act_type, filter_from_date, filter_to_date, filter_from_issue, filter_to_issue, limit_n`
- Belt-and-braces guard `if (q.trim().length < 2) return []` (RESEARCH Pitfall 4)
- Return type matches the RPC's `RETURNS TABLE(...)` shape from RESEARCH lines 318–328

---

### `app/dv/page.tsx` (NEW listing page, server component)

**Analog:** `app/intel/articles/page.tsx` — exact (paginated card listing with `searchParams: Promise<{...}>`, GET-querystring filter form, BG header, dark stone theme, pagination block).

**Page shell + metadata** (`app/intel/articles/page.tsx` lines 1–19):
```typescript
import Link from "next/link";
import { listInvestigativeArticles } from "@/lib/queries";

export const revalidate = 600;
export const metadata = { title: "Разследващи статии — Разузнавателен център" };

const PAGE_SIZE = 30;

type Props = { searchParams: Promise<{ q?: string; tag?: string; page?: string }> };

export default async function ArticlesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page) || 0);
  const { items, total } = await listInvestigativeArticles({
    search: sp.q?.trim() || undefined,
    tag: sp.tag || undefined,
    page, pageSize: PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
```

**Page chrome — outer container + breadcrumb + header** (`app/intel/articles/page.tsx` lines 21–34):
```tsx
<div className="bg-stone-950 text-stone-100 min-h-screen">
  <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
    <nav className="text-xs text-stone-400 mb-3">
      <Link href="/intel" className="hover:underline">← Разузнавателен център</Link>
    </nav>
    <header className="border-b border-stone-800 pb-5">
      <h1 className="font-serif text-3xl font-semibold">Разследваща журналистика</h1>
      <p className="mt-2 text-sm text-stone-400">
        {total.toLocaleString("bg-BG")} статии (само индекс). ...
      </p>
    </header>
```

**GET-querystring filter form** (`app/intel/articles/page.tsx` lines 35–46):
```tsx
<form action="/intel/articles" method="get" className="mt-6 flex flex-wrap gap-2">
  <input name="q" defaultValue={sp.q ?? ""} placeholder="Търсене по заглавие…"
    className="flex-1 min-w-[200px] rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm" />
  <input name="tag" defaultValue={sp.tag ?? ""} placeholder="Таг"
    className="w-32 rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm" />
  <button className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium hover:bg-red-600">
    Филтрирай
  </button>
  {(sp.q || sp.tag) && (
    <Link href="/intel/articles" className="text-xs text-stone-400 hover:underline self-center">↻ Изчисти</Link>
  )}
</form>
```

**Pagination block** (`app/intel/articles/page.tsx` lines 84–100) — copy verbatim, swap path:
```tsx
{totalPages > 1 && (
  <nav className="mt-6 flex items-center justify-between text-xs text-stone-400">
    {page > 0 ? (
      <Link className="hover:text-stone-100"
        href={`/intel/articles?${sp.q ? `q=${encodeURIComponent(sp.q)}&` : ""}${sp.tag ? `tag=${encodeURIComponent(sp.tag)}&` : ""}page=${page - 1}`}>
        ← По-нови
      </Link>
    ) : <span />}
    <span>Стр. {page + 1} от {totalPages}</span>
    {page < totalPages - 1 ? (
      <Link className="hover:text-stone-100"
        href={`/intel/articles?${sp.q ? `q=${encodeURIComponent(sp.q)}&` : ""}${sp.tag ? `tag=${encodeURIComponent(sp.tag)}&` : ""}page=${page + 1}`}>
        По-стари →
      </Link>
    ) : <span />}
  </nav>
)}
```

**Helper for shared querystring building** — see `app/intel/sanctions/page.tsx` lines 15–22 (`buildHref` helper) for a cleaner pattern to copy when filter count grows past 2:
```tsx
function buildHref(base: Record<string, string | undefined>,
                   patch: Record<string, string | undefined>): string {
  const merged = { ...base, ...patch };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `/intel/sanctions?${qs}` : "/intel/sanctions";
}
```

**Phase 8 deltas:**
- `searchParams` type covers all 6 filter dimensions (CONTEXT D-11): `q`, `act_type`, `year`, `date_from`, `date_to`, `issue_from`, `issue_to`, `page`
- Two-row filter region per UI-SPEC §"`/dv` Filter Layout" — Row 1 = act-type chips (FilterPill from audit/page.tsx lines 306–319), Row 2 = year/date/issue refinements (intel/articles input style)
- Card grid `grid grid-cols-1 md:grid-cols-2 gap-4` (UI-SPEC §"Layout" → `/dv` Listing — Card Grid)
- Footer attribution `<div>` (UI-SPEC line 528–537) — NOT `<footer>` (must print)

---

### `app/dv/[slug]/page.tsx` (NEW detail page, server component)

**Analog:** `app/audit/page.tsx` — multi-section grouped layout (sections per `domain`, sorted by `domain_order`, with heading + count badge + cards).

**Note correction:** `app/courts/page.tsx` referenced in CONTEXT/UI-SPEC is actually a **3-tile court hub** (lines 79–117), NOT a multi-section detail page. The true grouped-by-attribute analog on this branch is `app/audit/page.tsx`.

**Slug parsing pattern** (RESEARCH Q8 — `/dv/2026-42`):
```typescript
type Props = { params: Promise<{ slug: string }> };
export default async function DvIssuePage({ params }: Props) {
  const { slug } = await params;
  const [yearStr, issueStr] = slug.split("-");
  const year = Number(yearStr);
  const issue = Number(issueStr);
  if (!Number.isFinite(year) || !Number.isFinite(issue)) notFound();
  ...
}
```

**Group-by-key pattern** (`app/audit/page.tsx` lines 68–73):
```typescript
// group by domain in stable domain_order
const groups = new Map<string, AuditFinding[]>();
for (const f of findings) {
  if (!groups.has(f.domain)) groups.set(f.domain, []);
  groups.get(f.domain)!.push(f);
}
```

**Per-section render** (`app/audit/page.tsx` lines 135–152):
```tsx
{findings.length === 0 ? (
  <p className="mt-12 text-sm text-stone-500">
    Все още няма генерирани находки за този филтър.
  </p>
) : (
  <div className="mt-8 space-y-10">
    {[...groups.entries()].sort((a, b) =>
      (a[1][0]?.domain_order ?? 0) - (b[1][0]?.domain_order ?? 0)
    ).map(([domain, items]) => (
      <section key={domain} className="break-inside-avoid">
        <h2 className="font-serif text-xl font-semibold text-red-300 border-b border-stone-800 pb-2">
          {domain} <span className="text-xs uppercase tracking-wider text-stone-500 ml-2">{items.length}</span>
        </h2>
        <ul className="mt-4 space-y-4">
          {items.sort((a, b) => sevWeight(a.severity) - sevWeight(b.severity)).map((f) => (
            <li key={f.id} className={`rounded-lg border p-5 ${SEV_CARD[f.severity]}`}>
              <FindingCard f={f} />
            </li>
          ))}
        </ul>
      </section>
    ))}
  </div>
)}
```

**Header + stats row** (`app/audit/page.tsx` lines 78–97) — copy verbatim, swap copy:
```tsx
<header className="border-b border-stone-800 pb-6">
  <p className="text-xs uppercase tracking-[0.18em] text-red-400 font-medium">
    Национален правен одит
  </p>
  <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-semibold tracking-tight">
    Критичен анализ на българската правна система
  </h1>
  <p className="mt-3 max-w-2xl text-sm text-stone-300">
    AI прокурор анализира {stats.domains.toLocaleString("bg-BG")} правни домейна, ...
  </p>
</header>

<ul className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm">
  <Stat n={stats.КРИТИЧНО} label="критични" tone="red" />
  ...
</ul>
```

**Phase 8 deltas:**
- **NO red-tinted H2** — UI-SPEC §"Color → Accent must NOT" (line 117) explicitly bans `text-red-300` on section headings on `/dv`. Use `text-stone-100`. The audit-page red-section pattern is reserved for the audit corpus.
- Section order is fixed per CONTEXT D-09: Закони → Наредби → Постановления → Укази → Решения → Обявления → Other (NOT alphabetical, NOT by count). Use a constant `SECTION_ORDER: string[]` and sort the Map entries by `SECTION_ORDER.indexOf(act_type)`.
- Use `notFound()` from `next/navigation` for the 404 path (UI-SPEC line 426 + Next 16 `not-found.tsx` convention).
- Wrap section list in `<DvIssuePageClient>` (NEW client component) which owns `expandedActId` state + `<RateLimitToast>`.

---

### `app/dv/_lib/act-pill.ts` (NEW)

**Analog:** `app/audit/page.tsx` lines 11–25 — three coupled `Record<string, string>` maps (`SEV_BADGE`, `SEV_CARD`, `SEV_DOT`). Phase 2's `SOURCE_PILL` triplet is **not on this branch** — `SEV_BADGE` is the closest existing typed-map idiom.

**Record-typed map pattern** (`app/audit/page.tsx` lines 11–25):
```typescript
const SEV_BADGE: Record<string, string> = {
  "КРИТИЧНО": "bg-red-700 text-white",
  "СЕРИОЗНО": "bg-orange-600 text-white",
  "УМЕРЕНО":  "bg-yellow-500 text-yellow-950",
};
const SEV_CARD: Record<string, string> = {
  "КРИТИЧНО": "border-red-700/50 bg-red-950/20",
  "СЕРИОЗНО": "border-orange-700/40 bg-orange-950/15",
  "УМЕРЕНО":  "border-yellow-700/30 bg-yellow-950/10",
};
const SEV_DOT: Record<string, string> = {
  "КРИТИЧНО": "bg-red-500",
  "СЕРИОЗНО": "bg-orange-500",
  "УМЕРЕНО":  "bg-yellow-400",
};
```

**Phase 8 file shape (per UI-SPEC §"`DV_ACT_PILL` — NEW: 5 hues + 1 fallback"):**
```typescript
// app/dv/_lib/act-pill.ts
export const DV_ACT_PILL: Record<string, string> = {
  "Закон":          "bg-red-950/40 text-red-300 ring-1 ring-red-800/40",
  "Указ":           "bg-amber-950/40 text-amber-300 ring-1 ring-amber-800/40",
  "Постановление":  "bg-sky-950/40 text-sky-300 ring-1 ring-sky-800/40",
  "Наредба":        "bg-indigo-950/40 text-indigo-300 ring-1 ring-indigo-800/40",
  "Решение":        "bg-teal-950/40 text-teal-300 ring-1 ring-teal-800/40",
};

const FALLBACK = "bg-stone-800/60 text-stone-300 ring-1 ring-stone-700/40";

export function actTypePill(actType: string | null | undefined): string {
  if (!actType) return FALLBACK;
  return DV_ACT_PILL[actType] ?? FALLBACK;
}

// Pill geometry copy-string (verbatim Phase 2 / UI-SPEC line 142):
export const PILL_GEOMETRY = "px-1.5 py-0.5 text-xs uppercase tracking-wider rounded-[2px]";
```

---

### `app/dv/_components/issue-card.tsx` (NEW server component)

**Analog (card primitive):** `app/audit/page.tsx` line 145 — the inline card primitive `rounded-lg border p-5` with severity-tinted background.
**Analog (link-wrapped card):** `app/intel/articles/page.tsx` lines 53–80 — list-item with meta row + title.

**Card primitive class string** — UI-SPEC line 211–218 dictates it verbatim:
```tsx
<Link
  href={`/dv/${year}-${issue_number}`}
  className="block rounded-lg border border-stone-800 bg-stone-900/40 p-5
             hover:border-red-500/50 hover:bg-stone-900/60
             focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500/30
             transition-colors"
>
  ...
</Link>
```

**Meta-row pattern** (`app/intel/articles/page.tsx` lines 54–58) — adapt for DV:
```tsx
<div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
  {a.source && <span className="rounded bg-stone-800 px-2 py-0.5 text-stone-300">{a.source}</span>}
  {a.author && <span>{a.author}</span>}
  {a.date && <span className="ml-auto">{a.date}</span>}
</div>
```

**Tags / pill row** (`app/intel/articles/page.tsx` lines 69–77) — adapt for DV's top-3 + overflow:
```tsx
{a.tags && a.tags.length > 0 && (
  <div className="mt-2 flex flex-wrap gap-1">
    {a.tags.slice(0, 8).map((t) => (
      <Link key={t} href={`/intel/articles?tag=${encodeURIComponent(t)}`}
        className="rounded bg-stone-800 px-1.5 py-0.5 text-[10px] text-stone-400 hover:bg-stone-700 hover:text-stone-100">
        #{t}
      </Link>
    ))}
  </div>
)}
```

**Phase 8 content** (per UI-SPEC §"Issue card content + ordering"):
```tsx
<span className="font-serif text-2xl font-semibold tabular-nums">Бр. {issue.issue_number}</span>
<span className="text-xs text-stone-500">{formatDate(issue.date)}</span>
<p className="text-sm text-stone-400">{actCount} {pluralize(actCount, "акт", "акта")}</p>
<div className="flex flex-wrap gap-1 mt-2">
  {top3Pills.map(...)}
  {extraTypeCount > 0 && <span className="text-xs text-stone-500">+ {extraTypeCount} още</span>}
</div>
```

---

### `app/dv/[slug]/_components/act-card.tsx` (NEW client component)

**Analog:** `app/intel/articles/page.tsx` lines 53–80 (list-item card with meta + title + per-record link). Must be `'use client'` because it owns the AI-summary expansion (per UI-SPEC line 571).

**Card primitive (UI-SPEC §"Act card on `/dv/[issue]`" lines 282–304):**
```tsx
<div className="rounded-lg border border-stone-800 bg-stone-900/40 p-5">
  <div className="flex flex-wrap items-center gap-2 text-xs">
    <span className={`${PILL_GEOMETRY} ${actTypePill(act.act_type)}`}>{act.act_type}</span>
    <span className="text-stone-500">idMat: {act.idMat}</span>
    {act.date && <span className="ml-auto text-stone-500">{formatDate(act.date)}</span>}
  </div>
  <h3 className="mt-2 font-serif text-base font-semibold leading-snug">{act.title}</h3>
  <div className="mt-3 flex items-center gap-3 text-sm">
    <button onClick={onExpandClick}
      className="inline-flex items-center gap-1 text-sm font-medium text-red-400 hover:text-red-300 print:hidden">
      ✦ AI обобщение
    </button>
    <a href={act.source_url} target="_blank" rel="noreferrer noopener"
       className="inline-flex items-center gap-1 text-sm text-stone-400 hover:text-red-300 hover:underline">
      ↗ Оригинал
    </a>
  </div>
  {expanded && <DvActSummary actId={act.id} ... />}
</div>
```

**External-link pattern** (`app/intel/articles/page.tsx` lines 60–63) for `↗ Оригинал`:
```tsx
<a href={a.url} target="_blank" rel="noreferrer" className="hover:text-red-300 hover:underline">
  {a.title} ↗
</a>
```

**Phase 8 deltas:** UI-SPEC §"`↗ Оригинал` link" specifies `rel="noreferrer noopener"` (both, not just `noreferrer`). Glyph `↗` AFTER text not before.

---

### `app/dv/[slug]/dv-act-summary.tsx` (NEW, 'use client', streaming consumer)

**Analog:** `app/intel/search/intel-search-summary.tsx` — exact (line-for-line state machine + useRateLimitedFetch + TextDecoder + ARIA-live debouncing).

**Imports + state machine** (`intel-search-summary.tsx` lines 1–14, 67–72):
```typescript
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRateLimitedFetch } from "@/lib/use-rate-limited-fetch";
import { RateLimitToast } from "@/app/components/rate-limit-toast";

...

export function IntelSearchSummary({...}) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "streaming" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const rl = useRateLimitedFetch();
```

**Submit + stream-read loop** (`intel-search-summary.tsx` lines 73–124):
```typescript
useEffect(() => {
  if (startedRef.current) return;
  startedRef.current = true;
  setStatus("streaming");
  (async () => {
    const result = await rl.submit("/api/intel/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, counts, samples }),
    });
    if (!result.ok) {
      if ("rateLimited" in result) {
        // Toast handles the 429; re-arm so a retry after 0 can fire.
        startedRef.current = false;
        setStatus("idle");
        return;
      }
      if ("aborted" in result) return;
      setError(result.error);
      setStatus("error");
      return;
    }
    const { response, signal } = result;
    if (!response.body) {
      setError("Празен отговор");
      setStatus("error");
      rl.finish();
      return;
    }
    try {
      const reader = response.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      while (true) {
        if (signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setText(acc);
      }
      setStatus("done");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    } finally {
      rl.finish();
    }
  })();
  return () => rl.cancel();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [query, counts, samples]);
```

**Streaming cursor + region** (`intel-search-summary.tsx` lines 126–149):
```tsx
return (
  <>
    <RateLimitToast state={rl.rateLimited} onDismiss={rl.dismissRateLimited} />
    <div className="rounded-lg border border-red-800/40 bg-red-950/15 p-5">
      <div className="text-xs uppercase tracking-wider text-red-400 font-medium mb-2">
        ✦ AI обобщение
      </div>
      {status === "streaming" && text === "" && (
        <p className="text-sm text-stone-400 italic animate-pulse">Анализирам...</p>
      )}
      {status === "error" && (
        <p className="text-sm text-red-300">Грешка: {error}</p>
      )}
      {text && (
        <div className="text-stone-100">
          {renderMarkdown(text)}
          {status === "streaming" && (
            <span className="ml-1 inline-block h-3 w-2 animate-pulse bg-red-500 align-middle" />
          )}
        </div>
      )}
    </div>
  </>
);
```

**Markdown renderer** — copy `renderInline` (lines 16–27) and `renderMarkdown` (lines 29–62) verbatim from `intel-search-summary.tsx`. They are 47 lines of pure-function code with no dependencies.

**Phase 8 deltas (per UI-SPEC §"Streaming cursor" + §"`aria-live` debouncing"):**
- POST URL: `/api/dv/summarize`
- POST body: `{ actId: string }` (NOT `{ query, counts, samples }`)
- ADD ARIA-live debounce span (UI-SPEC line 369–376; NOT present in current `intel-search-summary.tsx` because Phase 2 added it on a separate branch):
  ```tsx
  {status === "done" && (
    <span className="sr-only" aria-live="polite">
      AI обобщението е готово. {text.slice(0, 40)}…
    </span>
  )}
  ```
- ADD "Скрий" button when `status === 'done'` (UI-SPEC §"`Скрий` button"):
  ```tsx
  {status === "done" && (
    <button onClick={onCollapse} className="text-xs text-stone-400 hover:text-stone-100 hover:underline ml-auto print:hidden">
      Скрий
    </button>
  )}
  ```
- Inner border/bg different from intel: `mt-4 border-t border-stone-800 pt-3` (this region nests INSIDE the act card; not a standalone red-bordered box like intel-search). UI-SPEC line 297.

---

### `app/dv/[slug]/dv-issue-page-client.tsx` (NEW, 'use client', state container)

**Analog:** None on branch. Closest precedent for `'use client'` thin state-owner is the implicit pattern in `intel-search-summary.tsx` (lines 64–70) — `useState` + `useRef` shell. This is small enough that no copy-block is needed; planner specifies the shape inline.

**Phase 8 shape (per UI-SPEC §"Single-card-expanded constraint" line 306):**
```typescript
"use client";

import { useState, type ReactNode } from "react";
import { RateLimitToast } from "@/app/components/rate-limit-toast";
import { useRateLimitedFetch } from "@/lib/use-rate-limited-fetch";

export function DvIssuePageClient({ children }: { children: (props: {
  expandedActId: string | null;
  setExpanded: (id: string | null) => void;
}) => ReactNode }) {
  const [expandedActId, setExpandedActId] = useState<string | null>(null);
  // RateLimitToast lives at this level; child summary fetches surface 429s here.
  // ... or hold the toast inside DvActSummary per existing intel pattern.
  return <>{children({ expandedActId, setExpanded: setExpandedActId })}</>;
}
```

(Planner may simplify — could be a render-prop, a context provider, or just a `useState` lift inline in `[slug]/page.tsx`'s child component. Choose the simplest shape that satisfies the single-expand contract.)

---

### `app/layout.tsx` (MODIFIED — nav addition)

**Analog:** existing nav block lines 65–106 (`<nav>` with 13 `<Link>` siblings).

**Existing nav-link shape** (representative, lines 82–84):
```tsx
<Link href="/issues" className="hover:underline underline-offset-4">
  Проблеми
</Link>
```

**Phase 8 insertion point (per CONTEXT D-18):** Between `/issues` (current lines 82–84) and `/compare` (current lines 85–87). The new link:
```tsx
<Link href="/dv" className="hover:underline underline-offset-4">
  Държавен вестник
</Link>
```

**Do NOT add color tinting** (UI-SPEC §"Nav addition" line 461): no `text-red-700`. Plain neutral nav style — DV is a "knowledge browser" cluster member, not a brand-emphasized destination like `/intel` or `/audit`.

---

### `lib/queries.ts` (MODIFIED — add 4 query helpers)

**Analog (paginated list):** `listInvestigativeArticles` (lines 646–658).
**Analog (single record):** `getEuRegulation` (lines 440–450) and `getCourtDecision` (lines 345–355).

**Paginated-list helper shape** (`lib/queries.ts` lines 646–658):
```typescript
export async function listInvestigativeArticles(opts: {
  search?: string; tag?: string; page?: number; pageSize?: number;
}): Promise<{ items: InvestigativeArticle[]; total: number }> {
  const { search, tag, page = 0, pageSize = 30 } = opts;
  let q = supabase.from("investigative_articles")
    .select("id,title,date,source,author,summary,url,tags", { count: "exact" })
    .order("date", { ascending: false, nullsFirst: false });
  if (search) q = q.ilike("title", `%${search.replace(/[%]/g, " ")}%`);
  if (tag) q = q.contains("tags", [tag]);
  q = q.range(page * pageSize, page * pageSize + pageSize - 1);
  const { data, count } = await q;
  return { items: (data ?? []) as InvestigativeArticle[], total: count ?? 0 };
}
```

**Single-record helper** (`lib/queries.ts` lines 440–450):
```typescript
export async function getEuRegulation(
  celex: string,
): Promise<EuRegulationFull | null> {
  const { data, error } = await supabase
    .from("eu_regulations")
    .select("*")
    .eq("celex", celex)
    .single();
  if (error) return null;
  return data as EuRegulationFull;
}
```

**Filter-with-multi-eq pattern** (`lib/queries.ts` lines 320–343 — `listCourtDecisions`):
```typescript
export async function listCourtDecisions(opts: {
  court_code: string;
  year?: number;
  page?: number;
  pageSize?: number;
}): Promise<{ items: CourtDecision[]; total: number }> {
  const { court_code, year, page = 0, pageSize = 20 } = opts;
  let q = supabase
    .from("court_decisions")
    .select("...", { count: "exact" })
    .eq("court_code", court_code)
    ...;
  if (year) q = q.eq("year", year);
  q = q.range(page * pageSize, page * pageSize + pageSize - 1);
  const { data, count, error } = await q;
  if (error) throw new Error(`listCourtDecisions: ${error.message}`);
  return { items: (data ?? []) as CourtDecision[], total: count ?? 0 };
}
```

**Phase 8 4 helpers (per RESEARCH §"Files to Create" line 406):**
1. `listDvIssues({ q, year, act_type, date_from, date_to, issue_from, issue_to, page, pageSize })` → mirrors `listInvestigativeArticles` shape with date-range + issue-range filters
2. `getDvIssue({ year, issue, supplement = 0 })` → mirrors `getEuRegulation` (single record by composite key)
3. `listDvActs({ issue_id, search? })` → list all acts in one issue (in-issue ILIKE per CONTEXT D-12)
4. `searchDvActs({ q, ...filters, limit })` → calls `dv_search_top` RPC; mirrors `searchDecisions` (lines 490–518 with RPC + fallback pattern)

**Type definitions** — add at the top of the new section (mirror the `EuRegulation` / `CourtDecision` shape at lines 280–296 / 380–397):
```typescript
export type DvIssue = {
  id: string;
  issue_number: number;
  year: number;
  issue_supplement: number;
  date: string | null;
  title: string | null;
  source_url: string | null;
};
export type DvAct = {
  id: string;
  issue_id: string;
  issue_number: number;
  year: number;
  act_number: string | null;
  title: string;
  act_type: string | null;
  source_url: string | null;
  razdel: number | null;
  summary_ai: string | null;
  summary_ai_generated_at: string | null;
};
```

---

### `__tests__/dv-search.test.ts` (NEW)

**Analog:** `__tests__/rate-limit.test.ts` + `__tests__/use-rate-limited-fetch.test.tsx` — vitest 4.1.5 + @testing-library/react 16.3.2 shape.

**Test imports + describe shape** (`__tests__/use-rate-limited-fetch.test.tsx` lines 1–13):
```typescript
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRateLimitedFetch } from "@/lib/use-rate-limited-fetch";

describe("useRateLimitedFetch (RL-01 hook contract)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("parses 429 + retry_after into rateLimited state (D-05/D-06)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(...);
```

**Phase 8 test cases (RESEARCH Q-validation §"Per-Task Verification Map" line 439):**
- `q.trim().length < 2 → returns []` (RESEARCH Pitfall 4)
- `LEX_WEIGHT + RECENCY_WEIGHT === 1.0` (constants invariant)
- `RECENCY_HALF_LIFE_DAYS === 365`
- RPC param shape (mock `supabase.rpc("dv_search_top", ...)` and assert call args contain all 7 filters)
- Result type shape matches `DvSearchHit` interface
- Empty filter passes `null` (NOT `undefined`) to RPC

---

### `app/api/dv/summarize/route.ts` (NEW, streaming POST)

**Composite analog:**
- **Streaming shape:** `app/api/intel/search/route.ts` lines 76–110 (canonical Anthropic ReadableStream + `signal: req.signal`)
- **Per-record summarize:** `app/api/eu/summarize/[celex]/route.ts` lines 36–119 (lookup-then-summarize pattern with `getEuRegulation`)

**Runtime + rate-limit gate** (`app/api/intel/search/route.ts` lines 1–6, 42–44):
```typescript
import Anthropic from "@anthropic-ai/sdk";
import { rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;
...
export async function POST(req: Request) {
  const limit = rateLimited(req, "intel-search", { windowMs: 60_000, max: 10 });
  if (limit) return limit;
```

**Body parsing + 400 path** (`app/api/intel/search/route.ts` lines 46–53):
```typescript
let body: RequestBody;
try {
  body = (await req.json()) as RequestBody;
} catch {
  return new Response("Invalid JSON", { status: 400 });
}
const query = (body.query ?? "").trim();
if (!query) return new Response("Празна заявка", { status: 400 });
```

**Per-record lookup + 404 path** (`app/api/eu/summarize/[celex]/route.ts` lines 36–47):
```typescript
export async function POST(
  req: Request,
  ctx: { params: Promise<{ celex: string }> },
) {
  const limit = rateLimited(req, "eu-summarize", { windowMs: 60_000, max: 10 });
  if (limit) return limit;

  const { celex } = await ctx.params;
  const reg = await getEuRegulation(decodeURIComponent(celex));
  if (!reg) {
    return new Response("Не е намерен регламент", { status: 404 });
  }
```

**Anthropic streaming + cancellation** (`app/api/intel/search/route.ts` lines 76–111):
```typescript
const client = new Anthropic();
const encoder = new TextEncoder();
const stream = new ReadableStream({
  async start(controller) {
    try {
      const cs = client.messages.stream(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 1500,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: lines.join("\n") }],
        },
        { signal: req.signal },
      );
      cs.on("text", (delta) => controller.enqueue(encoder.encode(delta)));
      await cs.finalMessage();
      controller.close();
    } catch (err) {
      if (req.signal.aborted) {
        controller.close();
        return;
      }
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
```

**Phase 8 deltas (per CONTEXT D-13 + RESEARCH Q6 line 181):**
- `body: { actId: string }`
- `rateLimited(req, "dv-summarize", { windowMs: 60_000, max: 10 })`
- `maxDuration = 120` (longer body summaries; matches `eu/summarize` line 6)
- Lookup: `const act = await getDvAct(actId); if (!act) return new Response("...", { status: 404 });` — NEW helper to add to `lib/queries.ts`
- **Cache-hit short-circuit:** if `act.summary_ai` non-null, faux-stream the cached value chunk-by-chunk OR return with `X-Source: cache` header (UI-SPEC line 351 — planner picks)
- **Cache write-back AFTER stream completes (RESEARCH Q6 line 181 — write inside try, NOT in finally):**
  ```typescript
  let collected = "";
  // inside the for-await-of / cs.on("text"):
  cs.on("text", (delta) => { collected += delta; controller.enqueue(encoder.encode(delta)); });
  await cs.finalMessage();
  // STREAM COMPLETED CLEANLY — write here, inside try, after the loop:
  await supabase.from("dv_acts")
    .update({ summary_ai: collected, summary_ai_generated_at: new Date().toISOString() })
    .eq("id", actId);
  controller.close();
  // catch block: DO NOT write — partial summary is poison
  ```
- System prompt: Bulgarian, citizen-friendly markdown explaining the act (CONTEXT D-14). Author the prompt in the planner's task spec.

---

### `__tests__/dv-summarize-route.test.ts` (NEW)

**Analog:** `__tests__/rate-limit.test.ts` (vitest with mocked Anthropic + Supabase).

**Phase 8 test cases (per Validation 08-03-01 + RESEARCH §"Per-Task Verification Map" line 442):**
1. `rateLimited(req, "dv-summarize", { windowMs: 60_000, max: 10 })` returns 429 on 11th call within 60 s
2. Anthropic call uses `model: "claude-sonnet-4-6"` (grep-asserted on `client.messages.stream` mock args)
3. Anthropic call passes `{ signal: req.signal }` as second arg (AI-07 — mandatory per RESEARCH Pitfall 6)
4. Cache hit: when `act.summary_ai` non-null, no Anthropic call is made
5. Cache miss → write: after a clean stream completes, `supabase.from("dv_acts").update({ summary_ai, summary_ai_generated_at })` is called once with the collected text
6. Error / abort: when `controller.error` fires (or `req.signal.aborted`), `supabase.update` is NOT called (cache-poison guard from RESEARCH Q6)

**Static grep gates (Validation 08-03-02 line 444):** `claude-sonnet-4-6`, `signal: req.signal`, `dv-summarize`, `summary_ai`, `Cache-Control: no-store`.

---

## Shared Patterns

### Auth / Rate-Limit Gate
**Source:** `lib/rate-limit.ts` lines 58–104.
**Apply to:** All new POST API routes (`/api/dv/summarize` is the only one in Phase 8).
```typescript
import { rateLimited } from "@/lib/rate-limit";
export async function POST(req: Request) {
  const limit = rateLimited(req, "dv-summarize", { windowMs: 60_000, max: 10 });
  if (limit) return limit;
  ...
}
```
The 429 response and structured log (`event: "rate_limit_throttled"` JSON) are emitted inside `rateLimited` itself — no caller-side log.

### Streaming Response Headers
**Source:** `app/api/intel/search/route.ts` lines 104–110, `app/api/eu/summarize/[celex]/route.ts` lines 112–118.
**Apply to:** `/api/dv/summarize`.
```typescript
return new Response(stream, {
  headers: {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Accel-Buffering": "no",
  },
});
```

### Client-Side AbortSignal Propagation (AI-07)
**Source:** `lib/use-rate-limited-fetch.ts` lines 62–117 (`submit()` returns `{ response, signal }`); consumer at `intel-search-summary.tsx` lines 95–115 (passes `signal` to the read loop).
**Apply to:** `app/dv/[slug]/dv-act-summary.tsx`.
The streaming consumer MUST pass the `signal` returned from `rl.submit()` into its read loop:
```typescript
while (true) {
  if (signal.aborted) break;
  const { done, value } = await reader.read();
  ...
}
```

### Card Primitive (Phase 2 visual carry-forward)
**Source:** UI-SPEC line 211–218 (verbatim Phase 2 Card class string; on this branch the closest live precedent is `app/audit/page.tsx` line 145 with severity-tinted background).
**Apply to:** `<DvIssueCard>` and `<DvActCard>`.
```
rounded-lg border border-stone-800 bg-stone-900/40 p-5
hover:border-red-500/50 hover:bg-stone-900/60
focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500/30
transition-colors
```

### FilterPill (verbatim from `/audit`)
**Source:** `app/audit/page.tsx` lines 306–322.
**Apply to:** `/dv` listing Row 1 act-type chips (UI-SPEC §"Component Reuse" line 562 — "Lift + extract" if used in 2+ places, otherwise inline-copy).
```typescript
function FilterPill({ href, active, children, severity }: {
  href: string; active: boolean; children: React.ReactNode; severity?: string;
}) {
  const sevTint = severity ? SEV_BADGE[severity] : "";
  return (
    <Link href={href}
      className={`rounded-full border px-3 py-1 text-xs ${
        active
          ? `border-red-500 ${severity ? sevTint : "bg-red-900/40 text-red-100"}`
          : "border-stone-700 bg-stone-900 text-stone-300 hover:border-red-500"
      }`}>
      {children}
    </Link>
  );
}
```
Phase 8 doesn't use `severity` — drop that prop.

### Pagination Block
**Source:** `app/intel/articles/page.tsx` lines 84–100.
**Apply to:** `/dv` listing.
See full code excerpt under `app/dv/page.tsx` above.

### Markdown Streaming Renderer
**Source:** `app/intel/search/intel-search-summary.tsx` lines 16–62 (`renderInline` + `renderMarkdown`).
**Apply to:** `app/dv/[slug]/dv-act-summary.tsx`.
Copy the two pure-functions verbatim. They handle `**bold**`, `## headings`, `- bullets`, paragraphs. No external deps.

### Streaming Cursor (UI-SPEC verbatim)
**Source:** `app/intel/search/intel-search-summary.tsx` lines 142–144.
**Apply to:** `app/dv/[slug]/dv-act-summary.tsx`.
```tsx
{status === "streaming" && (
  <span className="ml-1 inline-block h-3 w-2 animate-pulse bg-red-500 align-middle" />
)}
```

### ARIA-Live Debounce (UI-SPEC §"`aria-live` debouncing" — NEW for Phase 8)
**Source:** UI-SPEC lines 369–376 + `app/components/rate-limit-toast.tsx` lines 28–46 (announce-once idiom).
**Apply to:** `app/dv/[slug]/dv-act-summary.tsx`.
Render only when `status === 'done'` — never during streaming. The `RateLimitToast` precedent demonstrates the announce-once technique using `useRef<string>("")` updated only on `null↔set` transitions.

### Bulgarian Voice Rules (Phase 2 carry-forward, UI-SPEC §"Voice & Localization")
**Apply to:** All new UI strings.
- Imperative formal voice
- No exclamation marks anywhere
- Sentence case headings ("Държавен вестник" not "Държавен Вестник")
- Date format `Intl.DateTimeFormat('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric' })`
- Pluralization via `Intl.PluralRules('bg-BG')` ("1 акт" / "5 акта")
- Number format `(n).toLocaleString("bg-BG")`

### Print Path
**Source:** `app/globals.css` `@media print` block (untouched; covers all `bg-stone-9*` automatically).
**Apply to:** All new components.
- `print:hidden` on filter chips, "✦ AI обобщение" buttons, "Скрий" buttons, pagination
- Footer attribution as `<div>` NOT `<footer>` (UI-SPEC line 542 — `<footer>` is hidden by global print rules)
- AI-summary expanded region: NOT `print:hidden` (intentionally printable)

### Idempotent Migration
**Source:** `scripts/schema.sql` lines 1–72.
**Apply to:** `db/dv_schema.sql`.
- `CREATE TABLE IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- `CREATE OR REPLACE FUNCTION`
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (Postgres 9.6+; needed for the `search_vector` GENERATED column add per RESEARCH lines 291–303)

### lex-brain Resume-via-DB
**Source:** Phase 1 D-15 (no JSON state files; DB rows are state).
**Apply to:** `scripts/scrape_dv.py`.
- At start, query `dv_issues` for existing `(year, issue_number, issue_supplement)` set
- Query `dv_acts` for `idMat` set where `length(full_text) > 0`
- Skip these during walk
- Use `INSERT ... ON CONFLICT DO NOTHING` for race-safety

### lex-brain HTTP Retry (carry-forward Phase 1)
**Source:** `scripts/_lib/http_retry.py` (DO NOT modify per CONTEXT D-12 / Phase 1 D-12).
**Apply to:** Inside `scripts/_lib/dv_jsf.py` and `scripts/scrape_dv.py`.
```python
from _lib.http_retry import fetch_with_retry_sync
r = fetch_with_retry_sync(client, url, timeout=30)
if r is None or r.status_code != 200: continue
```

---

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `app/dv/[slug]/dv-issue-page-client.tsx` | client / state container | Each existing page-level state pattern is bespoke (`/audit` uses URL state only; `/intel/search` puts state inline; no extracted state-container precedent on this branch). Pattern documented inline above; planner picks render-prop vs context vs lift. |
| `db/dv_schema.sql` (PARTIAL) | tsvector + GIN + RPC migration | The advanced FTS shape (`tsvector GENERATED`, `gin(search_vector)`, `dv_search_top` RPC, `0.7 * ts_rank + 0.3 * exp(...)` blend) has **no precedent on this branch**. Phase 2's `db/intel_fts.sql` lives on `feat/phase-02-ai-features` and has not merged. The full SQL body is dictated verbatim by 08-RESEARCH.md §"Schema Deltas" lines 256–361. The Phase 8 executor establishes the convention here. |
| `lib/dv-search.ts` (PARTIAL) | RPC wrapper + ranking constants | Same as above. Phase 2's `lib/intel-search.ts` (with `LEX_WEIGHT`/`RECENCY_WEIGHT`/`RECENCY_HALF_LIFE_DAYS`) is on a different branch. Constants documented inline in 08-RESEARCH.md line 363. The function signature follows the on-branch `searchArticles` / `searchDecisions` pattern documented above. |
| `app/dv/[slug]/_components/act-card.tsx` (client component owning AI fetch) | client component | The intel-search analog (`intel-search-summary.tsx`) is the AI-fetch consumer; on this branch there is no precedent for embedding it INSIDE a per-record card. UI-SPEC §"Single-card-expanded constraint" (line 306) lifts the state to the page level — planner specifies whether the fetch lives in `<DvActCard>` or `<DvActSummary>`. |

---

## Metadata

**Analog search scope:**
- `/Users/beyond/Desktop/lex-web/app/` (all subdirs)
- `/Users/beyond/Desktop/lex-web/lib/`
- `/Users/beyond/Desktop/lex-web/scripts/`
- `/Users/beyond/Desktop/lex-web/__tests__/`
- `/Users/beyond/Desktop/lex-brain/scripts/` and `scripts/_lib/`

**Files scanned:** 14 read in full; ~30 enumerated via `ls`.

**Branch verification:** Confirmed on `feat/phase-01-reliability` — `db/` does not exist; `lib/intel-search.ts` does not exist; `app/intel/search/best-match-quote.tsx` does not exist; Phase 2's `intel_fts.sql` does not exist. All "Phase 2 precedent" references in CONTEXT/RESEARCH must be reproduced from the documentation, not from on-branch code.

**Pattern extraction date:** 2026-05-10
