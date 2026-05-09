---
phase: 01-reliability-observability
verified: 2026-05-09T18:14:43Z
status: passed
score: 3/3 success criteria verified
overrides_applied: 0
re_verification:
  previous_status: null # Initial verification
human_verification:
  - test: "D-16 / Phase 1 UAT — live OpenSanctions feed sniff"
    expected: "Run `cd /Users/beyond/Desktop/lex-brain && uv run python scripts/scrape_opensanctions.py` against the real OpenSanctions ~300–500 MB CSV on a 4 GB box; observe peak RSS via Activity Monitor / `top` and confirm peak < 200 MB."
    why_human: "Synthetic-CSV test (test_peak_rss_under_200_mb) covers the streaming budget but the live feed has different byte volume, gzip semantics, and real httpx connection behaviour. D-16 explicitly defers this to phase verification UAT, not the test suite."
  - test: "RL-01 in-browser smoke — chat rate-limit 429 → toast"
    expected: "On `bun run dev`, hit `/laws/[slug]` chat 11 times within 60 s. Verify <RateLimitToast /> renders the Bulgarian message + ticking 'Опитайте отново след Ns' countdown, auto-clears at 0, and the same toast appears on /courts/{chat,summarize}, /eu/{chat,summarize}, /intel/search, /issues/chat, /compare/[..]/[..]."
    why_human: "Visual rendering, 1-Hz countdown decrement, and screenreader announce-once pattern are not programmatically verifiable from grep/vitest alone."
  - test: "AI-07 stop-button mid-stream"
    expected: "On `/laws/[slug]` chat, click stop mid-stream; confirm Anthropic upstream call is canceled (Vercel function logs show request canceled before completion)."
    why_human: "Requires running dev server + real Anthropic upstream + manual interaction; abort propagation chain is otherwise traced statically."
  - test: "Vercel log-explorer grep gate"
    expected: "After deploy, in `vercel logs --follow`, hit a rate-limited route past its cap and confirm one structured JSON line per throttle event with the canonical 5 keys."
    why_human: "End-to-end log-pipeline ingestion (stdout JSON → Vercel structured logs) is observable only on a real Vercel deployment, not in CI."
---

# Phase 01 Verification

## Verdict: PASS (with deferred UAT items, not blocking)

All three Success Criteria are observably met in the codebase. 8/8 lex-web vitest + 38/38 lex-brain pytest pass. tsc --noEmit clean. Locked decisions D-01..D-15 honoured; D-16 (live-feed UAT) is by design deferred to phase verification UAT and is the only outstanding item — explicitly marked non-blocking by the locked decision itself.

## Success Criterion 1 — OpenSanctions peak RSS < 200 MB

- **Status:** MET (synthetic-CSV regression guard); D-16 live-feed UAT outstanding (non-blocking by design)
- **Evidence:**
  - `/Users/beyond/Desktop/lex-brain/scripts/scrape_opensanctions.py:33` imports `fetch_with_retry_stream`; lines 102, 119–122 wrap the body iteration in `with fetch_with_retry_stream(...) as r:` + `csv.DictReader(io.TextIOWrapper(_IterBytesAdapter(r.iter_bytes(chunk_size=65536)), encoding="utf-8", newline=""))`.
  - Forbidden buffered-ingest patterns absent: `grep -n 'r\.text\|io\.StringIO' scripts/scrape_opensanctions.py | grep -v '^[[:space:]]*#'` returns empty.
  - `scripts/_lib/http_retry.py:135-136` defines the new `@contextlib.contextmanager fetch_with_retry_stream(...)`. Existing helpers byte-identical to HEAD~3 (verified by AST.unparse comparison): `fetch_with_retry_sync`, `fetch_with_retry_async`, `_is_transient_status`, `_log_giving_up` — all IDENTICAL. `git diff HEAD~3 -- scripts/_lib/http_retry.py` shows ONLY additions (+1 import, +54 lines for the new helper); zero modifications to existing code (D-12 honoured).
  - `tests/test_opensanctions_memory.py:23` imports `psutil`; `:64-94` defines `PeakRssSampler` polling `psutil.Process().memory_info().rss` every 50 ms in a background thread; `:153-179` is the OS-01 acceptance test asserting `sampler.peak_mb < 200` against a 100 MB synthetic CSV streamed through `httpx.MockTransport`.
  - `grep -n 'tracemalloc\|memray' tests/test_opensanctions_memory.py` returns empty (D-14 honoured: psutil RSS, not Python heap trackers).
  - Test fixture is in-test synthetic CSV (`_write_synthetic_csv`) served via `httpx.MockTransport` with a generator content body — offline + deterministic (D-15 honoured).
