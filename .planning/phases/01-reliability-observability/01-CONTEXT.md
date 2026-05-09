# Phase 1: Reliability & observability - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Two independent reliability fixes that close the v2.1.x audit follow-ups:

1. **OpenSanctions ingestion (lex-brain Python)** — `scripts/scrape_opensanctions.py` currently does `r.text` then `csv.DictReader(io.StringIO(data))`, holding the entire ~300–500 MB CSV in memory. Replace with a streamed read so peak RSS stays under 200 MB on a 4 GB box.

2. **Rate-limit UX + observability (lex-web)** — the server (`lib/rate-limit.ts`) already returns `Retry-After` + a Bulgarian JSON body on 429, but the chat UIs naively dump the JSON text into an inline error. Surface a friendly countdown to the user and emit a structured throttle log line so per-route hit counts are observable from logs.

**Not in this phase:** the in-memory rate limiter stays in-memory (Phase 999.2 is the Vercel KV / distributed limiter). No changes to limit values, no new routes, no auth identity in the limiter (still IP + fingerprint only — auth lands in v2.3 / Phase 4+). No PDF, no intel-search-v2, no mobile pass.

</domain>

<decisions>
## Implementation Decisions

### Rate-limit UX rollout scope

- **D-01:** The new "rate-limited" UI behaviour rolls out to **all 8 rate-limited routes except `/api/analyze/[slug]`**, via a single shared client hook (working name: `useRateLimitedFetch` or equivalent — planner decides the exact name). The 8 callers:
  1. `app/laws/[slug]/chat.tsx` → `/api/chat/[slug]`
  2. court chat caller → `/api/courts/chat/[court]/[id]`
  3. court summarize caller → `/api/courts/summarize/[court]/[id]`
  4. EU chat caller → `/api/eu/chat/[celex]`
  5. EU summarize caller → `/api/eu/summarize/[celex]`
  6. issues chat caller → `/api/issues/chat`
  7. intel search caller → `/api/intel/search`
  8. compare caller → `/api/compare/[slug1]/[slug2]`
- **D-02:** `/analyze/[slug]` is intentionally excluded — it has its own multi-pass error UI, 300s `maxDuration`, and is gated by 3-req/5-min so the friendly-toast pattern would conflict with the long-running progress UX. It keeps the existing inline error.
- **D-03:** The success-criterion route (`/api/chat/[slug]`) MUST be among the converted callers — that one still drives acceptance.

### Countdown UI placement

- **D-04:** Toast / banner **above the chat surface** (not inline replacing the textarea content, not as a disabled-input badge). Placement: top of the chat column, dismissible, but auto-clears on countdown reaching 0 — at which point the user can re-submit.
- **D-05:** Countdown is **derived from the server response** — prefer the JSON `retry_after` (seconds, integer) over the `Retry-After` header (both exist; the JSON is what we already emit). The toast counts down once per second client-side; no server polling.
- **D-06:** Bulgarian text only. The server-emitted message ("Твърде много заявки. Моля, изчакайте.") is the source of truth; the toast appends the running countdown ("Опитайте отново след Ns") rendered client-side.
- **D-07:** Existing inline `setError(...)` paths still handle non-429 errors — the toast is 429-specific.

### Throttle log shape & location

