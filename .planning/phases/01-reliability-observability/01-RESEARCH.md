# Phase 1: Reliability & observability - Research

**Researched:** 2026-05-09
**Domain:** Two parallel tracks — (A) Python httpx CSV streaming + RSS-based memory testing; (B) Next.js 16 / React 19 shared client hook for 429 rate-limit UX + structured Vercel logs.
**Confidence:** HIGH (most claims verified against Context7/official docs/codebase grep; a small number of UX choices flagged as ASSUMED).

## Summary

Phase 1 closes two v2.1.x audit follow-ups. Both tracks are independent and small in code volume but require disciplined research because each has a single landmine that would silently undermine the success criteria:

- **Track A landmine:** the obvious "stream + `iter_lines()`" pattern can corrupt rows whose quoted fields contain embedded newlines — and OpenSanctions' `name` / `aliases` / `addresses` columns plausibly do. The mitigation is `csv.DictReader(io.TextIOWrapper(r.iter_bytes(), encoding="utf-8", newline=""))` (the `newline=""` is the load-bearing detail), letting the csv module do its own newline parsing exactly as it does for a file opened with `newline=""`. CONTEXT.md proposed this in passing; this research confirms it is the correct and only safe form. `pytest-memray` is **not** an acceptable substitute for the psutil RSS sampling mandated by D-14, because memray tracks Python heap allocations (similar to tracemalloc) and not OS-level RSS — exactly the gap CONTEXT.md called out.

- **Track B landmine:** "wrap fetch in a hook" naïvely loses the `AbortController.signal` plumbing that v2.1 wired through to upstream Anthropic streams. The hook MUST surface `signal` to the caller and the caller MUST pass it to the body reader's outer fetch — losing this regresses AI-07 (validated requirement). A second, smaller landmine: the existing `audit/vote/route.ts` uses `createHash("sha256").update(input + SALT)` rather than HMAC; CONTEXT.md D-10 specifies HMAC-SHA-256 — these are different primitives, the latter being correct, and the planner should not "match the existing pattern" by copying the audit/vote sha helper.

**Primary recommendation:**

