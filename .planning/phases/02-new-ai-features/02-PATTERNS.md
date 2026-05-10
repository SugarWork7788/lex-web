# Phase 2: New AI features — Pattern Map

**Mapped:** 2026-05-10
**Files analyzed:** 12 files to create/modify
**Analogs found:** 10 / 12 (1 partial-no-precedent, 1 no-precedent — both flagged)

> Pattern map for INT-02 (Intel search v2: ranking + Haiku quote-extraction) and PDF-01 (Audit PDF download). Sources: `02-CONTEXT.md` D-01..D-13, `02-RESEARCH.md` "Recommended Project Structure" + Patterns 1-5, `02-UI-SPEC.md` "Component Inventory".
>
> **Project skill probe (read-only check):** `.claude/skills/` and `.agents/skills/` directories do NOT exist in this repo. Only `CLAUDE.md` / `AGENTS.md` instructions apply (Next.js 16 reminder — already heeded by RESEARCH.md).

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/api/intel/quote/route.ts` (NEW) | route handler | streaming (request-response, SSE-like) | `app/api/intel/search/route.ts` | **exact** (same shape, only model + prompt change) |
| `app/api/intel/search/route.ts` (MODIFY — add `GET`) | route handler | request-response (JSON) | `app/api/audit/vote/route.ts` | role-match (JSON, no streaming) — **`POST` half stays as the existing analog** |
| `app/api/audit/pdf/route.ts` (NEW) | route handler | binary download (request-response) | `app/api/intel/search/route.ts` (config), `app/api/audit/vote/route.ts` (audit-namespace, JSON err) | **partial — no precedent for binary `Response` shape** |
| `lib/intel-search.ts` (NEW) | data-fetch helper / service | request-response (Postgres RPC) | `lib/queries.ts` (`searchArticles`, `searchDecisions`, `getAuditFindings`) | **role-match** (RPC + typed return) |
| `app/intel/search/page.tsx` (MODIFY — wire `<BestMatches>`) | RSC (page) | request-response (Postgres parallel fan-out) | self (existing `searchAll`) | **exact** (in-place insert) |
| `app/intel/search/best-matches.tsx` (NEW) | server-or-client component | request-response (props in, JSX out) | `app/intel/search/page.tsx` `ResultGroup` (line 164) | **role-match** |
| `app/intel/search/best-match-card.tsx` (NEW) | server-or-client component (variant-driven) | request-response (props in, JSX out) | `app/audit/page.tsx` `FindingCard` (line 213) + `SEV_BADGE` (line 11) + per-source list rows in `app/intel/search/page.tsx:99-148` | **role-match** (card primitive + variant pills) |
| `app/intel/search/best-match-quote.tsx` (NEW — implied by UI-SPEC streaming-cursor pattern; planner may inline into `best-match-card.tsx`) | client component | streaming (ReadableStream → text) | `app/intel/search/intel-search-summary.tsx` | **exact** (same Anthropic-stream consumption pattern) |
| `app/audit/download-pdf-button.tsx` (NEW) | client component | request-response → blob download | `app/audit/vote-button.tsx` (state machine) + `app/intel/search/intel-search-summary.tsx` (rate-limit hook integration) | **role-match** (state-machine + fetch + new blob path) |
| `app/audit/page.tsx` (MODIFY — add `<DownloadPdfButton />` to stats row) | RSC (page) | render-only (no new data) | self (existing stats `<ul>` at line 91) | **exact** (in-place insert) |
| `next.config.ts` (MODIFY — add `outputFileTracingIncludes`) | config | build-time | self (existing `redirects`/`headers` keys) | **exact** (key-extension only) |
| `db/intel_fts.sql` (NEW) | DB migration (DDL) | one-shot SQL | `scripts/schema.sql` (existing migration in lex-web) | **role-match** (different DDL, same delivery shape) |
| `__tests__/intel-search-ranking.test.ts` (NEW) | unit test | (test) | `__tests__/use-rate-limited-fetch.test.tsx`, `__tests__/rate-limit.test.ts` | role-match (vitest, same setup) |
| `__tests__/audit-pdf-route.test.ts` (NEW — smoke import only per RESEARCH) | unit test | (test) | `__tests__/rate-limit.test.ts` | role-match |

**Net code-modifications outside the new files:** 3 — `app/intel/search/page.tsx`, `app/audit/page.tsx`, `next.config.ts`, `package.json` (deps + `engines.node`).

---

## Pattern Assignments

### `app/api/intel/quote/route.ts` (NEW — controller, streaming)

**Analog:** `app/api/intel/search/route.ts` (the closest exact-shape match in the repo — same Anthropic streaming pattern, same `runtime`/`maxDuration` declaration, same `rateLimited()` gate).

**Imports + segment-config pattern** (lines 1-5 of analog):
```ts
import Anthropic from "@anthropic-ai/sdk";
import { rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;
```
**Apply:** copy verbatim. New file uses `maxDuration = 30` per RESEARCH Pattern 3 (Haiku is fast).

**Rate-limit gate** (lines 42-44):
```ts
export async function POST(req: Request) {
  const limit = rateLimited(req, "intel-search", { windowMs: 60_000, max: 10 });
  if (limit) return limit;
```
**Apply:** new key `"intel-quote"` with `max: 30` per RESEARCH Pattern 3 (higher because called per-card, up to 5×).

**Anthropic ReadableStream pattern** (lines 76-103):
```ts
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
**Apply:** copy verbatim, swap `model: "claude-sonnet-4-6"` → `"claude-haiku-4-5"`, `max_tokens: 1500` → `200`, system/user content per RESEARCH Pattern 3. The `signal: req.signal` propagation is mandatory (preserves AI-07 abort chain).

**Body-parse + 400 pattern** (lines 46-53):
```ts
let body: RequestBody;
try { body = (await req.json()) as RequestBody; }
catch { return new Response("Invalid JSON", { status: 400 }); }
const query = (body.query ?? "").trim();
if (!query) return new Response("Празна заявка", { status: 400 });
```
**Apply:** copy shape; the new body type is `{ query?: string; summary?: string }`; return 400 if either missing. Bulgarian error string convention preserved.

---

### `app/api/intel/search/route.ts` MODIFY (add `GET` handler for ranked top-5)

**Analog for the new `GET`:** the existing `POST` handler in the same file (lines 42-111) for segment-config + rate-limit; `app/api/audit/vote/route.ts` for the JSON-response (non-streaming) shape.

**JSON-response pattern from `app/api/audit/vote/route.ts`** (lines 22-30, 76-83):
```ts
export async function POST(req: NextRequest) {
  let body: { finding_id?: string; fingerprint?: string };
  try { body = await req.json(); }
  catch { return Response.json({ success: false, reason: "bad_json" }, { status: 400 }); }
  // ...
  return Response.json({ success: true, new_count: Number(newCount) || 0 });
}
```
**Apply:** new `GET(req)` reads `?q=` from `new URL(req.url).searchParams`, calls `searchTopRanked(q)` from `lib/intel-search.ts`, returns `Response.json({ items: [...] })` or 400 on empty/short query (per RESEARCH Pitfall 5).

**Decision needed by planner:** RESEARCH §"Recommended Project Structure" lists the GET on the existing path; CONTEXT.md `<open_questions>` Q7 was deferred. Planner picks `GET` on the same path (route-key reuses `"intel-search"` for rate-limit) **or** a sibling `/api/intel/results` route. Either is consistent with the analog.

---

### `app/api/audit/pdf/route.ts` (NEW — controller, binary download)

**Analog (config + gate):** `app/api/intel/search/route.ts` lines 1-5 + 43-44 (segment config + `rateLimited()`). Reuse verbatim with key `"audit-pdf"`, `max: 5` per RESEARCH Pattern 4.

**Analog (audit-namespace + error JSON):** `app/api/audit/vote/route.ts` — confirms the namespace convention (`/api/audit/*` lives next to existing `vote/`). The JSON-error shape (`Response.json({ ... }, { status: 500 })`) matches.

**No precedent in the repo for:**
- `Response(Uint8Array, { headers: { "Content-Disposition": "attachment; ..." } })` — no existing route returns a binary download.
- `puppeteer.launch()` / `@sparticuz/chromium` — net new runtime dependency; no analog in `app/api/**`.

**RESEARCH-supplied pattern (Pattern 4 in `02-RESEARCH.md`) is the canonical reference.** Key shape excerpt:
```ts
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limit = rateLimited(req, "audit-pdf", { windowMs: 60_000, max: 5 });
  if (limit) return limit;

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    chromium.setGraphicsMode = false;
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    await page.emulateMediaType("print");
    const response = await page.goto(`${SITE_URL}/audit`, {
      waitUntil: "networkidle0", timeout: 25_000,
    });
    if (!response?.ok()) throw new Error(`page.goto failed: ${response?.status()}`);

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "1.6cm", right: "1.3cm", bottom: "1.6cm", left: "1.3cm" },
    });
    const today = new Date().toISOString().slice(0, 10);
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
    console.error(`[audit-pdf] failed: ${err}`);
    return new Response(
      JSON.stringify({ error: "Неуспешно генериране на PDF" }),
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
```
**Apply:** wire as written. The page CSS (`app/globals.css:43-130` `@media print`) renders the watermark when puppeteer sets `printBackground: true` — verified existing pattern.

**Print-CSS path being rendered** (from `app/globals.css:43-56` — no Phase 2 modification):
```css
@media print {
  @page { margin: 1.6cm 1.3cm; }
  html {
    background-color: #fff !important;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 600' width='800' height='600'><text x='400' y='320' text-anchor='middle' font-family='Georgia,serif' font-size='110' font-weight='700' letter-spacing='14' fill='rgba(0,0,0,0.055)' transform='rotate(-30 400 300)'>LEX.BRAIN</text></svg>");
    background-repeat: repeat;
    background-size: 800px 600px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  ...
  header, footer, nav, .print\:hidden { display: none !important; }
}
```
The `print:hidden` class on the new `<DownloadPdfButton />` wrapper hides it from the rendered PDF; the `LEX.BRAIN` SVG-tile watermark is what `printBackground: true` triggers.

---

### `lib/intel-search.ts` (NEW — service / data helper)

**Analog:** `lib/queries.ts` — owns the project's typed Postgres helpers, including the existing RPC pattern.

**RPC + typed return pattern** (from `lib/queries.ts:93-104` `searchArticles`):
```ts
export async function searchArticles(query: string, limit = 50): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  // Defined as a Postgres function in db/schema.sql or via inline RPC.
  const { data, error } = await supabase.rpc("search_articles", {
    q: trimmed,
    lim: limit,
  });
  if (error) throw new Error(`searchArticles: ${error.message}`);
  return (data ?? []) as SearchHit[];
}
```
**Apply:** `searchTopRanked(q: string, limit = 5): Promise<RankedRow[]>` calls `supabase.rpc("intel_search_top", { q })` per RESEARCH Pattern 2. Return type union per source. Trim + length-guard at the top to avoid `websearch_to_tsquery('')` (Pitfall 5).

**RPC fallback pattern** (from `lib/queries.ts:490-518` `searchDecisions` — try-rpc-then-ilike):
```ts
export async function searchDecisions(query: string, limit = 5, courtCode?: string): Promise<CourtDecision[]> {
  try {
    const { data } = await supabase.rpc("search_decisions", { query, p_court: courtCode ?? null, p_year: null, lim: limit });
    if (data && Array.isArray(data) && data.length > 0) return data as CourtDecision[];
  } catch {
    // RPC not available — fall through to ilike fallback.
  }
  let q = supabase.from("court_decisions").select(...).ilike("full_text", `%${query.slice(0, 100)}%`).limit(limit);
  if (courtCode) q = q.eq("court_code", courtCode);
  const { data } = await q;
  return (data ?? []) as CourtDecision[];
}
```
**Apply:** identical try-RPC-then-ilike fallback so `searchTopRanked` keeps working before the migration runs (defensive for staging). Pre-migration fallback returns `[]` (better than per-source ilike — caller already shows per-source breakdown).

**Constants pattern (top-of-file):** RESEARCH Pattern 2 specifies `RECENCY_HALF_LIFE_DAYS = 365` and the `0.7 lex + 0.3 rec` blend live in `lib/intel-search.ts`. No analog for module-level tunables in `lib/queries.ts`; closest is `KNOWN_COURT_CODES` const at `lib/queries.ts:304`. Apply as named export so tests can import.

---

### `app/intel/search/page.tsx` MODIFY (insert `<BestMatches>` between summary and per-source `ResultGroup`)

**Analog:** self (existing `searchAll` at line 12 + `IntelSearchSummary` mount at line 95 + `ResultGroup × 6` block at lines 97-156).

**Insertion shape** (within the existing `<div className="mt-8 space-y-6">` at line 94):
```tsx
{query && r && counts && samples && (
  <div className="mt-8 space-y-6">
    <IntelSearchSummary query={query} counts={counts} samples={samples} />

    {/* NEW — best-matches section, only renders if hits > 0 (D-01) */}
    {topRanked.length > 0 && <BestMatches items={topRanked} />}

    <ResultGroup title={`Санкции (${r.sanctioned.length})`} ... />
    {/* ... rest of existing 6 ResultGroup blocks ... */}
  </div>
)}
```
**Apply:** call `searchTopRanked(query)` from `lib/intel-search.ts` in parallel with the existing `searchAll(query)` (`Promise.all`), pass into `<BestMatches>`. The `mt-8 space-y-6` cadence is preserved per UI-SPEC §"Layout Integration" — best-matches inherits the 24px rhythm.

---

### `app/intel/search/best-matches.tsx` (NEW — section wrapper)

**Analog:** the inline `ResultGroup` component at `app/intel/search/page.tsx:164-199`.

**Section + heading shape** (lines 172-181):
```tsx
function ResultGroup({ title, items, href, empty }: { ... }) {
  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">{title}</h2>
        <Link href={href} className="text-xs text-red-400 hover:underline">отвори раздела →</Link>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-stone-500">{empty || "Няма попадения."}</p>
      ) : (
        <ul className="mt-2 divide-y divide-stone-800 border-y border-stone-800">
          {/* per-row */}
        </ul>
      )}
    </section>
  );
}
```
**Apply:** swap to per UI-SPEC §"Copywriting Contract":
- `<h2 className="font-serif text-lg font-semibold">Най-добри съвпадения</h2>` (UI-SPEC Typography §"Section heading")
- Eyebrow above heading: `<p className="text-xs uppercase tracking-wider text-red-400 font-medium">✦ AI класиране</p>` (matches `intel-search-summary.tsx:130-132` eyebrow style)
- Sub-label: `<p className="text-xs text-stone-500">Подредени по релевантност и актуалност · max 5</p>`
- Container becomes `<div className="space-y-3">` (12px gap between cards per UI-SPEC §"Spacing Scale") instead of `<ul divide-y>` — cards are full-bordered, no list-divider.
- Empty state: render nothing if `items.length === 0` (D-01 / UI-SPEC §"Empty / Edge States").

---

### `app/intel/search/best-match-card.tsx` (NEW — variant card renderer)

**Analog (card primitive):** `app/audit/page.tsx:145` `<li className={\`rounded-lg border p-5 ${SEV_CARD[f.severity]}\`}>` — same `rounded-lg border p-5` primitive UI-SPEC §"Card layout primitive" specifies.

**Apply card primitive verbatim with neutral surface** (UI-SPEC):
```tsx
<article
  className="rounded-lg border border-stone-800 bg-stone-900/40 p-5
             hover:border-red-500/50 hover:bg-stone-900/60
             focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500/30
             transition-colors"
>
  ...
</article>
```

**Analog (badge/pill pattern):** `app/audit/page.tsx:11-15` `SEV_BADGE` map + lines 218-220 usage:
```tsx
const SEV_BADGE: Record<string, string> = {
  "КРИТИЧНО": "bg-red-700 text-white",
  "СЕРИОЗНО": "bg-orange-600 text-white",
  "УМЕРЕНО":  "bg-yellow-500 text-yellow-950",
};
// ...
<span className={`rounded-full px-2.5 py-0.5 font-semibold uppercase tracking-wide ${SEV_BADGE[f.severity]}`}>
  {f.severity}
</span>
```
**Apply:** new `SOURCE_PILL` map mirroring this shape, taken verbatim from UI-SPEC §"Color §Source-type tint per best-match card":
```tsx
const SOURCE_PILL: Record<SourceType, { className: string; label: string }> = {
  sanctioned:  { className: "bg-red-950/40 text-red-300 ring-1 ring-red-800/40",         label: "Санкции" },
  offshore:    { className: "bg-amber-950/40 text-amber-300 ring-1 ring-amber-800/40",   label: "Офшор" },
  olaf:        { className: "bg-blue-950/40 text-blue-300 ring-1 ring-blue-800/40",      label: "OLAF" },
  articles:    { className: "bg-stone-800 text-stone-300 ring-1 ring-stone-700",         label: "Журналистика" },
  prosecution: { className: "bg-purple-950/40 text-purple-300 ring-1 ring-purple-800/40",label: "Прокуратура" },
  nap:         { className: "bg-emerald-950/40 text-emerald-300 ring-1 ring-emerald-800/40", label: "НАП" },
};
```
Use `ring-1` (UI-SPEC explicit — distinguishes from severity badges).

**Analog (per-source row body):** the 6 `ResultGroup` `items.map` blocks in `app/intel/search/page.tsx:99-156` — these are the canonical "what fields to show per source" map. Excerpts to copy:

Sanctioned (lines 101-104):
```tsx
{ key: x.id, primary: x.name || "—",
  secondary: [x.entity_type, x.sanctioning_body].filter(Boolean).join(" · ") }
```
Offshore (lines 110-113):
```tsx
{ key: x.id, primary: x.name || "—",
  secondary: [x.entity_type, x.jurisdiction].filter(Boolean).join(" · "),
  external: x.icij_id ? `https://offshoreleaks.icij.org/nodes/${x.icij_id}` : null }
```
OLAF (lines 120-124):
```tsx
{ key: x.id, primary: x.title || "—",
  secondary: [x.fraud_type, x.date, x.amount_eur ? `€${x.amount_eur.toLocaleString("bg-BG")}` : null].filter(Boolean).join(" · "),
  external: x.source_url }
```
Articles (lines 130-134):
```tsx
{ key: x.id, primary: x.title || "—",
  secondary: [x.source, x.author, x.date].filter(Boolean).join(" · "),
  external: x.url }
```
Prosecution (lines 140-144), NAP (lines 150-153) follow the same shape.

**Apply:** the card switches on `source` and renders the appropriate `secondary` shape verbatim. Source-row-verbatim cards (sanctions/offshore/OLAF/prosecution/NAP per D-03) render directly; `articles` cards leave a quote slot for the streaming Haiku response.

**Title link pattern** (lines 184-190 of analog):
```tsx
<div className="font-medium">
  {it.external ? (
    <a href={it.external} target="_blank" rel="noreferrer"
       className="hover:text-red-300 hover:underline">
      {it.primary} ↗
    </a>
  ) : it.primary}
</div>
```
**Apply:** same anchor shape; UI-SPEC promotes `font-medium` to `font-serif text-base font-semibold leading-snug` (Typography §"Card title").

**Eyebrow pattern (for "AI цитат" / "Източник: запис" labels)** — analog `intel-search-summary.tsx:130-132`:
```tsx
<div className="text-xs uppercase tracking-wider text-red-400 font-medium mb-2">
  ✦ AI обобщение
</div>
```
**Apply:** same class shape; copy is `✦ AI цитат` (article cards) or `Източник: запис` (others) per UI-SPEC §"Copywriting Contract". Note: only the AI-цитат eyebrow uses red (accent budget rule UI-SPEC §"Accent reserved for #5"); the record-type eyebrow uses `text-stone-400`.

---

### Streaming AI quote (article cards only) — `best-match-quote.tsx` or inlined in card

**Analog:** `app/intel/search/intel-search-summary.tsx` — the canonical streaming-consumer pattern using `useRateLimitedFetch`.

**Hook + state-machine pattern** (lines 64-124):
```tsx
const [text, setText] = useState("");
const [status, setStatus] = useState<"idle" | "streaming" | "done" | "error">("idle");
const [error, setError] = useState<string | null>(null);
const startedRef = useRef(false);
const rl = useRateLimitedFetch();

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
      if ("rateLimited" in result) { startedRef.current = false; setStatus("idle"); return; }
      if ("aborted" in result) return;
      setError(result.error); setStatus("error"); return;
    }
    const { response, signal } = result;
    if (!response.body) { setError("Празен отговор"); setStatus("error"); rl.finish(); return; }
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
}, [query, counts, samples]);
```
**Apply:** copy verbatim, swap endpoint to `/api/intel/quote`, body shape to `{ query, summary }`. The `RateLimitToast` is mounted at the page level (already wrapping `IntelSearchSummary`) — `useRateLimitedFetch` instances are independent so no double-toast.

**Streaming-cursor + animate-pulse placeholder** (lines 133-145):
```tsx
{status === "streaming" && text === "" && (
  <p className="text-sm text-stone-400 italic animate-pulse">Анализирам всички бази…</p>
)}
{status === "error" && (<p className="text-sm text-red-300">Грешка: {error}</p>)}
{text && (
  <div className="text-stone-100">
    {renderMarkdown(text)}
    {status === "streaming" && (
      <span className="ml-1 inline-block h-3 w-2 animate-pulse bg-red-500 align-middle" />
    )}
  </div>
)}
```
**Apply:** same shape with copy swap to `Извличам цитати…` (UI-SPEC §"Copywriting Contract"). Per-card error fallback per UI-SPEC §"Empty / Edge States": `<p className="text-xs text-stone-500 italic">Цитатът не може да бъде извлечен. Виж пълния текст в раздела.</p>`. Bare text rendering (no `renderMarkdown`) — the quote is plain text.

---

### `app/audit/download-pdf-button.tsx` (NEW — client component, state machine)

**Analog (state machine):** `app/audit/vote-button.tsx` — closest in shape (idle / busy / voted / error transitions), already lives next to the page.

**State-machine + button class pattern** (lines 18-66):
```tsx
"use client";
import { useState } from "react";

