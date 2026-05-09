---
phase: 01-reliability-observability
plan: 01
subsystem: infra
tags: [python, lex-brain, opensanctions, streaming, memory, httpx, csv, psutil]

# Dependency graph
requires:
  - phase: 01-reliability-observability/01-00
    provides: psutil dev dep + vitest infra for the lex-web side (psutil here is what lets the OS-01 RSS test run)
provides:
  - fetch_with_retry_stream — streaming sibling to fetch_with_retry_sync in scripts/_lib/http_retry.py (lex-brain)
  - Streamed CSV ingest in scripts/scrape_opensanctions.py (no more r.text on the OpenSanctions feed)
  - PeakRssSampler + 100 MB synthetic CSV harness in tests/test_opensanctions_memory.py
  - Stream-helper retry/exhaustion test coverage (4 new test_stream_* tests in tests/test_http_retry.py)
affects:
  - Phase 01-02 (lex-web rate-limit UX) — independent track, can land in parallel
  - Future scrapers in lex-brain that need a streaming retry helper (sibling to the existing sync/async pair)
  - UAT step (D-16) — manual real-feed run on the live ~300-500 MB CSV deferred to phase verification

# Tech tracking
tech-stack:
  added: []  # psutil already added in 01-00
  patterns:
    - "Streamed retry helper as @contextlib.contextmanager — yields the underlying httpx.Response inside a `with` block; retries at the connection-establish boundary only"
    - "io.TextIOWrapper(_IterBytesAdapter(iter_bytes()), encoding='utf-8', newline='') for chunk-streamed CSV parsing that preserves embedded-newline rows"
    - "Background-thread psutil RSS sampler (PeakRssSampler) for OS-level memory budgeting in tests"
    - "httpx.MockTransport with a generator content body (NOT read_bytes()) for offline streaming-fixture tests"

key-files:
  created:
    - "/Users/beyond/Desktop/lex-brain/tests/test_opensanctions_memory.py"
  modified:
    - "/Users/beyond/Desktop/lex-brain/scripts/_lib/http_retry.py"
    - "/Users/beyond/Desktop/lex-brain/scripts/scrape_opensanctions.py"
    - "/Users/beyond/Desktop/lex-brain/tests/test_http_retry.py"

key-decisions:
  - "Used Pattern 1 / Option B exactly — @contextlib.contextmanager wrapping client.stream(...).__enter__/__exit__ — over Option A's bare generator. Caller ergonomics (with-block) matter and StopIteration management is awkward in Option A."
  - "_IterBytesAdapter (RawIOBase wrapper) used in BOTH scrape_opensanctions.py AND tests/test_opensanctions_memory.py instead of being shared from a common module. Two rationales: the test stays self-contained (one less import to maintain), and the adapter is small enough that duplicating costs less than coupling. If a third caller appears, promote to scripts/_lib/."
  - "Synthetic CSV fixture floor = 100 MB (env-overridable via OPENSANCTIONS_TEST_MB). Per RESEARCH Pitfall 6, 100 MB is the smallest size where a buffered implementation would clearly bust the 200 MB budget — so the test is a real regression guard, not a placebo."
  - "Monkeypatched scripts._lib.http_retry.time.sleep (the module-bound name) rather than the global time.sleep in the new stream tests — matches the existing sync-helper test convention in the same file."

patterns-established:
  - "When extending the http_retry helper module with new transport modes, do NOT modify the existing helpers (D-12). Append new top-level functions with their own retry-loop implementing the canonical _BACKOFF / _is_transient_status / _log_* contract."
  - "Streamed CSV ingestion in lex-brain uses the four-line idiom: fetch_with_retry_stream → io.TextIOWrapper(_IterBytesAdapter(iter_bytes()), newline='') → csv.DictReader → for row. Mirror this in any future feed of comparable size."
  - "Memory-budget tests use psutil RSS sampled in a background thread, NOT Python heap profilers. RSS is what the 4 GB-box success criterion measures."

requirements-completed: [OS-01]

# Metrics
duration: 30min
completed: 2026-05-09
---