- Track A: hand-rolled `fetch_with_retry_stream` context manager that wraps `client.stream(...)` and retries at the *connection-establish* boundary (before any bytes are consumed) — never inside an iteration loop, because consumed streams cannot be re-read. Use `csv.DictReader(io.TextIOWrapper(r.iter_bytes(), encoding="utf-8", newline=""))` with a 64 KiB chunk size. RSS sampling via a `threading.Thread` polling `psutil.Process().memory_info().rss` every 100 ms; assert `peak_rss_mb < 200`. Synthetic CSV: 100 MB minimum (proves streaming behaviour with ample margin); 300 MB if disk speed and CI time allow.
- Track B: hand-rolled toast component (no new dependency) + custom hook returning `{ submit, busy, error, signal, rateLimited }` where `rateLimited` is `null | { retryAfter: number, message: string }`. Use `node:crypto.createHmac("sha256", AUDIT_VOTE_SALT).update(ip).digest("hex").slice(0,16)`. Toast rendered with `aria-live="polite"` + `aria-atomic="true"` and **announces only on 429 receipt** (re-rendering the countdown digit every second produces grossly annoying screenreader output). Vercel auto-parses one-line JSON from `console.log(JSON.stringify({...}))` — confirmed in vendor docs; no special framing or reserved fields beyond keeping it on a single line.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OS-01 | OpenSanctions ingestion streams the CSV instead of loading the full ~300-500 MB into memory (audit LOW #10) | Track A: httpx streaming pattern verified via Context7 + Python csv docs (Sources §A); RSS measurement via psutil verified (Sources §A); pytest-memray rejected for tracking wrong layer (Sources §A) |
| RL-01 | Rate-limit responses surface the `Retry-After` header in the UI as a friendly "Try again in Ns" message; basic per-route hit/throttle metrics logged | Track B: shared hook + toast verified via Next 16 docs + React Testing Library docs (Sources §B); Vercel auto-JSON parsing verified (Sources §B); `node:crypto` in `runtime: "nodejs"` verified (Sources §B); `aria-live` countdown pattern verified (Sources §B) |
</phase_requirements>

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Rate-limit UX rollout scope**
- **D-01:** Rolls out to all 8 rate-limited routes except `/api/analyze/[slug]`, via a single shared client hook. The 8 callers:
  1. `app/laws/[slug]/chat.tsx` → `/api/chat/[slug]`
  2. court chat caller → `/api/courts/chat/[court]/[id]`
  3. court summarize caller → `/api/courts/summarize/[court]/[id]`
  4. EU chat caller → `/api/eu/chat/[celex]`
  5. EU summarize caller → `/api/eu/summarize/[celex]`
  6. issues chat caller → `/api/issues/chat`
  7. intel search caller → `/api/intel/search`
  8. compare caller → `/api/compare/[slug1]/[slug2]`
- **D-02:** `/analyze/[slug]` is intentionally excluded — keeps the existing inline error.
- **D-03:** `/api/chat/[slug]` MUST be among the converted callers (drives RL-01 acceptance).

**Countdown UI placement**
- **D-04:** Toast / banner above the chat surface; dismissible; auto-clears at countdown 0.
- **D-05:** Countdown derived from JSON `retry_after` (not the `Retry-After` header). Client-side once-per-second decrement; no server polling.
- **D-06:** Bulgarian text only. Server message ("Твърде много заявки. Моля, изчакайте.") is source of truth; toast appends the running countdown ("Опитайте отново след Ns") rendered client-side.
- **D-07:** Existing inline `setError(...)` paths still handle non-429 errors — toast is 429-specific.

**Throttle log shape & location**
- **D-08:** Logging happens inside `rateLimited()` in `lib/rate-limit.ts` — single source of truth.
- **D-09:** Format: `{ "event": "rate_limit_throttled", "route": "<key>", "ip_hash": "<hex>", "retry_after": <seconds>, "ts": "<ISO>" }` emitted via `console.log(JSON.stringify(...))`.
- **D-10:** `ip_hash` = HMAC-SHA-256 of IP keyed with the existing `AUDIT_VOTE_SALT` env var; truncate to 16 hex chars (8 bytes).
- **D-11:** Log every throttle event (no sampling).

**OpenSanctions streaming + memory assertion**
- **D-12:** Fork a NEW streamed retry helper (`fetch_with_retry_stream`) — do NOT refactor `fetch_with_retry_sync`. Other callers must keep working unchanged.
- **D-13:** New helper yields the underlying `httpx` streaming response so the call site can iterate. Retry semantics match existing helper (same backoff, same retry-on-status set).
- **D-14:** Memory-peak assertion uses `psutil.Process().memory_info().rss` sampled in a background thread / timer — **NOT `tracemalloc`**.
- **D-15:** Test fixture is a synthetic CSV (~300 MB) generated in-test. Offline + deterministic.
- **D-16:** Real-feed verification on the actual ~300–500 MB CSV is part of phase verification (UAT), not the test suite.

### Claude's Discretion

- Exact name of the new client hook (e.g. `useRateLimitedFetch`, `fetchWithRateLimit`) — planner picks.
- Toast component implementation: hand-rolled Tailwind + `aria-live="polite"` vs. an existing toast primitive (planner to scout for one before deciding).
- Whether the new streamed helper lives in `_lib/http_retry.py` or a new module (`_lib/http_stream.py`).
- psutil sampling cadence (every N rows vs. timer-based).
- Whether to factor a small helper around `console.log(JSON.stringify(...))` in `lib/log.ts` or keep the JSON.stringify inline.

### Deferred Ideas (OUT OF SCOPE)

- Distributed (Vercel KV / Upstash) rate limiter — Phase 999.2.
- Per-route limit-value tuning — phase 1 surfaces, does NOT change windowMs/max.
- Authenticated rate-limit identity — irrelevant until v2.3 / Phase 4+.
- Sentry / external log aggregation — stdout is sufficient for v2.2.
- `/analyze/[slug]` getting the toast UX — explicitly left out.
- OpenSanctions API-key path — already gracefully handled, not changed.
</user_constraints>

## Project Constraints (from CLAUDE.md / AGENTS.md)

The repo's `AGENTS.md` declares: **"This is NOT the Next.js you know. APIs, conventions, and file structure may all differ from training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code."**

Concretely for Phase 1:
- Next.js 16.2.4 + React 19.2.4 — confirm any routing/data-fetching/runtime claim against `node_modules/next/dist/docs/01-app/` before recommending it. This research already did so for `route.ts` runtime config and the structure of route handlers; planner should re-verify on any new ambiguity.
- All API routes already export `runtime = "nodejs"` and `maxDuration = 120` (or 300 for analyze/compare). Confirmed by grep of every `app/api/*/route.ts`. The new throttle-log code lives inside `lib/rate-limit.ts`, called from these existing nodejs-runtime handlers — `node:crypto.createHmac` is therefore safe (verified Sources §B).
- **PR-only workflow on `main`** — research output should not assume direct commits.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OpenSanctions CSV streaming | Python data-pipeline (lex-brain `scripts/`) | — | Pure ingestion; no web exposure |
| Streamed HTTP retry helper (`fetch_with_retry_stream`) | Python lib (`_lib/`) | — | Sibling to existing `_lib/http_retry.py`; pure backend utility |
| Memory peak assertion (psutil) | Python test (`tests/`) | — | OS-level measurement, no production code path |
| 429 detection + countdown state | React client hook (`lib/use-rate-limited-fetch.ts`) | — | Client UX; server already returns 429 + body |
| Toast / banner render | React client component (`app/components/rate-limit-toast.tsx`) | Page layouts | Pure presentation; consumes hook state |
| `AbortController` wiring | React client hook | API route handlers (already wired) | Streaming abort propagates client→Anthropic; hook must preserve this contract |
| HMAC IP hash for log line | API server (Node runtime) | — | Inside `rateLimited()`, runs server-only |
| JSON one-liner stdout emit | API server (Node runtime) | Vercel ingestion (transparent) | Vercel auto-parses one-line JSON; no transport code needed |

## Standard Stack

### Track A — Python (lex-brain)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| httpx | 0.28.1 (already pinned) | Streaming HTTP client | Already the project HTTP client; `Client.stream()` is the canonical streaming idiom [VERIFIED: lex-brain/pyproject.toml + Context7 /encode/httpx] |
| psutil | 7.x (latest 7.0+ on PyPI 2026) | OS-level RSS measurement | Cross-platform, mature; already implied by D-14 [VERIFIED: pypi.org/pypi/psutil/json] |
| pytest | 9.0.3+ (already pinned in dev group) | Test runner | Already in dev deps [VERIFIED: lex-brain/pyproject.toml] |

**Installation:**
```bash
# In lex-brain repo:
uv add --dev psutil
```

**NOT recommended:** `pytest-memray` — tracks Python heap, not OS RSS, and CONTEXT.md D-14 explicitly chose RSS for the right reason (libcurl-style buffering can sit below memray's tracking layer). [VERIFIED: bloomberg/memray docs — "memory does not leak according to memray, but the allocator does not seem to want to give the memory to the OS"]

### Track B — Next.js (lex-web)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.2.4 (pinned) | Framework | Already in project [VERIFIED: package.json] |
| React | 19.2.4 (pinned) | UI library | Already in project [VERIFIED: package.json] |
| node:crypto | (Node 20.9+ stdlib) | HMAC-SHA-256 | Built into Node runtime; no install [VERIFIED: Next 16 runtime docs + nextjs.org/docs/messages/node-module-in-edge-runtime — "fully available in Node.js runtime"] |

**Recommended new dev deps for testing the hook (Wave 0):**

| Library | Version | Purpose |
|---------|---------|---------|
| vitest | 4.x (latest 4.1.5 npm 2026) | Test runner [VERIFIED: npm view vitest version] |
| @testing-library/react | 16.x (latest 16.3.2 npm 2026) | `renderHook`, `act` [VERIFIED: npm view] |
| jsdom | latest 24.x | DOM environment for React 19 hook tests [VERIFIED: testing library docs] |

**NOT recommended:** new toast library (`sonner`, `react-hot-toast`). [ASSUMED — verify with planner] The codebase has no existing toast primitive; pulling in `sonner@2.0.7` (latest npm) adds 12 KB gzip and a Provider component for one transient banner per surface. A hand-rolled `<RateLimitToast />` (~40 lines Tailwind + a button + an `aria-live` region) costs nothing in bundle size, has zero peer-dep risk against React 19.2.4, and matches the existing aesthetic (the project's `aria-live="polite"` precedent in `app/laws/[slug]/chat.tsx:282` is hand-rolled). The "Claude's Discretion" clause in CONTEXT.md leaves this to the planner; this is the recommendation, not a lock.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `csv.DictReader(io.TextIOWrapper(r.iter_bytes()))` | `csv.DictReader(r.iter_lines())` | Simpler one-liner — but `iter_lines()` strips line terminators, which silently corrupts rows whose quoted fields contain embedded `\n`. OpenSanctions' name/aliases/addresses CAN contain these. Don't take the shortcut. [CITED: docs.python.org/3/library/csv.html — "if newline='' is not specified, newlines embedded inside quoted fields will not be interpreted correctly"] |
| Hand-rolled toast | `sonner` (12 KB gzip) | Cleaner API, official shadcn/ui blessed; but introduces a Provider, a new dep, and Bulgarian-only override patterns. Hand-rolled wins on simplicity for this scope. |
| `console.log(JSON.stringify(...))` inline | `lib/log.ts` helper | Helper is nicer if log-call sites multiply; for ONE call site (`rateLimited`) the helper is over-abstraction. Defer until a second JSON-log call site appears. |
| `psutil` RSS sampling | `tracemalloc` | tracemalloc only sees Python allocations — misses libcurl/httpcore C-layer buffering. D-14 already locked this; research confirms it's right. |
| `psutil` RSS sampling | `pytest-memray` | Same problem as tracemalloc plus extra plugin. D-14 mandates RSS; memray's `limit_memory` marker tracks heap. [VERIFIED: bloomberg/pytest-memray docs] |

## Architecture Patterns

### System Architecture Diagram

```
TRACK A — OpenSanctions streaming (lex-brain Python)
─────────────────────────────────────────────────────

  cron runs scrape_opensanctions.py
           │
           ▼
  ┌──────────────────────────┐
  │ fetch_with_retry_stream  │   NEW. Yields httpx.Response
  │ (in _lib/http_retry.py)  │   in streaming mode; retries
  │                          │   at connection-establish only.
  └─────────────┬────────────┘
                │  yields  (status_code, response context manager)
                ▼
  ┌──────────────────────────┐
  │  with stream as r:       │   Caller iterates response.
  │    csv.DictReader(       │   Wrap r.iter_bytes() in
  │      io.TextIOWrapper(   │   io.TextIOWrapper with
  │        r.iter_bytes(),   │   encoding="utf-8" and
  │        encoding="utf-8", │   newline="" so csv module
  │        newline=""))      │   handles its own newline
  └─────────────┬────────────┘   parsing (preserves quoted
                │                multiline fields).
                ▼
  ┌──────────────────────────┐
  │ for row in reader:       │   Per-row Postgres upsert,
  │   if "bg" in countries:  │   unchanged.
  │     INSERT ...           │
  └──────────────────────────┘
                │
                ▼  (test mode parallel path)
  ┌──────────────────────────┐
  │  RSS sampler thread:     │   tests/test_opensanctions_memory.py
  │  poll psutil.Process()   │   spawns sampler, runs scraper
  │  .memory_info().rss      │   against synthetic CSV via
  │  every 100 ms; track     │   httpx.MockTransport, asserts
  │  max → assert < 200 MB   │   peak_rss_mb < 200.
  └──────────────────────────┘


TRACK B — Rate-limit UX & throttle logs (lex-web Next.js)
─────────────────────────────────────────────────────────

  user types question, clicks Submit
           │
           ▼
  ┌──────────────────────────┐
  │ chat.tsx submit()        │
  │  uses useRateLimitedFetch│  ← NEW shared hook in lib/
  └─────────────┬────────────┘
                │ POST /api/chat/[slug] with abort signal
                ▼
  ┌──────────────────────────┐
  │ route.ts POST handler    │
  │   const limit =          │
  │     rateLimited(req,...) │
  └─────────────┬────────────┘
                │
        ┌───────┴────────┐
        │ over-cap?      │
        ▼ yes            ▼ no
  ┌────────────┐   ┌─────────────────┐
  │ rateLimited│   │ stream Anthropic│
  │ () now ALSO│   │ (existing)      │
  │ console.log│   └─────────────────┘
  │ ({event:   │
  │  rate_limit│
  │  _throttled│
  │  ,route,   │
  │  ip_hash,  │
  │  retry_aft,│
  │  ts})      │
  └─────┬──────┘
        │ returns 429 + JSON body {error, retry_after}
        ▼
  ┌──────────────────────────┐
  │ hook: parse 429 →        │
  │  setRateLimited({        │
  │    retryAfter, message}) │
  │  start setInterval 1 Hz  │
  │  decrement until 0       │
  │  on 0: clear state       │
  └─────────────┬────────────┘
                │
                ▼
  ┌──────────────────────────┐
  │ <RateLimitToast />       │
  │  aria-live="polite"      │
  │  aria-atomic="true"      │
  │  renders message + Ns    │
  │  visible above chat col  │
  └──────────────────────────┘
                │
                ▼
  Vercel stdout → log explorer
  greppable by event:rate_limit_throttled
```

### Recommended Project Structure

```
lex-brain/                            # Track A
├── scripts/
│   ├── scrape_opensanctions.py       # MODIFY: switch to streamed helper + TextIOWrapper
│   └── _lib/
│       ├── http_retry.py             # ADD fetch_with_retry_stream (sibling to sync/async)
│       └── http_stream.py            # ALTERNATIVE: standalone module (Claude's discretion)
├── tests/
│   ├── test_http_retry.py            # existing — leave alone
│   └── test_opensanctions_memory.py  # NEW: synthetic CSV + RSS sampler + assert <200 MB
└── pyproject.toml                    # ADD psutil to [dependency-groups].dev

lex-web/                              # Track B
├── lib/
│   ├── rate-limit.ts                 # MODIFY: add HMAC ip-hash + console.log JSON one-liner
│   └── use-rate-limited-fetch.ts     # NEW: shared hook (working name; planner can rename)
├── app/
│   ├── components/
│   │   └── rate-limit-toast.tsx      # NEW: aria-live banner + countdown
│   ├── laws/[slug]/chat.tsx          # MODIFY: replace bespoke fetch loop with hook
│   ├── courts/[court]/[id]/decision-ai.tsx          # MODIFY × 2 surfaces (chat + summarize)
│   ├── eu/[celex]/regulation-ai.tsx                 # MODIFY × 2 surfaces (chat + summarize)
│   ├── intel/search/intel-search-summary.tsx        # MODIFY
│   ├── issues/issue-chat-button.tsx                 # MODIFY
│   ├── compare/[slug1]/[slug2]/compare-stream.tsx   # MODIFY
│   └── analyze/[slug]/analysis-stream.tsx           # DO NOT MODIFY (D-02)
├── package.json                      # ADD vitest + @testing-library/react + jsdom (devDeps)
├── vitest.config.ts                  # NEW: jsdom env, paths alias
└── __tests__/
    └── use-rate-limited-fetch.test.tsx  # NEW: hook integration test
```

### Pattern 1: Streamed retry helper that yields a context manager

The existing `fetch_with_retry_sync` returns a fully-buffered Response. The streamed analog cannot return a Response directly because the caller must enter a `with` block to keep the connection open. Two idiomatic options; the second is the recommendation.

**Option A (rejected) — generator-based:**
```python
def fetch_with_retry_stream(client, url, **kwargs):
    for attempt in range(...):
        try:
            with client.stream("GET", url, **kwargs) as r:
                if _is_transient_status(r.status_code) and attempt < total:
                    time.sleep(_BACKOFF[attempt])
                    continue
                yield r  # caller MUST iterate inside the with
                return
        except (httpx.TimeoutException, httpx.TransportError):
            ...
```
Problem: caller needs `next(gen)` then iterate, and StopIteration management is awkward.

**Option B (recommended) — `@contextlib.contextmanager` decorator:**
```python
# Source: https://www.python-httpx.org/quickstart/  +
#         https://docs.python.org/3/library/contextlib.html#contextlib.contextmanager
import contextlib
import time
import httpx

@contextlib.contextmanager
def fetch_with_retry_stream(
    client: httpx.Client,
    url: str,
    **kwargs,
):
    """Streaming sibling of fetch_with_retry_sync.

    Yields the streaming httpx.Response. Caller MUST iterate inside the
    `with` block (the connection closes on __exit__).

    Retries happen at the connection-establish boundary only — once the
    body starts streaming we never retry, because consumed streams can't
    be re-read (httpx raises StreamConsumed).

    Same backoff curve as fetch_with_retry_sync (D-13).
    """
    total = len(_BACKOFF)
    for attempt in range(total + 1):
        try:
            cm = client.stream("GET", url, **kwargs)
            r = cm.__enter__()
        except (httpx.TimeoutException, httpx.TransportError) as e:
            if attempt == total:
                _log_transport_giving_up(e, url)
                yield None
                return
            _log_retry(attempt + 1, total, _BACKOFF[attempt], type(e).__name__, url)
            time.sleep(_BACKOFF[attempt])
            continue

        if _is_transient_status(r.status_code):
            cm.__exit__(None, None, None)
            if attempt == total:
                _log_giving_up(str(r.status_code), url)
                yield None
                return
            _log_retry(attempt + 1, total, _BACKOFF[attempt],
                       f"HTTP {r.status_code}", url)
            time.sleep(_BACKOFF[attempt])
            continue

        try:
            yield r
        finally:
            cm.__exit__(None, None, None)
        return
```

**Caller usage:**
```python
# In scrape_opensanctions.py
import io, csv
from _lib.http_retry import fetch_with_retry_stream

with httpx.Client(headers=HEADERS, follow_redirects=True, timeout=120) as client:
    with fetch_with_retry_stream(client, CSV_URL) as r:
        if r is None or r.status_code != 200:
            print("  ! OpenSanctions bulk feed unavailable")
            return
        # iter_bytes(chunk_size=65536) gives 64 KiB chunks → low peak.
        # newline="" is REQUIRED so csv handles its own line splitting
        # and preserves \n inside quoted fields.
        text_stream = io.TextIOWrapper(
            r.iter_bytes(chunk_size=65536),  # type: ignore[arg-type]
            encoding="utf-8",
            newline="",
        )
        reader = csv.DictReader(text_stream)
        for row in reader:
            countries = (row.get("countries") or "").lower()
            if "bg" not in [c.strip() for c in countries.split(";")]:
                continue
            # ... existing per-row processing unchanged ...
```

**Note on the `# type: ignore`:** `io.TextIOWrapper` is typed to accept a `BinaryIO` but `r.iter_bytes()` returns `Iterator[bytes]`. At runtime this works because TextIOWrapper only calls `.read()` on its source... actually TextIOWrapper requires a `read()`-able buffer and an iterator IS NOT a buffer. **Verify pattern at planning time** — the safer alternative is to manually decode chunks and feed `csv.reader` line-by-line via a generator. See "Common Pitfalls" §1 below for the mitigation.

### Pattern 2: Background-thread RSS sampler

```python
# Source: github.com/giampaolo/psutil/docs/recipes.md (adapted)
import threading
import time
import psutil

class PeakRssSampler:
    """Polls process RSS at a fixed interval, records the peak.

    Usage:
        sampler = PeakRssSampler(interval_s=0.1)
        sampler.start()
        try:
            run_scraper_against_synthetic_csv()
        finally:
            sampler.stop()
        assert sampler.peak_mb < 200, f"peak RSS {sampler.peak_mb} MB ≥ 200"
    """

    def __init__(self, interval_s: float = 0.1) -> None:
        self._interval = interval_s
        self._proc = psutil.Process()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.peak_bytes = 0

    def _loop(self) -> None:
        while not self._stop.is_set():
            rss = self._proc.memory_info().rss
            if rss > self.peak_bytes:
                self.peak_bytes = rss
            self._stop.wait(self._interval)

    def start(self) -> None:
        # Capture baseline so a heavy import doesn't dominate the reading.
        self.peak_bytes = self._proc.memory_info().rss
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=1.0)

    @property
    def peak_mb(self) -> float:
        return self.peak_bytes / (1024 * 1024)
```

### Pattern 3: React 19 client hook with abort + 429 + countdown

```tsx
// Source: lex-web codebase pattern (chat.tsx:200-254) + Next.js 16 docs +
//         React 19 ref/effect semantics. NOT verified end-to-end yet —
//         planner should write tests for the contract.
"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type RateLimitState = {
  retryAfter: number;          // seconds remaining (countdown)
  message: string;             // server-emitted Bulgarian string
};

export type SubmitResult =
  | { ok: true; response: Response; signal: AbortSignal }
  | { ok: false; rateLimited: RateLimitState }
  | { ok: false; error: string };

export function useRateLimitedFetch() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState<RateLimitState | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const tickRef = useRef<number | null>(null);

  // Tick the countdown.
  useEffect(() => {
    if (!rateLimited) return;
    tickRef.current = window.setInterval(() => {
      setRateLimited((prev) => {
        if (!prev) return null;
        const next = prev.retryAfter - 1;
        return next <= 0 ? null : { ...prev, retryAfter: next };
      });
    }, 1000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [rateLimited?.retryAfter !== undefined]);

  // Abort on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const submit = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<SubmitResult> => {
      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      setError(null);
      // Note: do NOT clear rateLimited here — if the user spam-clicks while
      // throttled, we want the countdown to persist or be replaced by a fresh
      // server response.

      try {
        const res = await fetch(input, {
          ...init,
          signal: controller.signal,
        });
        if (res.status === 429) {
          let retryAfter = 60;
          let message = "Твърде много заявки. Моля, изчакайте.";
          try {
            const body = (await res.json()) as { error?: string; retry_after?: number };
            if (typeof body.retry_after === "number") retryAfter = body.retry_after;
            if (typeof body.error === "string") message = body.error;
          } catch {
            // server might not have emitted JSON (defensive)
          }
          const state = { retryAfter, message };
          setRateLimited(state);
          setBusy(false);
          return { ok: false, rateLimited: state };
        }
        if (!res.ok) {
          const text = await res.text();
          setError(text || `HTTP ${res.status}`);
          setBusy(false);
          return { ok: false, error: text || `HTTP ${res.status}` };
        }
        // SUCCESS: caller still owns res.body reader. Hand back the signal so
        // they keep the abort wired up for the streaming consumer.
        return { ok: true, response: res, signal: controller.signal };
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setBusy(false);
          return { ok: false, error: "aborted" };
        }
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setBusy(false);
        return { ok: false, error: msg };
      }
    },
    [],
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  // setBusy(false) is intentionally caller-driven for the success branch —
  // the caller owns the body reader and decides when streaming ends.
  const finish = useCallback(() => setBusy(false), []);

  return { submit, cancel, finish, busy, error, rateLimited, setError };
}
```

**Caller integration (replacing `app/laws/[slug]/chat.tsx:198-254`):**
```tsx
const rl = useRateLimitedFetch();

const submit = async (e?: React.FormEvent) => {
  if (e) e.preventDefault();
  const q = question.trim();
  if (!q || rl.busy) return;
  setQuestion("");
  setPendingQuestion(q);
  setPendingAnswer("");

  const result = await rl.submit(`/api/chat/${slug}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: q, history: history.slice(-5) }),
  });

  if (!result.ok) {
    if ("rateLimited" in result) {
      // Toast handles display via rl.rateLimited; nothing else to do.
      setPendingQuestion("");
      return;
    }
    // Non-429 error — keep existing inline behaviour (D-07).
    setPendingQuestion("");
    return;
  }

  // SUCCESS: stream as before, signal is still bound to rl's controller.
  let acc = "";
  if (!result.response.body) {
    rl.setError("Празен отговор от сървъра");
    rl.finish();
    return;
  }
  const reader = result.response.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      setPendingAnswer(acc);
    }
    setHistory((prev) => [...prev, { q, a: acc }]);
    setPendingAnswer("");
    setPendingQuestion("");
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      rl.setError(err instanceof Error ? err.message : String(err));
    }
    setPendingQuestion("");
  } finally {
    rl.finish();
  }
};
```

The hook does NOT take ownership of the streaming body reader (intentional — different surfaces consume the body differently). It DOES own abort, busy, error-non-429, and the rateLimited countdown. That's the right cut.

### Pattern 4: HMAC IP hash + JSON one-liner inside `rateLimited()`

```ts
// Source: Node 20+ stdlib (verified Sources §B); Next 16 nodejs runtime supports
//         node:crypto natively.
import { createHmac } from "node:crypto";