- **Measured:** `tests/test_opensanctions_memory.py::test_peak_rss_under_200_mb PASSED in 3.26s` — peak RSS at 100 MB fixture is 36 MB per 01-01 SUMMARY (~5.5× safety margin).
- **Gaps:** none in the codebase. D-16 live-feed UAT is captured under "Outstanding work" — by design, not a phase blocker.

## Success Criterion 2 — 429 countdown UI on `/api/chat/[slug]`

- **Status:** MET
- **Evidence:**
  - Hook `lib/use-rate-limited-fetch.ts:27-152` exports `useRateLimitedFetch()` returning `SubmitResult` discriminated union. `:78-103` parses `res.status === 429`, prefers JSON `body.retry_after` (D-05 line 84), defaults to BG message (D-06 line 87). `:39-52` runs a 1-Hz `setInterval` decrementing `retryAfter` and clearing to `null` at zero (D-04). `:62-130` `submit()` returns `{ ok: true; response; signal: AbortSignal }` on success, preserving the abort chain for AI-07.
  - Toast `app/components/rate-limit-toast.tsx:50-74` renders `role="status" aria-live="polite" aria-atomic="true"` with `<span class="sr-only">{announceRef.current}</span>` (announce-once on null→set transition, RESEARCH Pitfall 5) and the visible BG countdown `<strong>Опитайте отново след {state.retryAfter}s</strong>` (D-04 + D-06).
  - 8/8 vitest tests pass (`bunx vitest run __tests__/use-rate-limited-fetch.test.tsx` → 4 passed; `__tests__/rate-limit.test.ts` → 4 passed; combined 8/8). Tests cover: 429 + retry_after parsing, 1-Hz countdown decrement, abort signal propagation, non-429 → setError (D-07), HMAC truncation, no log on under-cap, missing salt throws.
  - **Live runtime spot check:** `bunx tsx -e "..."` firing 11 fake requests through `rateLimited(req, "chat", { max: 10, windowMs: 60_000 })` produces the 429 at i=10 with the exact 5-key log line: `{"event":"rate_limit_throttled","route":"chat","ip_hash":"34f72e92af7bc593","retry_after":60,"ts":"2026-05-09T18:14:34.705Z"}`. End-to-end shape verified.
- **Migrated surfaces:** 6 caller files / 8 fetch sites
  - `app/laws/[slug]/chat.tsx` — 1 site (chat → `/api/chat/[slug]` — D-03 critical site)
  - `app/courts/[court]/[id]/decision-ai.tsx` — 2 sites (summarize + chat)
  - `app/eu/[celex]/regulation-ai.tsx` — 2 sites (summarize + chat)
  - `app/intel/search/intel-search-summary.tsx` — 1 site
  - `app/issues/issue-chat-button.tsx` — 1 site
  - `app/compare/[slug1]/[slug2]/compare-stream.tsx` — 1 site (JSON-lines body preserved)
  - `grep -rln useRateLimitedFetch app/` returns exactly these 6 paths (no extras, no surprises)
- **D-02 gate:** YES — `grep -rln useRateLimitedFetch app/analyze/` returns empty; `app/analyze/[slug]/analysis-stream.tsx` does NOT import the hook or toast.
- **D-03 gate:** YES — `app/laws/[slug]/chat.tsx:4` imports `useRateLimitedFetch`; `:206` calls `await rl.submit(`/api/chat/${slug}`, …)`.
- **AI-07 preservation:** YES — every chat surface threads the abort signal end-to-end (verified per file):
  - `laws/[slug]/chat.tsx:206 → :238 if (signal.aborted) break;` + `:195 rl.cancel()` on stop-button click.
  - `courts/[court]/[id]/decision-ai.tsx:227 → :254 + :337 → :362` (both summarize + chat); `:271 return () => rl.cancel()` on unmount.
  - `eu/[celex]/regulation-ai.tsx:193 → :220 + :301 → :329`; `:236 return () => rl.cancel()` on unmount.
  - `intel/search/intel-search-summary.tsx:78 → :107`; `:122 return () => rl.cancel()`.
  - `issues/issue-chat-button.tsx:127 → :156`.
  - `compare/[slug1]/[slug2]/compare-stream.tsx:111 → :141`; `:182 return () => rl.cancel()`.