# Phase 1 Plan 01: Streamed OpenSanctions ingest + RSS budget test Summary

**Replaced 300-500 MB-buffered `r.text` ingest in scrape_opensanctions.py with a 64 KiB-chunk streamed parse via a new `fetch_with_retry_stream` context-manager helper; peak RSS measured at 36 MB on a 100 MB synthetic CSV (1.018M rows parsed) — well under the 200 MB OS-01 budget.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-09T17:07Z
- **Completed:** 2026-05-09T17:37Z
- **Tasks:** 3
- **Files modified:** 4 (1 created, 3 modified) in lex-brain; +1 SUMMARY in lex-web

## Accomplishments

- **`fetch_with_retry_stream`** (new context manager in `scripts/_lib/http_retry.py`) yielding a streaming `httpx.Response`. Retries at `client.stream(...).__enter__` only (RESEARCH Pitfall 2: partially-consumed streams cannot be retried — httpx raises `StreamConsumed`). Same `_BACKOFF` curve / `_is_transient_status` / `_log_*` telemetry as the sync sibling per D-13. Yields `None` on exhaustion per D-04.
- **`scripts/scrape_opensanctions.py`** — buffered acquisition (`r = fetch_with_retry_sync(...); data = r.text; csv.DictReader(io.StringIO(data))`) replaced with `with fetch_with_retry_stream(...) as r: csv.DictReader(io.TextIOWrapper(_IterBytesAdapter(r.iter_bytes(chunk_size=65536)), encoding="utf-8", newline=""))`. The per-row Postgres upsert loop body is byte-identical to HEAD modulo enclosing-block indentation (verified by AST + dedent comparison).
- **OS-01 acceptance test** (`tests/test_opensanctions_memory.py`) — generates a 100 MB synthetic CSV in-test (env-overridable via `OPENSANCTIONS_TEST_MB`), serves it through `httpx.MockTransport` with a generator content body that streams from disk in 64 KiB chunks (the read_bytes caveat from RESEARCH was avoided), samples RSS via a 50 ms-polling psutil thread, and asserts `peak_mb < 200`. **Measured peak RSS: 36 MB** (baseline ~36 MB; the streamed parse adds essentially nothing because the only resident bytes are the current 64 KiB chunk + a row of CSV state).
- **Stream-helper retry coverage** — 4 new `test_stream_*` tests in `tests/test_http_retry.py` cover: success-first-try, 503-then-200, full exhaustion, transport-error-then-200. Existing 13 tests untouched and still green.
- **D-12 honored**: `git show HEAD~3:scripts/_lib/http_retry.py` vs current — `fetch_with_retry_async` and `fetch_with_retry_sync` bodies are byte-identical (verified programmatically by extracting and comparing each function).
- **D-15 honored**: synthetic CSV is generated in-test, deterministic, offline; never touches the live OpenSanctions URL.

## Task Commits

Each task was committed atomically inside the `lex-brain` repo (`chore/post-phase-02-state-update` branch):

1. **Task 1: Add `fetch_with_retry_stream` + extend `test_http_retry.py`** — `d184412` (feat)
2. **Task 2: Convert `scrape_opensanctions.py` to streamed CSV ingestion** — `60b3987` (feat)
3. **Task 3: Memory-budget test (`tests/test_opensanctions_memory.py`)** — `2c63cbc` (test)

The lex-web SUMMARY commit lands separately on `feat/phase-01-reliability` in the `lex-web` repo.

## Files Created/Modified

### lex-brain (separate repo at /Users/beyond/Desktop/lex-brain)