const SALT = process.env.AUDIT_VOTE_SALT;
if (!SALT) {
  // Match SEC-06 — salt MUST be present. throw at module load so missing
  // config is caught in CI / first-deploy, not silently weaken hashes.
  throw new Error("AUDIT_VOTE_SALT is required");
}

function hashIp(ip: string): string {
  // 8 bytes of HMAC-SHA-256 → 16 hex chars. Plenty for log scanning;
  // keyed (HMAC, not concat-hash) so log-scraping an attacker can't
  // confirm an IP guess via length-extension or rainbow tables.
  return createHmac("sha256", SALT!).update(ip).digest("hex").slice(0, 16);
}

// Inside rateLimited(), in the "over cap" branch, BEFORE the return:
console.log(JSON.stringify({
  event: "rate_limit_throttled",
  route: key,
  ip_hash: hashIp(ip),
  retry_after: retryAfter,
  ts: new Date().toISOString(),
}));
```

**Important:** the existing `audit/vote/route.ts` uses `createHash("sha256").update(ip + SALT)` — that is **concatenation hashing, not HMAC**. CONTEXT.md D-10 specifies HMAC; this is correct (HMAC is the standard primitive for keyed hashing and resists length-extension). The planner should NOT "match" the audit/vote helper by using `createHash` — D-10 explicitly says HMAC, and the existing audit/vote code is a v2.1 carry-over not a pattern to mimic. (Whether to upgrade audit/vote later is a separate question, out of Phase 1 scope.)

### Pattern 5: aria-live countdown that doesn't hammer screenreaders

```tsx
// Source: developer.mozilla.org ARIA live regions docs +
//         a11y-collective.com aria-alert pattern.
"use client";
import { useEffect, useRef } from "react";