- **Gaps:** none in the codebase. The 4 in-browser / live-Vercel UAT items in `human_verification:` cover what cannot be checked statically.

## Success Criterion 3 — Grep-able per-route throttle log

- **Status:** MET
- **Evidence:**
  - `lib/rate-limit.ts:79-85` emits exactly one `console.log(JSON.stringify({ event: "rate_limit_throttled", route: key, ip_hash: hashIp(ip), retry_after: retryAfter, ts: new Date().toISOString() }))` per over-cap event, INSIDE the `arr.length >= opts.max` branch (D-08 single source of truth, inside `rateLimited()`).
  - `grep -c 'rate_limit_throttled' lib/rate-limit.ts` → 1; `grep -c 'createHmac' lib/rate-limit.ts` → 2 (import + use); `grep -c 'createHash' lib/rate-limit.ts` → 0.
  - **Sample log line (live runtime):** `{"event":"rate_limit_throttled","route":"chat","ip_hash":"34f72e92af7bc593","retry_after":60,"ts":"2026-05-09T18:14:34.705Z"}` — captured by the spot check above. Single-line JSON; Vercel auto-parses to structured logs.
  - 4/4 server-side vitest tests pass (`bunx vitest run __tests__/rate-limit.test.ts`): canonical 5-key shape, no log on under-cap, HMAC keying property (different salt → different hash), missing salt throws at module load.
- **D-09 5-key shape:** YES — keys are exactly `event`, `route`, `ip_hash`, `retry_after`, `ts` (matching the locked spec character-for-character).
- **D-10 HMAC (not createHash):** YES — `:16 import { createHmac } from "node:crypto"`, `:31 createHmac("sha256", SALT!).update(ip).digest("hex").slice(0, 16)`. Truncated to 16 hex chars (8 bytes). `createHash` does not appear in the file.
- **D-11 no sampling:** YES — single `console.log(JSON.stringify(...))` is in the over-cap branch and runs on every throttled event; no `Math.random()` / sampling guard around it. Test `does NOT log on under-cap requests` verifies the under-cap path stays silent (i.e. the log fires only on actual throttles, no sampling).
- **Gaps:** none in the codebase. Vercel-side log-pipeline verification is in `human_verification:` (post-deploy `vercel logs --follow` grep).

## Locked-decision compliance