export function VoteButton({ findingId, initialCount }: { findingId: string; initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const [state, setState] = useState<"idle" | "busy" | "voted" | "error">("idle");
  const [reason, setReason] = useState<string | null>(null);

  const vote = async () => {
    if (state !== "idle") return;
    setState("busy");
    try {
      const fp = await fingerprint();
      const r = await fetch("/api/audit/vote", { ... });
      const data = await r.json();
      if (data.success) { setCount(data.new_count ?? count + 1); setState("voted"); }
      else { setState(data.reason === "already_voted" ? "voted" : "error"); setReason(data.reason ?? null); }
    } catch { setState("error"); }
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      <button onClick={vote} disabled={state !== "idle"}
        className={`rounded-md border px-3 py-1 font-medium transition ${
          state === "voted" ? "border-emerald-700 bg-emerald-900/30 text-emerald-200 cursor-default"
          : state === "error" ? "border-red-700 bg-red-900/30 text-red-200"
          : "border-stone-600 bg-stone-800 text-stone-100 hover:border-red-500 hover:bg-red-900/30"
        }`}
      >
        {state === "voted" ? "✓ Гласувахте" : state === "busy" ? "…" : "👍 Подкрепи"}
      </button>
      ...
    </div>
  );
}
```
**Apply:** same `useState<"idle" | "busy" | "voted" | "error">("idle")` shape — but RENAME states per UI-SPEC §"Interaction States" to `idle | loading | done | error`. Button copy + classes per UI-SPEC §"`Свали като PDF` button":
```tsx
className="inline-flex items-center gap-2 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white
           hover:bg-red-600 active:bg-red-800
           focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500
           disabled:cursor-wait disabled:opacity-80 print:hidden"
```
Label progression: `Свали като PDF` → `Генерирам PDF…` (loading, with `aria-busy="true"`) → `Свален ✓` (transient ~2 s) → idle.

**Analog (rate-limited fetch + blob handling):** `app/intel/search/intel-search-summary.tsx` lines 71-122 (hook + body reader pattern). Apply for the GET to `/api/audit/pdf` — but instead of a `TextDecoder` reader, `await response.blob()` + `URL.createObjectURL(blob)` + click hidden `<a download>`.

**Key difference from analogs:** the new component combines `vote-button.tsx`'s state machine with `intel-search-summary.tsx`'s rate-limit hook integration; the blob-download path has no precedent — document it explicitly in the JSDoc.

**Error-toast pattern (PDF-specific):** UI-SPEC §"Error toast for PDF failure" provides full markup; the analog is `app/components/rate-limit-toast.tsx` (lines 50-73). Differences (UI-SPEC §"Error toast …"): `role="alert"` + `aria-live="assertive"` (vs `polite`), red palette (vs amber), two action buttons (retry + dismiss). Co-locate the toast inside `download-pdf-button.tsx` (not a shared component — distinct urgency/role).

**`aria-live` announcement pattern:** UI-SPEC §"Accessibility Contract":
- `<span className="sr-only" aria-live="polite">{state === "done" ? "PDF файлът е свален." : ""}</span>` inside the button.
- Dismissable error toast inherits `app/components/rate-limit-toast.tsx`'s announce-once-on-transition pattern (lines 28-46) — `useRef<string>("")` re-arms only on null↔set transitions, NOT on every retry.

---

### `app/audit/page.tsx` MODIFY (insert button into stats row)

**Analog:** self — the existing `<ul>` of `<Stat>` items at lines 91-97 + the existing `print:hidden` filter pills at line 102.

**Existing stats row** (lines 91-97):
```tsx
<ul className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm">
  <Stat n={stats.КРИТИЧНО} label="критични" tone="red" />
  <Stat n={stats.СЕРИОЗНО} label="сериозни" tone="orange" />
  <Stat n={stats.УМЕРЕНО}  label="умерени" tone="yellow" />
  <Stat n={stats.domains}  label="домейни" tone="stone" />
  <Stat n={stats.total}    label="общо находки" tone="stone" />
</ul>
```

**Apply (per UI-SPEC §"`/audit` layout — placement"):**
```tsx
<div className="mt-6 flex flex-wrap items-center justify-between gap-4">
  <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
    {/* existing 5 <Stat> items — no class change on the <ul> itself */}
  </ul>
  <DownloadPdfButton />  {/* component owns its print:hidden wrapper */}
</div>
```
Replace the `mt-6` from the `<ul>` to the wrapper `<div>` (single move). The `print:hidden` lives on the button's outermost element so the stats `<ul>` still renders in the rendered PDF.

**`print:hidden` precedent in same file** (lines 102, 114): existing filter pills already use this convention — `<div className="mt-6 flex flex-wrap gap-2 print:hidden">`. Reuse class name verbatim.

---

### `next.config.ts` MODIFY (add `outputFileTracingIncludes`)

**Analog:** self — existing `nextConfig` object with `redirects` and `headers` keys.

**Existing config** (lines 31-43):
```ts
const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/court", destination: "/courts", permanent: true },
      { source: "/court/:path*", destination: "/courts/:path*", permanent: true },
    ];
  },
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};
```
**Apply:** add per RESEARCH Pattern 5:
```ts
const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/audit/pdf": ["node_modules/@sparticuz/chromium/bin/**/*"],
  },
  async redirects() { /* existing */ },
  async headers() { /* existing */ },
};
```
**Note (RESEARCH-flagged):** `serverExternalPackages` is NOT needed — Next 16 auto-externalises both `puppeteer-core` and `@sparticuz/chromium`. The fallback expanded glob (`"node_modules/@sparticuz/chromium/lib/**/*"`) only if `bunx next build` shows missing files in the trace JSON (RESEARCH Pitfall 3).

---

### `db/intel_fts.sql` (NEW — migration / DDL)

**Analog:** `scripts/schema.sql` — the existing repo migration file. Idempotent DDL pattern.

**Idempotency pattern** (from `scripts/schema.sql:4-46`):
```sql
-- lex-web schema migration: analyses, issues, alerts
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS law_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ...
);
CREATE INDEX IF NOT EXISTS law_issues_analysis_id ON law_issues(analysis_id);