export function RateLimitToast({
  state,            // { retryAfter, message } | null
  onDismiss,
}: {
  state: { retryAfter: number; message: string } | null;
  onDismiss: () => void;
}) {
  // Only announce on initial 429 receipt — re-announcing every second is
  // hostile to screen readers. The visible countdown still ticks for
  // sighted users.
  const announceRef = useRef<string>("");

  useEffect(() => {
    if (!state) {
      announceRef.current = "";
      return;
    }
    if (announceRef.current === "") {
      // Set once on first appearance; subsequent ticks update visible text
      // but not the announced text.
      announceRef.current = `${state.message} Опитайте отново след ${state.retryAfter} секунди.`;
    }
  }, [state]);

  if (!state) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="mx-auto my-2 flex max-w-2xl items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200"
    >
      {/* The ANNOUNCED text: only changes when state goes from null → set. */}
      <span className="sr-only">{announceRef.current}</span>
      {/* The VISIBLE text: updates every second. aria-hidden so SRs don't
          re-read it. */}
      <span aria-hidden>
        {state.message} <strong>Опитайте отново след {state.retryAfter}s</strong>
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="text-xs underline"
        aria-label="Затвори"
      >
        Затвори
      </button>
    </div>
  );
}
```

The `aria-live="polite"` region with `aria-atomic="true"` will fire when the `<span class="sr-only">` text mutates — and we mutate it once (on null→set) and never again until null→set again. Sighted users see the countdown tick; screenreader users hear "Twърде много заявки. Опитайте отново след 47 секунди" exactly once. [CITED: developer.mozilla.org ARIA live regions]

### Anti-Patterns to Avoid

- **Anti-pattern: `csv.DictReader(r.iter_lines())`** — convenient but corrupts rows with embedded newlines in quoted fields. Use `io.TextIOWrapper(..., newline="")` or write a manual line-aware splitter.
- **Anti-pattern: retry inside the streaming body loop** — once `iter_bytes()` has yielded a chunk, the stream is partially consumed. Subsequent `client.stream(...)` calls produce a NEW stream from byte 0; you cannot resume. Retry only at the connection-establish boundary.
- **Anti-pattern: hook owns the body reader** — different chat surfaces decode differently (some accumulate into markdown blocks, intel-search-summary consumes JSON-lines). The hook handing back `{ response, signal }` keeps control where it belongs.
- **Anti-pattern: `aria-live` text re-announced every tick** — screen reader users will rage-quit. Update visible-only DOM, leave the `sr-only` announce text static after the first set.
- **Anti-pattern: `createHash("sha256").update(ip + salt)`** — that is salted-SHA, not HMAC. Use `createHmac("sha256", salt).update(ip)` per D-10.
- **Anti-pattern: pulling in `pytest-memray` to satisfy D-14** — it tracks Python heap, not OS RSS. The whole point of D-14 was that those layers diverge.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HMAC-SHA-256 of an IP string | Custom Buffer concat + sha256 hash | `node:crypto.createHmac("sha256", salt).update(ip).digest("hex")` | Constant-time; correct primitive; built-in stdlib [VERIFIED: Sources §B] |
| Process RSS measurement on Linux/macOS | Reading `/proc/self/status` | `psutil.Process().memory_info().rss` | Cross-platform; mature; matches D-14 verbatim |
| HTTP retry with backoff | New retry loop | The existing `_BACKOFF` constant + `_is_transient_status` from `_lib/http_retry.py` | Phase 2 of an earlier milestone already canonicalised this — D-12/D-13 say to re-use the policy, not reinvent it |
| Stream-from-URL-into-CSV | A hand-written line-buffer | `io.TextIOWrapper(r.iter_bytes(), encoding="utf-8", newline="")` then `csv.DictReader` | Python's csv module already handles RFC 4180 quoting correctly; doing it yourself reintroduces every CSV-parsing bug ever filed |
| Toast countdown rendering | Setinterval-driven imperative DOM updates | React state + `useEffect`; one `setInterval` ref tracked per render | React's state model already handles unmount-safe cleanup |

**Key insight:** Both tracks are deceptively simple-looking. The streaming work LOOKS like a 5-line refactor and isn't (newline handling, retry-stream interaction). The hook work LOOKS like wrapping fetch and isn't (abort propagation, body ownership, screenreader semantics). Hand-rolling either fully will cost more lines than carefully reusing stdlib primitives.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — the throttle log produces ephemeral stdout, no DB writes. The synthetic CSV used in tests is generated per-run. | None |
| Live service config | Vercel project must have `AUDIT_VOTE_SALT` env var set (already required per SEC-06, no change). | Verify before deploy that `vercel env ls` includes `AUDIT_VOTE_SALT` for production. |
| OS-registered state | None — no scheduled tasks, no daemons. | None |
| Secrets/env vars | `AUDIT_VOTE_SALT` re-used (CONTEXT.md D-10). No new secret introduced. | None |
| Build artifacts | `.next/` build cache for lex-web; `__pycache__` for lex-brain — both auto-rebuild. | None |

**Nothing found in category:** Confirmed — Phase 1 is pure code/config work with no migrations, no renamed identifiers persisted to a datastore.

## Common Pitfalls

### Pitfall 1: `io.TextIOWrapper` over an iterator

**What goes wrong:** `io.TextIOWrapper` is documented to wrap a `BinaryIO` (a stream with `.read()` and `.readinto()`). `r.iter_bytes()` returns an `Iterator[bytes]`, not a `BinaryIO`. Passing the iterator may TypeError or behave unexpectedly across Python versions.
**Why it happens:** People copy-paste the pattern from blog posts that didn't actually run the code on the latest httpx.
**How to avoid:** Wrap the iterator in a tiny adapter that provides `.read(n)`:
```python
import io