| ID | Description | Compliant? | Evidence |
| --- | --- | --- | --- |
| D-01 | shared hook for 8 surfaces (excluding analyze) | YES | `grep -rln useRateLimitedFetch app/` → 6 files; 8 fetch sites (courts + EU each have 2 = chat + summarize) |
| D-02 | analyze excluded | YES | `grep -rln useRateLimitedFetch app/analyze/` → empty |
| D-03 | laws/chat included (drives RL-01) | YES | `app/laws/[slug]/chat.tsx:4` imports the hook; `:206` calls `rl.submit('/api/chat/${slug}', …)` |
| D-04 | toast above chat, auto-clear at 0 | YES | `rate-limit-toast.tsx:50-72` renders fixed banner; `use-rate-limited-fetch.ts:39-52` `setRateLimited(null)` when `next <= 0` |
| D-05 | JSON retry_after over Retry-After | YES | `use-rate-limited-fetch.ts:84` comment + `:88-95` parses `body.retry_after`; never reads the header |
| D-06 | Bulgarian Cyrillic | YES | `rate-limit.ts:88` server message `"Твърде много заявки. Моля, изчакайте."`; `rate-limit-toast.tsx:41,62` BG countdown `Опитайте отново след …` |
| D-07 | inline setError handles non-429 | YES | `use-rate-limited-fetch.ts:105-113` non-429 branch sets `error` and returns `{ ok: false, error }`; toast state untouched |
| D-08 | log inside rateLimited() | YES | `rate-limit.ts:71-85` log line is in the over-cap branch of `rateLimited()`; no per-route boilerplate at API routes |
| D-09 | 5-key JSON one-liner | YES | `rate-limit.ts:79-85` emits exactly the 5 named keys; spot-check log line confirms |
| D-10 | HMAC-SHA-256 with AUDIT_VOTE_SALT, 16 hex truncation | YES | `rate-limit.ts:16,31` `createHmac("sha256", SALT!).update(ip).digest("hex").slice(0, 16)`; `createHash` count = 0 |
| D-11 | no sampling | YES | Single unconditional `console.log` in over-cap branch; tests confirm under-cap silence |
| D-12 | new stream helper, do not refactor existing | YES | AST-equality check confirms `fetch_with_retry_sync` and `fetch_with_retry_async` byte-identical to HEAD~3; `git diff` shows additive-only change to `_lib/http_retry.py` (one import + one new function) |
| D-13 | match retry/backoff semantics | YES | New helper reuses `_BACKOFF`, `_is_transient_status`, `_log_*` in the same loop shape as `fetch_with_retry_sync` (verified in source `_lib/http_retry.py:135–186`) |
| D-14 | psutil RSS, NOT tracemalloc | YES | `tests/test_opensanctions_memory.py:23` imports `psutil`; `:77` polls `self._proc.memory_info().rss`; grep for `tracemalloc\|memray` → 0 |
| D-15 | synthetic CSV in-test, offline | YES | `_write_synthetic_csv` writes to `tmp_path_factory`; served via `httpx.MockTransport`; never touches the live URL |
| D-16 | real-feed UAT deferred | YES (acknowledged) | Not in test suite; surfaced under "Outstanding work" + `human_verification:` |

## Test results

- **lex-brain:** 38/38 pytest pass (`uv run pytest`) — 17 http_retry (13 existing + 4 new test_stream_*), 2 OS-01 memory, 12 parser, 7 slug
- **lex-web:** 8/8 vitest pass (`AUDIT_VOTE_SALT=verifier-test bunx vitest run`) — 4 rate-limit + 4 use-rate-limited-fetch
- **lex-web tsc --noEmit:** clean (no output / exit 0)
- **lex-web next build:** not re-run by verifier — 01-02 SUMMARY documents `bunx next build` succeeded after `AUDIT_VOTE_SALT` was set in `.env.local` (which is gitignored). The salt-throw at module load is intentional SEC-06 behaviour.

## Outstanding work

- **D-16 UAT (deferred by design, not a phase blocker):** live OpenSanctions feed peak-RSS sniff on a 4 GB box. Run `cd /Users/beyond/Desktop/lex-brain && uv run python scripts/scrape_opensanctions.py` against the real ~300–500 MB CSV; observe peak RSS via `top` / Activity Monitor; confirm < 200 MB. Captured under `human_verification:` so the orchestrator surfaces it.
- **Salt-domain reuse finding (acknowledged, future cleanup):** `AUDIT_VOTE_SALT` is now used in two cryptographic primitives — `app/api/audit/vote/route.ts` uses `createHash("sha256").update(ip + SALT)` (concat-hash), `lib/rate-limit.ts` uses `createHmac("sha256", SALT).update(ip)` (HMAC). 01-02 SUMMARY § "Salt Domain Reuse Finding" documents the rationale (cross-domain correlation cryptographically infeasible without the secret; both primitives are pre-image-resistant). Future hardening: add domain prefixes (`"vote:" + ip` / `"ratelimit:" + ip`) when audit/vote is next refactored. Not a phase blocker.
- **In-browser RL-01 smoke + Vercel log grep:** see `human_verification:` items 2–4. Static + unit-test evidence is complete; live runtime confirmation is a UAT step.

No items found that should block phase tagging. Verdict: **PASS**.

---

*Verified: 2026-05-09T18:14:43Z*
*Verifier: Claude (gsd-verifier)*