- **D-08:** Logging happens **inside `rateLimited()` in `lib/rate-limit.ts`** — single source of truth, every call site benefits, no per-route boilerplate.
- **D-09:** Format is a **JSON one-liner** with the canonical shape:
  ```
  { "event": "rate_limit_throttled", "route": "<key>", "ip_hash": "<hex>", "retry_after": <seconds>, "ts": "<ISO>" }
  ```
  Emitted via `console.log(JSON.stringify(...))` (Vercel's log pipeline ingests stdout as structured JSON automatically).
- **D-10:** `ip_hash` is HMAC-SHA-256 of the IP keyed with the existing `AUDIT_VOTE_SALT` env var — reuse, don't introduce a new salt. Truncate to first 16 hex chars (8 bytes) so logs stay scannable.
- **D-11:** Log every throttle event (no sampling). Volume is bounded by the limit itself — once a slot is over the cap further hits in that window are throttled, so log volume cannot exceed the throttle rate.

### OpenSanctions streaming + memory assertion

- **D-12:** **Fork a new streamed retry helper** (e.g. `fetch_with_retry_stream` in `_lib/http_retry.py`) instead of trying to retrofit `fetch_with_retry_sync` — the existing helper returns a fully-buffered `Response` and changing its contract is risky for the other ~10 callers.
- **D-13:** New helper yields the underlying `httpx` streaming response so the call site can do `r.iter_lines()` (or wrap the byte stream in `io.TextIOWrapper` then feed `csv.reader` line-by-line). Retry semantics match the existing helper (same backoff, same retry-on-status set).
- **D-14:** Memory-peak assertion uses **`psutil.Process().memory_info().rss` sampled post-run** — i.e. record peak RSS during the streamed parse loop in a background thread / periodic check, then assert `peak_rss_mb < 200` at end of test. (Rationale: `tracemalloc` only tracks Python allocations; `httpx` + libcurl-ish behaviour can buffer at a lower layer, and the success criterion is OS-level RSS.)
- **D-15:** Test fixture is a **synthetic CSV** (~300 MB) generated in-test (write rows in a loop into a temp file or BytesIO over an HTTP mock). Not the live feed — tests must run offline and deterministically.
- **D-16:** Real-feed verification (one-shot manual run on the actual ~300–500 MB CSV) is part of phase verification (UAT), not the test suite.

### Claude's Discretion
- Exact name of the new client hook / fetch wrapper (e.g. `useRateLimitedFetch`, `fetchWithRateLimit`, etc.) — planner picks.
- Toast component implementation: hand-rolled Tailwind + `aria-live="polite"` vs. an existing toast primitive in the codebase (planner to scout for one before deciding).
- Whether the new streamed helper lives in `_lib/http_retry.py` or a new module (`_lib/http_stream.py`) — planner / executor decision.
- psutil sampling cadence (every N rows vs. timer-based) — both are acceptable so long as peak RSS is captured.
- Whether to factor a small helper around `console.log(JSON.stringify(...))` in `lib/log.ts` or keep the JSON.stringify inline — planner / executor.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project + milestone

- `.planning/PROJECT.md` — overall stack, "no login" assumption (still in force for Phase 1; v2.3 reverses), security baseline section (Key Decisions row "In-memory rate limiter, not Vercel KV").
- `.planning/REQUIREMENTS.md` — OS-01, RL-01 success criteria; v2.2 traceability.
- `.planning/ROADMAP.md` §"Phase 1: Reliability & observability" — phase goal, success criteria, plan stubs.

### lex-web (Next.js)

- `lib/rate-limit.ts` — current `rateLimited()` impl (lines 39-69 emit 429 + `Retry-After` + JSON body). Reuse `getClientIp` for hashing.
- `app/laws/[slug]/chat.tsx` lines 200-254 — the canonical chat-fetch shape; D-04 toast wires here. Mirror this loop in the shared hook.
- `app/api/chat/[slug]/route.ts` — the success-criterion route; uses `rateLimited(req, "chat", { windowMs: 60_000, max: 10 })`. Must be in the converted set.
- All 7 other rate-limited callers — see the path list in D-01. Each will need the new shared hook applied to its fetch.

### lex-brain (sibling Python repo)

- `/Users/beyond/Desktop/lex-brain/scripts/scrape_opensanctions.py` — OOM site at lines 71-90 (`r.text` → `io.StringIO(data)` → `csv.DictReader(...)`). Modify in place, not rewrite.
- `/Users/beyond/Desktop/lex-brain/scripts/_lib/http_retry.py` — existing `fetch_with_retry_sync`. Add `fetch_with_retry_stream` alongside (D-12). Other callers MUST keep working unchanged.

### Env & infra

- `AUDIT_VOTE_SALT` (Vercel + local `.env`) — reused for IP hashing in throttle logs (D-10). Already required, no new env var.

### External (read for `httpx.stream` + `psutil` patterns only)

- `httpx` docs — `Client.stream()` context manager, `iter_lines()` / `iter_bytes()`. Use Context7 if anything is unclear at planning time.
- `psutil.Process().memory_info().rss` — peak-RSS sampling pattern in tests.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`rateLimited()` in `lib/rate-limit.ts`** — already returns the body shape we need. Just add a `console.log(JSON.stringify(...))` line in the over-cap branch (right before `return new Response(...)`).
- **`getClientIp(req)`** in same file — reuse for the IP source before hashing.
- **`AUDIT_VOTE_SALT`** — already required env var (PROJECT.md "Key Decisions" §`AUDIT_VOTE_SALT mandatory`); reuse it instead of introducing `RATE_LIMIT_SALT`.
- **`fetch_with_retry_sync`** in `lex-brain/scripts/_lib/http_retry.py` — the retry policy (backoff, retryable status set) is the source of truth; copy that policy into the new streamed helper, don't reinvent.
- **`abortRef.current` + `AbortController`** pattern in `app/laws/[slug]/chat.tsx:208` — the shared hook needs to preserve this so users can still cancel mid-stream (this propagates upstream to Anthropic; do NOT regress the v2.1 work).

### Established Patterns

- **rate-limit-then-stream** in every Anthropic route — `rateLimited(...)` is the very first call in the POST handler, before reading the body. Preserved.
- **Streaming responses** — chat-style routes use `runtime: "nodejs"` + `maxDuration` and stream Anthropic output. Toast must not block the streaming consumer; it's a sibling concern (separate state, shows on `res.status === 429` *before* the reader starts).
- **Bulgarian Cyrillic UI strings** — every user-visible string is BG. Toast text is BG. Existing server message is BG.
- **`runtime: "nodejs"` + `maxDuration`** on all streaming routes — no edge runtime; logs go to stdout and Vercel ingests them.
- **`{ error, retry_after }` JSON envelope on 429** — already standardised by `rateLimited()`. Hook parses this shape. Non-429 errors still come back as text (older `setError(text)` path) — keep that fallback.

### Integration Points

- **Hook → 8 fetch sites.** New `useRateLimitedFetch` (or equivalent) lives in `lib/` (e.g. `lib/use-rate-limited-fetch.ts`). Each of the 8 caller files imports it and replaces its bespoke `fetch + setError` block. The hook owns the toast state via context or a prop callback.
- **Toast → page-level layout.** Toast component renders into a fixed top-of-chat region. Each chat page either renders `<RateLimitToast />` itself or the hook returns the JSX/state for it.
- **Streamed helper → scrape_opensanctions.py.** `with client.stream("GET", CSV_URL) as r:` replaces the `r = fetch_with_retry_sync(client, CSV_URL)` line; `csv.reader(io.TextIOWrapper(r.iter_bytes(), encoding="utf-8"))` replaces `csv.DictReader(io.StringIO(data))`. Existing per-row processing loop is unchanged.
- **psutil → test file.** Add `psutil` to `lex-brain/pyproject.toml` test extras if not present; add a `tests/test_opensanctions_memory.py` (or similar) that runs the scraper against a synthetic CSV and asserts `peak_rss_mb < 200`.

</code_context>

<specifics>
## Specific Ideas

- The throttle log line goes to `stdout` only (no Sentry, no external sink). Vercel auto-ingests and the log line is grep-able by `event:rate_limit_throttled` in Vercel's log explorer.
- The toast auto-clears at countdown 0 — user shouldn't have to click anything to retry. (D-04.)
- Re-submission while still rate-limited (e.g. user clicks before 0) just re-fires the toast / extends the visible countdown to whatever the new server response says. No client-side guard needed beyond the existing `busy` flag pattern.
- The synthetic test CSV doesn't need realistic data — repeating ASCII rows of the right shape (id, schema, name, … countries=BG, sanctions=…) is enough. Goal is byte-volume, not data realism.

</specifics>

<deferred>
## Deferred Ideas

- **Distributed (Vercel KV / Upstash) rate limiter** — already captured as Phase 999.2. Phase 1 keeps the in-memory limiter as-is.
- **Per-route limit-value tuning** — Phase 1 surfaces the existing throttle in UI; it does NOT change `windowMs` or `max`. If observability reveals tuning needs, that's a follow-on.
- **Authenticated rate-limit identity** (user_id-based throttle instead of IP) — irrelevant until v2.3 / Phase 4+ ships auth. Not Phase 1's problem.
- **Sentry / external log aggregation** — out of scope; stdout to Vercel log explorer is sufficient observability for v2.2.
- **`/analyze/[slug]` getting the toast UX** — explicitly left out (D-02). If the analyze UX is later reworked, that's its own phase.
- **OpenSanctions API-key path** — the retry helper already gracefully falls back to a "sign up for an API key" message on bulk-feed unavailability. Not changed by Phase 1.

</deferred>

---

*Phase: 1-Reliability & observability*
*Context gathered: 2026-05-09*