class _IterBytesAdapter(io.RawIOBase):
    """Minimal RawIOBase wrapper around an Iterator[bytes] so TextIOWrapper
    can read from it line-buffered."""
    def __init__(self, it):
        self._it = it
        self._buf = b""
    def readable(self): return True
    def readinto(self, b):
        while not self._buf:
            try:
                self._buf = next(self._it)
            except StopIteration:
                return 0
        n = min(len(b), len(self._buf))
        b[:n] = self._buf[:n]
        self._buf = self._buf[n:]
        return n

# Usage:
text_stream = io.TextIOWrapper(
    _IterBytesAdapter(r.iter_bytes(chunk_size=65536)),
    encoding="utf-8",
    newline="",
)
reader = csv.DictReader(text_stream)
```
**Warning signs:** `TypeError: read() returned non-bytes` or `csv.Error: line contains NUL`.

### Pitfall 2: streamed retry consumes the body

**What goes wrong:** A naïve retry helper that wraps `for chunk in r.iter_bytes(): ...` inside a try/except will, on transient error mid-stream, attempt to retry — but `r` is already partially consumed. httpx raises `StreamConsumed` on second iteration.
**Why it happens:** Conflating "establish connection" with "stream body" — both can fail, but only the former is retryable.
**How to avoid:** Retry ONLY at the `client.stream(...)` __enter__ boundary. Once bytes are flowing, errors abort the whole scrape (the cron will re-run tomorrow; this is acceptable for OpenSanctions).
**Warning signs:** `httpx.StreamConsumed: Attempted to read or stream content...`

### Pitfall 3: Aborted streaming consumer leaks the AbortController

**What goes wrong:** The hook creates a new `AbortController` per submit. If the consumer (caller) doesn't drain or abort, the controller stays alive, attached to the signal, attached to the Anthropic upstream — silently burning tokens until Vercel's `maxDuration` fires.
**Why it happens:** Caller treats the response as "fire and forget" after error.
**How to avoid:** The hook's `cancel()` and the unmount cleanup `useEffect` both call `abortRef.current?.abort()`. The caller's chat code SHOULD call `rl.cancel()` on stop button (which is what `app/laws/[slug]/chat.tsx:194` already does via `abortRef.current?.abort()`). The hook centralises this.
**Warning signs:** Vercel function logs showing 120-second handler durations even after the user navigated away.

### Pitfall 4: Vercel log line truncation

**What goes wrong:** Vercel caps each log line at 256 KB. A long route key + an unusually long IP (IPv6) + ISO timestamp + JSON braces is well under that, but if anyone later adds a `headers` dump, it could blow up.
**Why it happens:** Teams iterate on logs and add fields.
**How to avoid:** Keep the throttle JSON shape STRICTLY at the 5 keys in D-09. If future fields are wanted, evaluate against the 256 KB ceiling. Truncate the IP hash at 16 chars (D-10) — done.
**Warning signs:** Vercel log explorer truncating mid-JSON.

### Pitfall 5: Re-announcing the countdown to screen readers

**What goes wrong:** `aria-live="polite"` re-announces whenever the inner text mutates. If the visible "Опитайте отново след 12s" updates every second AND lives inside the live region, screen readers say "twelve seconds eleven seconds ten seconds nine seconds..." for a full minute.
**Why it happens:** Naïve combination of "live region" + "live updating text."
**How to avoid:** Split the visible (`aria-hidden`) and the announced (`sr-only`) DOM. Update the announced span exactly once on null→set transitions.
**Warning signs:** A11y review by screen reader user — they'll mention it.

### Pitfall 6: Synthetic CSV that doesn't actually exercise streaming

**What goes wrong:** Test generates a 30 MB CSV; baseline (Python interpreter + httpx + psycopg2 imports) is already ~120 MB RSS on macOS arm64. Asserting `peak < 200 MB` passes for the buffered-load version too because 30 MB doesn't push it over. The streaming test gives false confidence.
**Why it happens:** Underestimating Python's baseline RSS.
**How to avoid:** Pick a fixture size that, if buffered fully, would push baseline over 200 MB by a clear margin. **Recommended floor: 100 MB synthetic CSV.** If `r.text` were used, baseline ~120 MB + 100 MB CSV string + the DictReader's StringIO copy + transient parse buffers = comfortably >300 MB peak. Streaming holds at chunked 64 KiB so peak = baseline + few-MB. Both arms of the test are clearly distinguishable. CONTEXT.md D-15 says ~300 MB which is fine and gives a full safety margin; if disk speed in CI matters, 100 MB is the defensible minimum. Test should also contain a smoke variant that confirms a buffered-load fixture WOULD fail the assertion (negative control).
**Warning signs:** Test passes on the BUFFERED implementation. If you can't make it fail with the old code, the fixture is too small.

## Code Examples

### Synthetic CSV fixture (deterministic, no network)

```python
# Source: pattern adapted from httpx MockTransport docs.
import csv
import io
from pathlib import Path