- **`scripts/_lib/http_retry.py`** (modified) — added `import contextlib` + appended `@contextlib.contextmanager fetch_with_retry_stream(...)` (54 lines). Sync/async helpers untouched.
- **`scripts/scrape_opensanctions.py`** (modified) — switched import to `fetch_with_retry_stream`; added `_IterBytesAdapter(io.RawIOBase)` helper class; restructured `main()` to wrap the existing per-row upsert loop in two new `with` blocks (`httpx.Client(...)` → `fetch_with_retry_stream(...)`); replaced the post-download `downloaded {MB}` print with a post-loop `finished streaming in {s}s` print.
- **`tests/test_http_retry.py`** (modified) — appended 4 new `test_stream_*` tests + a `_make_stream_cm` helper. All 13 existing tests untouched.
- **`tests/test_opensanctions_memory.py`** (created) — `_IterBytesAdapter` (mirrored from production), `PeakRssSampler` (50 ms psutil polling thread), `_write_synthetic_csv` (FIXTURE_MB env-driven, embedded-newline row every 1000), `_make_streaming_mock_client` (generator-content `MockTransport`), `synthetic_csv` module-scoped pytest fixture, `test_peak_rss_under_200_mb`, `test_embedded_newline_rows_preserved`.

### lex-web (this repo)

- **`.planning/phases/01-reliability-observability/01-01-SUMMARY.md`** (this file).

## Verification Results

| Check | Result |
| --- | --- |
| Full lex-brain `uv run pytest -x` | 38/38 passed in 4.4s (17 http_retry + 2 memory + 12 parser + 7 slug) |
| `uv run pytest tests/test_http_retry.py -x` | 17/17 passed (13 existing + 4 new `test_stream_*`) |
| `uv run pytest tests/test_opensanctions_memory.py -x` | 2/2 passed in 4.4s |
| `uv run python -c "import ast; ast.parse(open('scripts/scrape_opensanctions.py').read())"` | OK |
| `grep -v '^#' scripts/scrape_opensanctions.py | grep -c 'r\.text'` | 0 ✓ |
| `grep -v '^#' scripts/scrape_opensanctions.py | grep -c 'io\.StringIO'` | 0 ✓ |
| `grep -c 'fetch_with_retry_stream' scripts/scrape_opensanctions.py` | 2 ✓ (import + use) |
| `grep -c 'newline=""' scripts/scrape_opensanctions.py` | 2 ✓ |
| `grep -c '_IterBytesAdapter' scripts/scrape_opensanctions.py` | 2 ✓ (class def + use) |
| `grep -c 'tracemalloc\|memray' tests/test_opensanctions_memory.py` | 0 ✓ (D-14) |
| Sync/async helper bodies byte-identical to HEAD~3 | True (D-12) ✓ |
| Per-row upsert loop body byte-identical (after dedent) | True ✓ |
| **Measured peak RSS** on 100 MB synthetic / 1.018M rows | **36.0 MB** (budget = 200 MB) ✓ |

## Decisions Made

- **Pattern 1 / Option B (`@contextlib.contextmanager`)** chosen over the bare-generator Option A. Rationale: caller `with` ergonomics + cleaner StopIteration handling. RESEARCH already recommended Option B.
- **`_IterBytesAdapter` is duplicated** between `scripts/scrape_opensanctions.py` and `tests/test_opensanctions_memory.py` rather than promoted to a shared `_lib` helper. Adapter is 16 lines and has zero callers besides these two; promoting would be premature abstraction. Revisit if a third caller appears.
- **Fixture floor = 100 MB** (env-overridable to 300 MB if disk speed in CI permits). RESEARCH Pitfall 6 floor argument: at 100 MB, a buffered implementation would peak at ~baseline + 100 MB string + StringIO copy + parse buffers → comfortably > 300 MB total RSS. Streaming holds at ~baseline + few MB. So 100 MB is the smallest size where the test is a real regression guard.
- **Monkeypatched `scripts._lib.http_retry.time.sleep`** (module-bound) instead of global `time.sleep` in the new stream tests. Matches existing sync-helper test convention in the same file (lines 67-69). The plan's example used the global path; the existing module-bound path is more deterministic.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Removed forbidden tokens from docstring to satisfy literal D-14 grep guard**