-- Public legal data — no PII. Anon key writes via the app are intentional.
ALTER TABLE law_analyses DISABLE ROW LEVEL SECURITY;
```
**Apply:** new file at `db/intel_fts.sql` (RESEARCH §"Recommended Project Structure" introduces the `db/` directory in lex-web). All statements use `IF NOT EXISTS`. Top-of-file comment block explains "idempotent" and credits the source pattern (`lex-brain/db/court_schema.sql`). Body verbatim from RESEARCH Pattern 1 — 6× `ALTER TABLE … ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (…) STORED;` + 6× `CREATE INDEX IF NOT EXISTS … USING gin(search_vector);` + the `intel_search_top(q text)` function from RESEARCH Pattern 2.

**Migration delivery (no precedent in lex-web for "the way migrations get applied"):**
- `scripts/apply-schema.ts` exists in `scripts/` — planner inspects whether it generalises to a second SQL file or whether `db/intel_fts.sql` is run via Supabase SQL editor / `psql $DATABASE_URL -f db/intel_fts.sql` as RESEARCH §"Migration delivery" suggests.
- Decision deferred to plan 02-01.

---

### Tests — `__tests__/intel-search-ranking.test.ts` and `__tests__/audit-pdf-route.test.ts`

**Analog:** `__tests__/use-rate-limited-fetch.test.tsx`, `__tests__/rate-limit.test.ts` — same vitest setup.

**Test-file imports + describe shape** (from `__tests__/use-rate-limited-fetch.test.tsx:1-9`):
```ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRateLimitedFetch } from "@/lib/use-rate-limited-fetch";