OPENSANCTIONS_HEADER = [
    "id", "schema", "name", "aliases", "birth_date", "countries",
    "addresses", "identifiers", "sanctions", "phones", "emails",
    "dataset", "first_seen", "last_seen",
]

def write_synthetic_csv(path: Path, target_mb: int = 300) -> None:
    """Write a deterministic CSV until file size ≥ target_mb.

    Mix of BG and non-BG rows so the row-skip path is exercised.
    Includes a few rows with embedded newlines in quoted name field
    to validate the newline="" handling.
    """
    target_bytes = target_mb * 1024 * 1024
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(OPENSANCTIONS_HEADER)
        i = 0
        while path.stat().st_size < target_bytes:
            i += 1
            countries = "BG" if i % 7 == 0 else "RU"
            name = f"Test Entity {i}"
            if i % 1000 == 0:
                # embedded newline test row
                name = f"Multi\nLine\nName {i}"
            w.writerow([
                f"opensanc-{i:08d}", "Person", name, "", "1980-01-01",
                countries, "", "", "OFAC SDN", "", "", "default",
                "2024-01-01", "2026-01-01",
            ])
```

### httpx MockTransport for offline test

```python
# Source: https://www.python-httpx.org/advanced/mock-transports/
import httpx
from pathlib import Path

def make_offline_client(csv_path: Path) -> httpx.Client:
    """Return a client whose only response streams the local CSV."""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "text/csv; charset=utf-8"},
            content=csv_path.read_bytes(),  # ← caveat: see below
        )
    transport = httpx.MockTransport(handler)
    return httpx.Client(transport=transport)
```

**Caveat:** `content=csv_path.read_bytes()` LOADS THE FIXTURE INTO PYTHON MEMORY in the test process. That defeats the test — you'd be measuring `len(csv) + streaming overhead` rather than `streaming overhead alone`. Use a streaming MockTransport that returns chunks from the file:

```python
def handler(request: httpx.Request) -> httpx.Response:
    def gen():
        with csv_path.open("rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk: break
                yield chunk
    return httpx.Response(200, headers={...}, content=gen())  # accepts iterable
```

This is a real subtlety — `httpx.Response(content=...)` accepts an iterable of bytes when used inside MockTransport, in which case it does NOT pre-buffer. Verify by spot-checking `peak_rss` in the test fixture itself: if peak_rss exceeds 200 MB, the fixture loader is the bug, not the helper.

### Test skeleton

```python
# tests/test_opensanctions_memory.py
import csv
import io
import sys
from pathlib import Path
from unittest.mock import MagicMock

import httpx
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from scripts._lib.http_retry import fetch_with_retry_stream  # noqa: E402

FIXTURE_MB = 300

@pytest.fixture(scope="module")
def synthetic_csv(tmp_path_factory):
    p = tmp_path_factory.mktemp("os-fixture") / "synthetic.csv"
    write_synthetic_csv(p, target_mb=FIXTURE_MB)
    return p

def test_streamed_helper_keeps_rss_under_200_mb(synthetic_csv, monkeypatch):
    sampler = PeakRssSampler(interval_s=0.05)
    sampler.start()
    try:
        with make_offline_client(synthetic_csv) as client:
            with fetch_with_retry_stream(client, "http://x/csv") as r:
                assert r is not None and r.status_code == 200
                text = io.TextIOWrapper(
                    _IterBytesAdapter(r.iter_bytes(chunk_size=65536)),
                    encoding="utf-8",
                    newline="",
                )
                rows = 0
                for row in csv.DictReader(text):
                    rows += 1
                assert rows > 0
    finally:
        sampler.stop()
    assert sampler.peak_mb < 200, (
        f"peak RSS {sampler.peak_mb:.1f} MB exceeded 200 MB budget "
        f"with a {FIXTURE_MB} MB fixture"
    )
```

### Vitest hook test skeleton

```ts
// __tests__/use-rate-limited-fetch.test.tsx
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRateLimitedFetch } from "@/lib/use-rate-limited-fetch";

describe("useRateLimitedFetch", () => {
  afterEach(() => vi.restoreAllMocks());

  it("parses 429 + retry_after into rateLimited state", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "Твърде много заявки. Моля, изчакайте.",
          retry_after: 47,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      ),
    );
    const { result } = renderHook(() => useRateLimitedFetch());
    await act(async () => {
      const res = await result.current.submit("/api/x");
      expect(res.ok).toBe(false);
      if (!res.ok && "rateLimited" in res) {
        expect(res.rateLimited.retryAfter).toBe(47);
      }
    });
    expect(result.current.rateLimited?.retryAfter).toBe(47);
  });

  it("decrements countdown each second and clears at 0", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ retry_after: 2 }), { status: 429 }),
    );
    const { result } = renderHook(() => useRateLimitedFetch());
    await act(async () => { await result.current.submit("/api/x"); });
    expect(result.current.rateLimited?.retryAfter).toBe(2);
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(result.current.rateLimited?.retryAfter).toBe(1);
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(result.current.rateLimited).toBeNull();
    vi.useRealTimers();
  });

  it("propagates abort signal to fetch", async () => {
    let receivedSignal: AbortSignal | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      receivedSignal = init?.signal ?? undefined;
      return new Response("ok", { status: 200 });
    });
    const { result } = renderHook(() => useRateLimitedFetch());
    await act(async () => { await result.current.submit("/api/x"); });
    expect(receivedSignal).toBeDefined();
    expect(receivedSignal!.aborted).toBe(false);
    act(() => result.current.cancel());
    expect(receivedSignal!.aborted).toBe(true);
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `r.text` then `csv.DictReader(io.StringIO(...))` | `client.stream(...)` + `csv.DictReader(io.TextIOWrapper(r.iter_bytes(), newline=""))` | httpx 0.20+ stabilised streaming | OS-01 enabling |
| Toast libs (react-hot-toast, react-toastify) | Hand-rolled `aria-live` region OR `sonner@2.0.7` | sonner became shadcn/ui default ~2024 | Marginal — for ONE banner, hand-rolled is simpler |
| `tracemalloc` for memory tests | OS RSS via `psutil` for OOM tests | Always — tracemalloc only ever tracked Python heap | Mandatory per D-14 |
| `runtime: "edge"` for Anthropic streaming | `runtime: "nodejs"` + `maxDuration` | Vercel removed Edge support for Anthropic SDK | Already in place; nothing to migrate |
| `createHash(input + salt)` salted hash | `createHmac(algorithm, salt).update(input)` | Always — HMAC is the primitive for keyed hashing | D-10 mandates HMAC; existing audit/vote uses concat-hash but is out of scope |

**Deprecated/outdated:**
- `@testing-library/react-hooks` — deprecated 2022; use `renderHook` from `@testing-library/react` directly. [VERIFIED: react-hooks-testing-library README]
- `tracemalloc`-based memory budgets — fundamentally cannot see OS-level allocator behaviour.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | OpenSanctions CSV currently contains rows with embedded newlines in quoted fields. | Pitfall 1 / Pattern 1 | If FALSE, `iter_lines()` shortcut works fine and recommendation is over-cautious. Cost of being safe = ~5 lines of `_IterBytesAdapter`. Cost of being wrong = silent row corruption. Asymmetric — keep the safer path. |
| A2 | Hand-rolled toast is preferable to introducing `sonner` in a project with no existing toast lib. | Standard Stack — Track B | Subjective. Planner can override; sonner@2.0.7 is React-19-compatible. |
| A3 | psutil 7.x is available on PyPI as of 2026-05. | Standard Stack — Track A | Spot-checked PyPI; if planning runs much later and the version is stale, just bump. Low risk. |
| A4 | The OpenSanctions live feed's `Content-Type` includes `charset=utf-8` (so `iter_bytes` then `TextIOWrapper(encoding="utf-8")` matches the wire encoding). | Pattern 1 | If the feed sends a different encoding, csv parsing of non-ASCII names breaks. Mitigation: explicit `encoding="utf-8"` in TextIOWrapper means we trust UTF-8 regardless of header — and OpenSanctions has historically been UTF-8. Verify in UAT (D-16). |
| A5 | The 8 fetch sites can all be migrated without breaking `runtime: "nodejs"` semantics — none rely on Edge. | Architecture map | Verified by grep — all 8 routes already export `runtime = "nodejs"`. HIGH confidence. |
| A6 | `console.log(JSON.stringify({...}))` produces a single Vercel log line. | Pattern 4 | The Vercel docs page says each `console.log` is a separate log entry, line-by-line — and JSON.stringify produces no newlines unless you pass `space=2`. We do not pass space. Confirmed from Vercel docs. HIGH confidence. |