- **Found during:** Task 3 acceptance-criteria check (`grep -c "tracemalloc\|memray" tests/test_opensanctions_memory.py` returned `1`)
- **Issue:** The plan's grep guard is non-comment-aware. The original docstring read `D-14: peak RSS via psutil (NOT tracemalloc / memray — they miss C-layer buffering...)` — naming the forbidden tools to explain why we use psutil. The grep counted the docstring mention and tripped.
- **Fix:** Rephrased the docstring to `NOT Python heap trackers — they miss C-layer buffering...` — preserves the rationale for future readers without naming a forbidden tool. The CODE never used either; this was purely a doc-string guard mismatch.
- **Files modified:** `tests/test_opensanctions_memory.py` (1 line in module docstring)
- **Verification:** Re-ran `grep -c "tracemalloc\|memray" tests/test_opensanctions_memory.py` → 0
- **Committed in:** `2c63cbc` (Task 3 commit; the docstring was edited before staging)

**2. [Rule 2 — Missing Critical] Verified upsert loop byte-identity programmatically (precaution beyond the plan's text-diff acceptance criterion)**

- **Found during:** Task 2 acceptance verification
- **Issue:** The plan only required visual git-diff inspection of the upsert loop body. Visual inspection of a long block-of-indented-code diff is error-prone; the plan's correctness invariant ("per-row upsert loop body byte-identical to HEAD") needs a programmatic check.
- **Fix:** Added a one-shot Python script that extracts the `for row in reader:` body from both `git show HEAD:scripts/scrape_opensanctions.py` and the working tree, dedents both to a common left-indent, and asserts equality. Result: byte-identical (modulo enclosing-block indent, which is mandatory because the body now lives inside two new `with` statements).
- **Files modified:** none (verification-only step)
- **Verification:** Inline Python output confirmed `UPSERT LOOP BODIES BYTE-IDENTICAL (after dedent): True`
- **Committed in:** N/A — this was a verification step, not a code change

---

**Total deviations:** 2 (1 docstring-guard mismatch, 1 verification step)
**Impact on plan:** Both deviations preserve plan intent — the first restores the literal grep guard pass, the second strengthens the byte-identity check from visual to programmatic. No scope creep.

## Issues Encountered

- **None substantive.** The plan was specified at a granularity that left almost nothing to interpret — code shapes, acceptance grep counts, and verification commands were all spelled out. Execution was straight-line.

## User Setup Required

None. Per D-16, the live-feed UAT (manual run of `uv run python scripts/scrape_opensanctions.py` against the real ~300-500 MB OpenSanctions CSV, observing peak RSS via `top` / Activity Monitor) is part of phase verification, not this plan. That UAT remains outstanding and should be done before tagging Phase 1 complete.

## Next Phase Readiness

- **Plan 01-02 (lex-web rate-limit UX)** is the second Wave 1 plan in this phase. It is fully independent of this plan (no shared files, no shared imports) and can land in any order.
- **No blockers** for the lex-web side from this plan's changes. lex-brain ingests into the same Postgres lex-web reads from, but the streaming change is invisible at the database boundary — only the per-row upsert loop body is observable downstream, and that body is byte-identical.

## Self-Check: PASSED

Verified by file existence + commit hash inspection:

- `/Users/beyond/Desktop/lex-brain/scripts/_lib/http_retry.py` — FOUND (modified, contextlib import + new context manager appended)
- `/Users/beyond/Desktop/lex-brain/scripts/scrape_opensanctions.py` — FOUND (modified, streamed acquisition + adapter class)
- `/Users/beyond/Desktop/lex-brain/tests/test_http_retry.py` — FOUND (modified, 4 new test_stream_* tests appended)
- `/Users/beyond/Desktop/lex-brain/tests/test_opensanctions_memory.py` — FOUND (created, 204 lines)
- Commit `d184412` (lex-brain) — FOUND
- Commit `60b3987` (lex-brain) — FOUND
- Commit `2c63cbc` (lex-brain) — FOUND
- Full lex-brain pytest suite — 38/38 PASS
- Sync/async helper byte-identity to HEAD~3 — VERIFIED True
- Upsert loop byte-identity (after dedent) — VERIFIED True
- Peak RSS measured — 36.0 MB (< 200 MB budget) ✓

---
*Phase: 01-reliability-observability*
*Plan: 01*
*Completed: 2026-05-09*