describe("useRateLimitedFetch (RL-01 hook contract)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  // it(...) blocks
});
```
**Apply:**
- `intel-search-ranking.test.ts` — pure-function tests for `RECENCY_HALF_LIFE_DAYS` math + score-blend (`0.7 * lex + 0.3 * rec`). No DB; no network. RESEARCH "Recommended Project Structure" explicitly scopes this.
- `audit-pdf-route.test.ts` — RESEARCH §"Recommended Project Structure" explicitly scopes a "smoke test that the route handler imports cleanly (full puppeteer test stays in UAT, not unit suite)". Pattern: `expect(() => import("@/app/api/audit/pdf/route")).not.toThrow()`.

**Vitest 4 reporter caveat (Phase 1 carry-over, RESEARCH Pitfall 6):** do NOT use `--reporter=basic` in any new npm script. The `default` reporter is fine.

---

## Shared Patterns (cross-cutting — applied everywhere relevant)

### Authentication / Authorization
**No pattern needed.** The project is anon-readable per `.planning/PROJECT.md` Auth Model. Service-role key only used by `/api/audit/vote`; new routes (`/api/audit/pdf`, `/api/intel/quote`, `/api/intel/search` GET) all stay anon. Phase 2 introduces zero new auth surface.

### Rate Limiting (REUSE — Phase 1 contract)
**Source:** `lib/rate-limit.ts:58-104` `rateLimited()`.
**Apply to:** all 3 new/modified API routes.
```ts
import { rateLimited } from "@/lib/rate-limit";
// ...
export async function POST(req: Request) {
  const limit = rateLimited(req, "<route-key>", { windowMs: 60_000, max: <N> });
  if (limit) return limit;
  // ...
}
```
- `/api/intel/quote` → `"intel-quote"`, `60_000`/`30` (RESEARCH Pattern 3)
- `/api/intel/search` GET → reuses existing `"intel-search"` key, `60_000`/`10` (or planner picks a sibling `"intel-results"` key if route splits)
- `/api/audit/pdf` → `"audit-pdf"`, `60_000`/`5` (RESEARCH Pattern 4)

### Structured Logging (REUSE — Phase 1 D-09/D-10 contract)
**Source:** `lib/rate-limit.ts:79-85` (already emits `rate_limit_throttled`); `hashIp(ip)` helper at lines 30-32.
**Apply to:** any new structured-log events on the search/PDF paths. Strict 5-key shape `{event, route, ip_hash, retry_after, ts}`.

If Phase 2 adds new events (per CONTEXT.md D-07 — name-only suggestion `intel_search_top5_extracted`):
```ts
import { createHmac } from "node:crypto";
const SALT = process.env.AUDIT_VOTE_SALT!;  // already required by lib/rate-limit.ts module-load
const ipHash = createHmac("sha256", SALT).update(ip).digest("hex").slice(0, 16);
console.log(JSON.stringify({
  event: "intel_search_top5_extracted",
  route: "intel-search",
  ip_hash: ipHash,
  retry_after: null,  // not throttled
  ts: new Date().toISOString(),
}));
```
**Caveat:** `hashIp` is currently file-private to `lib/rate-limit.ts`. If reused, planner exports it (small refactor, scope-creep risk — alternative is duplicating 3 lines).

### Anthropic streaming + abort propagation (REUSE)
**Source:** `app/api/intel/search/route.ts:76-103`.
**Apply to:** `/api/intel/quote` (only new streaming endpoint). The `{ signal: req.signal }` argument to `client.messages.stream(...)` is non-optional — preserves AI-07 abort chain (project context: "all streaming routes propagate client-disconnect to abort the upstream stream").

### Client streaming consumer (REUSE — Phase 1 hook)
**Source:** `app/intel/search/intel-search-summary.tsx:64-124`.
**Apply to:** any new client component that streams an Anthropic response (the article-card AI-quote sub-component). Use `useRateLimitedFetch` from `lib/use-rate-limited-fetch.ts` — never bare `fetch`.

### Response headers convention (REUSE)
**Source:** `app/api/intel/search/route.ts:104-109`.
**Apply to:** all new streaming responses:
```ts
{
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Accel-Buffering": "no",
}
```
For binary PDF response use `application/pdf` + `Content-Disposition: attachment` per RESEARCH Pattern 4 (no analog).

### Bulgarian-text convention (REUSE)
**Source:** UI-SPEC §"Copywriting Contract" — every visible label specified.
**Apply to:** all new strings in components, error toasts, system prompts. Imperative formal voice; `toLocaleString("bg-BG")` for any number; no exclamation marks (existing UI convention, verified in `app/audit/page.tsx`).

### Print path hooks (REUSE — no Phase 2 changes)
**Source:** `app/globals.css:43-130` `@media print` block. Already production-tested.
**Apply to:** new `<DownloadPdfButton />` outermost element gets `print:hidden`. Best-matches section + `/intel/search` are NOT printed (PDF is `/audit` only) — no print-specific rules needed for them.

---

## Files With No Direct Analog (planner uses RESEARCH.md patterns)

| File | Role | Why no analog | Source pattern |
|------|------|---------------|----------------|
| `app/api/audit/pdf/route.ts` (binary `Response` body) | binary download | No existing route returns `Content-Disposition: attachment` or non-text bytes. Closest match (`/api/audit/vote/route.ts`) returns JSON. | RESEARCH Pattern 4 (full route written out) |
| `app/audit/download-pdf-button.tsx` (blob → click) | blob download | No existing client component triggers a binary file download. `vote-button.tsx` is the closest state-machine analog but stops at JSON. | UI-SPEC §"Interaction States" + §"`Свали като PDF` button" specify the full markup |
| `db/intel_fts.sql` (location) | DB DDL location | `scripts/schema.sql` exists but is in `scripts/`, not `db/`. RESEARCH introduces `db/` mirroring `lex-brain/db/`. | RESEARCH Pattern 1 (full SQL); `scripts/schema.sql` for the idempotency style |
| `next.config.ts` `outputFileTracingIncludes` | Next config key | Existing config only has `redirects` + `headers`. The new key is documented but not yet present. | RESEARCH Pattern 5 (full config block) |

---

## Metadata

**Analog search scope:** `app/api/**`, `app/intel/**`, `app/audit/**`, `app/components/**`, `lib/**`, `scripts/**`, `__tests__/**`, `next.config.ts`, `app/globals.css`.
**Files scanned (read in full or grepped):** 16 files read; 14 directories listed.
**Skill directories probed:** `.claude/skills/` (absent), `.agents/skills/` (absent) — no project skills to apply.
**Project-instructions check:** `CLAUDE.md` + `AGENTS.md` (root + project) reduce to the Next-16-is-different reminder; RESEARCH already verified config + runtime patterns against `node_modules/next/dist/docs/`.
**Pattern extraction date:** 2026-05-10