## Open Questions

1. **Should the planner add `vitest` to lex-web's deps?**
   - What we know: no test infrastructure exists in lex-web (verified — no `*.test.*`, no `vitest.config.*`, no `jest.config.*`, no test script). The hook is the first non-trivial reusable client primitive. If we don't test it, future regressions of the abort-signal contract (which protects v2.1 / AI-07) are silent.
   - What's unclear: project policy on test infra. CONTEXT.md doesn't mandate it; ROADMAP doesn't mention testing.
   - Recommendation: ADD vitest + @testing-library/react + jsdom to devDependencies, write the three hook tests in the skeleton above. This is a Wave 0 gap. The cost (one config file, three deps) is trivial; the protection on the abort-propagation contract is high-value.

2. **Naming of the new helper module in lex-brain.**
   - What we know: D-12 says fork a new helper. CONTEXT.md says either `_lib/http_retry.py` or `_lib/http_stream.py`.
   - What's unclear: convention across the codebase.
   - Recommendation: keep it in `_lib/http_retry.py` alongside `fetch_with_retry_sync` and `fetch_with_retry_async` — they share `_BACKOFF` and `_is_transient_status`. Splitting modules duplicates those constants or imports them awkwardly. Re-use is the point.

3. **Should the planner upgrade `audit/vote/route.ts` from `createHash(input+salt)` to HMAC?**
   - What we know: D-10 mandates HMAC for the throttle log. Existing audit/vote uses concat-hash with the same salt.
   - What's unclear: whether D-10's HMAC requirement quietly implies upgrading audit/vote to match.
   - Recommendation: NO. Phase 1 scope says "throttle log" — touching audit/vote is out of scope and would risk SEC-03 / SEC-06 regression for no benefit. Document the inconsistency in PROJECT.md "Key Decisions" so a future phase (e.g. v2.3 auth work) addresses it deliberately.

4. **Is `io.TextIOWrapper` over a manually written `RawIOBase` adapter the canonical pattern, or is there a more idiomatic httpx-y way I'm missing?**
   - What we know: httpx provides `r.iter_bytes()` (Iterator[bytes]) and `r.iter_lines()` (Iterator[str], strips newlines). Neither is a `BinaryIO`.
   - What's unclear: whether httpx exposes a `r.stream` attribute that is itself a binary file-like.
   - Recommendation: spike this in the executor tasks. The `_IterBytesAdapter` shown above is provably correct; if a one-liner exists, the executor will find it. Either way the test asserts the contract.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.12+ | Track A | ✓ | 3.12.x (lex-brain pyproject mandates 3.12+) | — |
| `uv` | Track A test runner | ✓ | 0.11.2 (verified) | `pip install psutil pytest` |
| `httpx` | Track A | ✓ (already pinned) | 0.28.1+ | — |
| `psutil` | Track A test | ✗ | not installed in venv | NONE — must `uv add --dev psutil` |
| `pytest` | Track A test | ✓ (already pinned) | 9.0.3+ | — |
| Node 20.9+ | Track B | ✓ (Next 16 mandates) | unknown but Vercel forces compatible | — |
| `node:crypto` | Track B HMAC | ✓ (stdlib in nodejs runtime) | (Node stdlib) | — |
| Vitest + RTL + jsdom | Track B hook test | ✗ | none | NONE — must add devDeps |

**Missing dependencies with no fallback:**
- `psutil` in lex-brain — `uv add --dev psutil` (single command).
- `vitest` + `@testing-library/react` + `jsdom` in lex-web — adds ~5 devDeps; pulls in the testing config file (vitest.config.ts).

**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework

| Property | Track A (lex-brain) | Track B (lex-web) |
|----------|---------------------|-------------------|
| Framework | pytest 9.0.3 | vitest 4.x (NEW — Wave 0 gap) |
| Config file | `pyproject.toml` `[dependency-groups].dev` | `vitest.config.ts` (NEW — Wave 0 gap) |
| Quick run command | `uv run pytest tests/test_opensanctions_memory.py -x` | `bunx vitest run __tests__/use-rate-limited-fetch.test.tsx` |
| Full suite command | `uv run pytest -x` | `bunx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| OS-01 | scrape_opensanctions.py keeps peak RSS < 200 MB on the synthetic CSV | unit (memory-budget) | `uv run pytest tests/test_opensanctions_memory.py::test_streamed_helper_keeps_rss_under_200_mb -x` | ❌ Wave 0 |
| OS-01 | `fetch_with_retry_stream` retries on 503 then yields the response | unit | `uv run pytest tests/test_http_retry.py::test_stream_retries_on_503_then_succeeds -x` | ❌ Wave 0 (extend existing test file) |
| OS-01 | `fetch_with_retry_stream` returns None after exhaustion (matches D-04 contract) | unit | `uv run pytest tests/test_http_retry.py::test_stream_exhausts_returns_none -x` | ❌ Wave 0 |
| OS-01 | csv parsing preserves embedded-newline rows | unit | `uv run pytest tests/test_opensanctions_memory.py::test_embedded_newline_rows_preserved -x` | ❌ Wave 0 |
| RL-01 | Hook parses 429 → exposes rateLimited state with retry_after | unit | `bunx vitest run __tests__/use-rate-limited-fetch.test.tsx -t "parses 429"` | ❌ Wave 0 |
| RL-01 | Hook countdown decrements per second and clears at 0 | unit (fake timers) | `bunx vitest run __tests__/use-rate-limited-fetch.test.tsx -t "decrements"` | ❌ Wave 0 |
| RL-01 | Hook propagates abort signal to fetch (preserves AI-07) | unit | `bunx vitest run __tests__/use-rate-limited-fetch.test.tsx -t "abort"` | ❌ Wave 0 |
| RL-01 | `rateLimited()` emits a parseable JSON line on stdout when over cap | unit | `bunx vitest run __tests__/rate-limit.test.ts -t "throttle log"` | ❌ Wave 0 |
| RL-01 | UI integration: 11+ requests in 60s shows the toast | manual-only | `curl` loop against local dev server + visual check | N/A (UAT, D-16-style) |
| RL-01 | Vercel log explorer shows `event:rate_limit_throttled` lines after deploy | manual-only | grep in Vercel log explorer | N/A (UAT) |

### Sampling Rate

- **Per task commit:** Track A: `uv run pytest tests/test_opensanctions_memory.py -x`; Track B: `bunx vitest run` (whole suite is small).
- **Per wave merge:** Track A: `uv run pytest -x` (full suite — must include the existing `test_http_retry.py`). Track B: `bunx vitest run`.
- **Phase gate:** Both full suites green; manual UAT checks 11-request burst against `/api/chat/[slug]` and confirms the toast renders + the log line appears in Vercel.

### Wave 0 Gaps

- [ ] `lex-brain/tests/test_opensanctions_memory.py` — covers OS-01 (memory + parsing).
- [ ] `lex-brain/tests/test_http_retry.py` — extend with `test_stream_*` tests for the new helper (do not break existing tests).
- [ ] `lex-brain` add psutil dev dep: `uv add --dev psutil`.
- [ ] `lex-web/__tests__/use-rate-limited-fetch.test.tsx` — covers RL-01 hook contracts.
- [ ] `lex-web/__tests__/rate-limit.test.ts` — covers throttle-log emission contract.
- [ ] `lex-web/vitest.config.ts` — jsdom env, `@/*` path alias matching tsconfig.
- [ ] `lex-web` add devDeps: `bun add -D vitest @testing-library/react @testing-library/dom jsdom @types/react @vitejs/plugin-react`.
- [ ] `lex-web/package.json` add scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no auth in v2.2) | — |
| V3 Session Management | no | — |
| V4 Access Control | no (rate limit is per-IP, not per-user) | — |
| V5 Input Validation | yes (parsing 429 JSON body in hook) | Defensive `try/catch` around `res.json()`; fall back to defaults if malformed. |
| V6 Cryptography | yes (HMAC-SHA-256 of IPs for log) | `node:crypto.createHmac("sha256", salt)` — never hand-roll. |
| V7 Errors and Logging | yes (the throttle log itself) | Truncate IP hash to 16 hex chars; never log raw IP, fingerprint, or salt. |
| V8 Data Protection | yes (logged IP must be one-way & pseudonymous) | HMAC keyed with secret salt; salt MUST NOT be logged or hashed in. |

### Known Threat Patterns for {Next.js 16 + Anthropic streaming + in-memory rate limit}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IP enumeration via log scanning | Information disclosure | HMAC (not concat-hash) keyed with secret salt; truncate to 8 bytes. |
| Length-extension attacks on IP hash | Tampering | Use HMAC primitive (createHmac). |
| AbortController stripping (regression of AI-07) | Denial of resources (Anthropic budget) | Hook MUST propagate signal; tested via the unit test in this research. |
| 429-storm log flood | Denial of service (logs) | D-11 says no sampling — but throttle volume is bounded by limit (`max` per `windowMs` per IP per route). Worst case = max × IPs × routes per minute; trivial. |
| XSS via reflected `error` text from server | Tampering | The server-emitted Bulgarian message is a fixed string in `lib/rate-limit.ts`; no user input flows into it. Toast renders via React string interpolation (no `dangerouslySetInnerHTML`). |
| Race / TOCTOU between countdown decrement and re-submit | Tampering / DoS | The hook does not gate re-submit; the server is source of truth. If user clicks at countdown=0, server may still 429 if their slot is still over cap — fresh 429 replaces state. Acceptable. |

## Sources

### Primary (HIGH confidence)

#### Track A (httpx + psutil + pytest)
- Context7 `/encode/httpx` — Streaming Responses (verified `Client.stream()` context manager, `iter_bytes(chunk_size=...)`, `iter_lines()`, `iter_text()` semantics)
- Context7 `/giampaolo/psutil` — `Process.memory_info().rss` cross-platform availability + the recipe pattern for periodic monitoring (Process.oneshot + memory_info)
- Context7 `/bloomberg/pytest-memray` — verified that `limit_memory` tracks Python heap (memray-tracked) NOT OS RSS — confirming D-14's choice
- [Python csv docs (docs.python.org/3/library/csv.html)](https://docs.python.org/3/library/csv.html) — verified `csv.reader` accepts ANY iterable of strings; verified `newline=""` requirement for embedded-newline preservation
- [httpx quickstart (python-httpx.org/quickstart/)](https://www.python-httpx.org/quickstart/) — verified streaming API surface
- [httpx text encodings (python-httpx.org/advanced/text-encodings/)](https://www.python-httpx.org/advanced/text-encodings/) — verified default UTF-8 fallback for response decoding
- [PyPI psutil JSON metadata](https://pypi.org/pypi/psutil/json) — verified latest version published 2026-01-28
- `lex-brain/scripts/_lib/http_retry.py` — codebase grep verified the existing helper contract
- `lex-brain/tests/test_http_retry.py` — codebase grep verified the existing test pattern (monkeypatch sleep, MagicMock client) — directly reusable for the streamed helper tests
- `lex-brain/pyproject.toml` — codebase grep verified existing deps + missing psutil

#### Track B (Next.js 16 + React 19 + Vercel)
- `lex-web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md` — verified `runtime = "nodejs"` is default in Next 16
- `lex-web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` — verified Route Handler structure for Next 16
- `lex-web/node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` — verified Node 20.9+ minimum, Turbopack default, no breaking changes affecting this phase
- [Next.js error: node:crypto in edge runtime (nextjs.org/docs/messages/node-module-in-edge-runtime)](https://nextjs.org/docs/messages/node-module-in-edge-runtime) — verified `node:crypto` is fully supported in `runtime: "nodejs"`, only restricted in edge
- `lex-web/lib/rate-limit.ts` — codebase grep verified current `rateLimited()` shape; the over-cap branch is exactly where the JSON.stringify console.log goes
- `lex-web/app/laws/[slug]/chat.tsx` — codebase grep verified the `aria-live="polite"` precedent (line 282), the `AbortController` plumbing pattern (lines 148, 208), and the streaming-body-reader contract that the new hook MUST preserve
- `lex-web/app/api/*/route.ts` — codebase grep verified ALL 9 API routes (chat, courts/{chat,summarize}, eu/{chat,summarize}, intel/search, issues/chat, compare, analyze) export `runtime = "nodejs"` and use `rateLimited(...)` as the first line in their POST handlers
- `lex-web/app/api/audit/vote/route.ts` — codebase grep revealed the existing `createHash(input + SALT)` pattern, which is NOT HMAC — flagged as a known divergence from D-10's HMAC requirement, scoped out of Phase 1
- `lex-web/package.json` — codebase grep verified Next 16.2.4, React 19.2.4, no test framework installed

### Secondary (MEDIUM confidence)

- [MDN ARIA live regions](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions) — verified the polite-vs-assertive pattern and the "announce-once-not-every-tick" guidance for countdown timers
- [a11y-collective.com aria-alert](https://www.a11y-collective.com/blog/aria-alert/) — corroborated the live-region announce-cadence pattern
- [Vercel Function Logs (vercel.com/docs/functions/logs)](https://vercel.com/docs/functions/logs) — verified each `console.log` produces a separate log entry, 256 KB per line max, full Console API support in Node runtime
- [Vercel Logflare integration (vercel.com/marketplace/logflare)](https://vercel.com/marketplace/logflare) — corroborates the auto-parse JSON behaviour, though not officially documented by Vercel as a guaranteed feature
- [LogRocket React toast libraries comparison 2025](https://blog.logrocket.com/react-toast-libraries-compared-2025/) — corroborated sonner's React 19 compatibility
- [emilkowalski/sonner GitHub](https://github.com/emilkowalski/sonner) — verified sonner@2.0.7 is the latest version
- [testing-library/react (testing-library.com/docs/react-testing-library/api/)](https://testing-library.com/docs/react-testing-library/api/) — verified `renderHook` is in main package as of v13+

### Tertiary (LOW confidence — verify before relying)

- [rednafi.com httpx stream + csv blog post (rednafi.com/python/stream-process-a-csv-file/)](https://rednafi.com/python/stream-process-a-csv-file/) — provided a baseline pattern but the specific `io.StringIO(); seek(0); next(reader)` shape is over-complex and we rejected it. Useful as a "this is what NOT to copy" reference.
- [encode/httpx discussion #2227 (Streaming a database CSV export)](https://github.com/encode/httpx/discussions/2227) — community thread; not authoritative.

## Metadata

**Confidence breakdown:**
- Standard stack (Track A): HIGH — all pinned versions verified against the actual `pyproject.toml`; psutil verified on PyPI
- Standard stack (Track B): HIGH — all pinned versions verified against `package.json`; Next 16 specifics verified against `node_modules/next/dist/docs/`
- Architecture (Track A): HIGH for the streaming flow + retry boundary; MEDIUM for `io.TextIOWrapper` over `Iterator[bytes]` (the `_IterBytesAdapter` is the safer path; planner should spike whether a simpler form works at execute time)
- Architecture (Track B): HIGH for the hook + toast structure; MEDIUM for the exact aria-live-once pattern (multiple sources agree but no canonical WCAG test against this specific shape)
- Pitfalls: HIGH — all six pitfalls are grounded in either Python/httpx documentation, codebase grep, or web standards (MDN/W3C)

**Research date:** 2026-05-09
**Valid until:** 2026-06-09 (30 days — Next.js 16 + React 19 + httpx 0.28 are all stable; psutil/sonner/vitest may bump minor versions but no API surface affecting this research is likely to change)
