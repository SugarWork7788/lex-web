---
phase: 01-reliability-observability
plan: 02
subsystem: lex-web rate-limit observability + UX
status: complete
completed: 2026-05-09
duration_min: 12
tasks: 3
tests: 8
tags: [typescript, react-19, nextjs-16, lex-web, rate-limit, observability, hmac, aria-live]
requirements: [RL-01]
dependency_graph:
  requires:
    - 01-00  # vitest + RTL + jsdom test infra
    - lib/rate-limit.ts (existing v2.1.x rateLimited()/getClientIp())
    - AUDIT_VOTE_SALT env var (existing — PROJECT.md "Key Decisions")
  provides:
    - lib/use-rate-limited-fetch.ts (shared hook for 429 handling + abort + countdown)
    - app/components/rate-limit-toast.tsx (aria-live banner)
    - rate_limit_throttled JSON log stream (Vercel log explorer source)
  affects:
    - 6 caller files / 8 fetch sites (chat surfaces consuming rate-limited APIs)
tech-stack:
  added: []
  patterns:
    - "HMAC-SHA-256 over IP keyed with AUDIT_VOTE_SALT, truncated to 16 hex (D-10)"
    - "Single-line console.log JSON ingestion via Vercel log pipeline (D-09)"
    - "Hook hands back { response, signal } on success — caller owns body reader (RESEARCH Pattern 3, AI-07 preservation)"
    - "Announce-once-on-null→set sr-only span + visible aria-hidden countdown (RESEARCH Pattern 5)"
key-files:
  created:
    - /Users/beyond/Desktop/lex-web/lib/use-rate-limited-fetch.ts
    - /Users/beyond/Desktop/lex-web/app/components/rate-limit-toast.tsx
    - /Users/beyond/Desktop/lex-web/__tests__/rate-limit.test.ts
    - /Users/beyond/Desktop/lex-web/__tests__/use-rate-limited-fetch.test.tsx
  modified:
    - /Users/beyond/Desktop/lex-web/lib/rate-limit.ts
    - /Users/beyond/Desktop/lex-web/app/laws/[slug]/chat.tsx
    - /Users/beyond/Desktop/lex-web/app/courts/[court]/[id]/decision-ai.tsx
    - /Users/beyond/Desktop/lex-web/app/eu/[celex]/regulation-ai.tsx
    - /Users/beyond/Desktop/lex-web/app/intel/search/intel-search-summary.tsx
    - /Users/beyond/Desktop/lex-web/app/issues/issue-chat-button.tsx
    - /Users/beyond/Desktop/lex-web/app/compare/[slug1]/[slug2]/compare-stream.tsx
decisions:
  - "AUDIT_VOTE_SALT used in two HMAC/hash domains (audit/vote concat-hash + rate-limit HMAC) — accepted finding for Phase 1; future cleanup adds domain prefixes"
  - "lib/rate-limit.ts throws at module load if AUDIT_VOTE_SALT missing (matches SEC-06; existing audit/vote uses a fallback string — divergence intentional, out of Phase 1 scope)"
  - "Hook does NOT take ownership of the body reader; each surface preserves its existing decode loop verbatim (compare-stream JSON-lines, others plain text)"
  - "Announce-once aria-live pattern: sr-only text set once on null→set transition; visible countdown ticks via aria-hidden span"
metrics:
  duration_min: 12
  files_created: 4
  files_modified: 7
  fetch_sites_migrated: 8
  tests_added: 8
---

# Phase 1 Plan 02: Rate-limit observability + 429 toast Summary

**One-liner:** RL-01 — `lib/rate-limit.ts` emits a canonical 5-key JSON throttle log line (HMAC-SHA-256 ip_hash) and a new `useRateLimitedFetch` hook surfaces 429s as a Bulgarian aria-live countdown toast across 8 fetch sites in 6 caller files, while `/analyze/[slug]` retains its own multi-pass error UX (D-02).

## What Was Built

### Server side — `lib/rate-limit.ts`

- Imports `createHmac` from `node:crypto`.
- Reads `AUDIT_VOTE_SALT` at module load. **Throws** `"AUDIT_VOTE_SALT is required"` if absent — matches SEC-06's "salt is mandatory" contract. The audit/vote module currently uses a fallback default string; that divergence is documented (see "Salt Domain Reuse Finding" below) and intentionally out of Phase 1 scope.
- Adds `hashIp(ip)` helper: `createHmac("sha256", SALT!).update(ip).digest("hex").slice(0, 16)`.
- In the **over-cap branch only** (before the existing `return new Response(...)`), emits exactly one `console.log(JSON.stringify({ event, route, ip_hash, retry_after, ts }))` line per throttle event.
- The **under-cap branch is byte-identical** to v2.1.x — under-cap requests are not logged (D-11 applies to throttled events only).

Sample log line shape (D-09):
```json
{"event":"rate_limit_throttled","route":"chat","ip_hash":"4a3b2c1d0e9f8a7b","retry_after":47,"ts":"2026-05-09T20:33:42.103Z"}
```

### Client side — hook + toast

- **`lib/use-rate-limited-fetch.ts`** (152 lines) — exports `useRateLimitedFetch()` returning `{ submit, cancel, finish, dismissRateLimited, busy, error, rateLimited, setError }`.
  - `submit()` returns a discriminated `SubmitResult` union:
    - `{ ok: true; response: Response; signal: AbortSignal }` — caller owns the body reader; `signal` is the same controller `cancel()` aborts, so the AI-07 chain (stop-button → fetch signal → API route `req.signal` → upstream Anthropic stream) stays intact.
    - `{ ok: false; rateLimited: { retryAfter, message } }` — 429 parsed; toast displays.
    - `{ ok: false; error: string }` — non-429 error; D-07 fallback.
    - `{ ok: false; aborted: true }` — user clicked stop / unmount cleanup.
  - Internal `setInterval` ticks the countdown once per second; effect re-arms on the `null↔set` flip only (not on every retryAfter decrement) so the timer isn't torn down each tick.
  - Cleanup `useEffect` aborts any in-flight controller on unmount and clears the tick interval.
- **`app/components/rate-limit-toast.tsx`** — `<RateLimitToast />` with `role="status"`, `aria-live="polite"`, `aria-atomic="true"`. Visible countdown lives in an `aria-hidden` span; the `sr-only` announce text is set once via `useRef` on the `null→set` transition (RESEARCH Pattern 5; Pitfall 5 — no SR re-announce per tick).

### Caller migrations (8 fetch sites across 6 files, D-01 + D-03)

| File | Fetch site(s) | Endpoint(s) |
|------|---------------|-------------|
| `app/laws/[slug]/chat.tsx` | 1 | `/api/chat/[slug]` (D-03 required) |
| `app/courts/[court]/[id]/decision-ai.tsx` | 2 | `/api/courts/{summarize,chat}/[court]/[id]` |
| `app/eu/[celex]/regulation-ai.tsx` | 2 | `/api/eu/{summarize,chat}/[celex]` |
| `app/intel/search/intel-search-summary.tsx` | 1 | `/api/intel/search` |
| `app/issues/issue-chat-button.tsx` | 1 | `/api/issues/chat` |
| `app/compare/[slug1]/[slug2]/compare-stream.tsx` | 1 | `/api/compare/[slug1]/[slug2]` (JSON-lines body preserved verbatim) |

Each surface:
- Replaces its bespoke `useState(busy/error)` + `useRef<AbortController>(null)` block with a single `const rl = useRateLimitedFetch();`.
- Replaces the `fetch(...)` + 429-text-handling block with `await rl.submit(url, init)` + a switch on `result.ok` / `"rateLimited" in result` / `"aborted" in result`.
- Preserves its **existing streaming-body logic verbatim** (chat surfaces accumulate `acc += decoder.decode(...)`; compare-stream parses `\n`-delimited JSON; intel-search-summary accumulates plain text). The only changes are the fetch shell + the abort hand-off via `result.signal`.
- Renders `<RateLimitToast state={rl.rateLimited} onDismiss={rl.dismissRateLimited} />` above its main content.
- Routes the user's stop button (where one exists, e.g. laws/chat) through `rl.cancel()`, which aborts the same controller `submit()` opened — preserving AI-07.

`app/courts/[court]/[id]/decision-ai.tsx` and `app/eu/[celex]/regulation-ai.tsx` each contain TWO fetch sites (chat + summarize) but use ONE shared `rl` instance hoisted into the parent component — a user only triggers one surface at a time, so sharing busy/rateLimited state is correct and the toast renders once.

`app/analyze/[slug]/analysis-stream.tsx` was **not modified** (D-02). Verified: `grep -rln useRateLimitedFetch app/analyze/` returns empty.

## AI-07 (abort propagation) preservation

| Surface | How `result.signal` (or rl.cancel) flows into the body reader |
|---------|---|
| `laws/[slug]/chat.tsx` | `if (signal.aborted) break;` inside the reader loop; stop-button calls `rl.cancel()` → controller aborts → fetch's underlying request emits abort → API route's `req.signal` aborts the upstream Anthropic stream. |
| `courts/.../decision-ai.tsx` (×2) | Same `if (signal.aborted) break;` guard; effect cleanup calls `rl.cancel()`. |
| `eu/[celex]/regulation-ai.tsx` (×2) | Same as above. |
| `intel/search/intel-search-summary.tsx` | Same — effect cleanup calls `rl.cancel()` on unmount. |
| `issues/issue-chat-button.tsx` | Same — submit gets `signal`; loop checks `signal.aborted`. |
| `compare/[slug1]/[slug2]/compare-stream.tsx` | Same — JSON-lines decoder loop respects `signal.aborted`; effect cleanup `rl.cancel()`. |

No `AbortController` is dropped on the floor anywhere — `git diff` for each migrated file shows the previous `useRef<AbortController | null>(null)` + manual abort lifecycle was replaced with hook-owned controller + `rl.cancel()` at the same call sites.

## Tests

8 vitest tests, all passing:

| File | Test | Asserts |
|------|------|---------|
| `__tests__/rate-limit.test.ts` | "emits a single JSON throttle line on over-cap with the canonical 5-key shape" | Strict 5-key shape; `event="rate_limit_throttled"`; `ip_hash` matches expected HMAC truncation; `retry_after` is a positive number; `ts` parses as Date |
| | "does NOT log on under-cap requests (D-11 applies to throttled events only)" | 5 requests at max=5 → `console.log` spy never called |
| | "uses HMAC (not plain SHA-256) — different salt produces different hash" | Re-import with a different `AUDIT_VOTE_SALT` produces a structurally different `ip_hash` (HMAC keying property) |
| | "throws at module load if AUDIT_VOTE_SALT is missing (matches SEC-06)" | `await expect(import(...)).rejects.toThrow(/AUDIT_VOTE_SALT/)` |
| `__tests__/use-rate-limited-fetch.test.tsx` | "parses 429 + retry_after into rateLimited state (D-05/D-06)" | `result.rateLimited.retryAfter === 47`, message contains `Твърде много` |
| | "decrements countdown each second and clears at 0 (D-04)" | Fake timers: `retryAfter` 2 → 1 → null after two 1000ms ticks |
| | "propagates abort signal to fetch (preserves AI-07)" | `init.signal` received by mocked fetch; `result.signal` returned to caller; `cancel()` aborts the same signal |
| | "non-429 errors flow to setError, not rateLimited (D-07)" | 500 response → `result.error` populated, `result.rateLimited` untouched |

```
$ bunx vitest run
 Test Files  2 passed (2)
      Tests  8 passed (8)
```

`bunx tsc --noEmit` exits clean. `bunx next build` succeeds with no "Failed to compile" / "Error" lines (after `AUDIT_VOTE_SALT` is present in the local environment — see "Deviations" below).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Local `.env.local` was missing `AUDIT_VOTE_SALT`**
- **Found during:** Task 3 verification (`bunx next build`)
- **Issue:** The new `lib/rate-limit.ts` throws at module load if `AUDIT_VOTE_SALT` is absent (the desired SEC-06 behaviour, matching D-08/D-10). The repo's `.env.local` did not have `AUDIT_VOTE_SALT` set, so the build's page-data collection step failed when API routes initialised the rate-limit module. PROJECT.md "Key Decisions" lists `AUDIT_VOTE_SALT` as already-mandatory (production sets it on Vercel); the local env was simply never seeded with one.
- **Fix:** Added `AUDIT_VOTE_SALT=local-dev-salt-do-not-deploy-this-value` to `.env.local` (which is gitignored — verified via `git check-ignore .env.local`). This does NOT enter source control. Vercel production already has the real value. After the env was set, `bunx next build` succeeded with no errors.
- **Files modified:** `.env.local` (gitignored, not committed)
- **Commit:** none — `.env.local` is git-ignored on purpose

**2. [Comment text] `createHash` substring appearing in a comment in `lib/rate-limit.ts` tripped the `grep -c 'createHash'` acceptance gate**
- **Found during:** Task 1 grep verification
- **Issue:** The plan's acceptance criterion `grep -c 'createHash' lib/rate-limit.ts` must return 0 — the intent is "no `createHash(...)` *function call*". My initial comment described "the audit/vote createHash divergence" which contained the literal substring `createHash`.
- **Fix:** Changed the comment to "the audit/vote concat-hash divergence" — same meaning, no false grep match. Acceptance gate now passes.
- **Files modified:** `lib/rate-limit.ts` (in the same Task-1 commit)

No bugs found. No architectural decisions needed. No fix-attempt limits hit.

## Authentication Gates

None — this plan touches client-side fetch wrappers and a server-side logger. No authentication flows were exercised.

## Salt Domain Reuse Finding (RESEARCH-flagged, Phase 1 accepts)

`AUDIT_VOTE_SALT` is now used in TWO different cryptographic primitives:

1. **`app/api/audit/vote/route.ts`** — `createHash("sha256").update(ip + SALT)` (concat-hash; v2.1 carry-over)
2. **`lib/rate-limit.ts`** (this phase, D-10) — `createHmac("sha256", SALT).update(ip)` (HMAC; correct primitive)

Both are pre-image-resistant. Cross-domain correlation (could an attacker who saw both an audit-vote hash AND a rate-limit `ip_hash` for the same IP confirm they refer to the same IP?) is cryptographically infeasible without the salt for both. **Phase 1 accepts this reuse** because:

- Both already require the same secret env var, and adding `RATE_LIMIT_SALT` would break SEC-06's "single mandatory salt" simplicity.
- HMAC's pseudorandom output is a different distribution from the concat-hash's, so the two hashes for the same IP are uncorrelated.

**Future hardening note:** when audit/vote is upgraded from `createHash` to HMAC, also add domain prefixes (`createHmac("sha256", SALT).update("vote:" + ip)` vs `update("ratelimit:" + ip)`) to fully separate the domains. Tracked as a follow-up.

## audit/vote `createHash` divergence note (D-10 mandates HMAC; existing audit/vote retains concat-hash)

D-10 explicitly chose HMAC for the new throttle log path. The existing `app/api/audit/vote/route.ts` uses `createHash("sha256").update(ip + SALT)` — that is salted-SHA, not HMAC. **This is a known divergence**, intentionally NOT addressed in Phase 1 (RESEARCH §"Open Question 3", §"Anti-Patterns to Avoid"). Reasoning:

- Migrating audit/vote's hash format would invalidate every deduplication record currently in the database — vote-fingerprint matching would break for already-counted votes.
- Phase 1's scope is observability + UX, not vote-system rework.
- The vote-fingerprint hashes are not used for security decisions (only dedup) — concat-hash is "weaker than HMAC but still pre-image resistant". Acceptable for that use case.

When the audit/vote module is next touched, that's the right moment to do the migration + a vote-record back-fill; until then, the divergence stays.

## Migration coverage gates (verified)

```
$ grep -rln 'useRateLimitedFetch' app/ | grep -v analyze | wc -l
6
$ grep -rln 'useRateLimitedFetch' app/analyze/ 2>/dev/null
(empty — D-02 honoured)
$ grep -c 'rate_limit_throttled' lib/rate-limit.ts
1
$ grep -c 'createHmac' lib/rate-limit.ts
2
$ grep -c 'createHash' lib/rate-limit.ts
0
```

## Commits

- `b5e66e7` — feat(01-02): emit HMAC throttle log + module-load salt guard
- `ddb737e` — feat(01-02): add useRateLimitedFetch hook + RateLimitToast
- `c4b8754` — refactor(01-02): migrate 6 caller files to useRateLimitedFetch
- (this commit) — docs(01-02): summary — rate-limit observability + 429 toast

## UAT Checklist (deferred per Success Criterion #2 — manual phase verification)

- [ ] Hit `/api/chat/[slug]` 11 times in 60 seconds against the dev server (`bun run dev`); confirm `<RateLimitToast />` renders above the chat with the Bulgarian message + ticking countdown that auto-clears at 0.
- [ ] Verify the same toast renders for `/api/courts/{chat,summarize}`, `/api/eu/{chat,summarize}`, `/api/intel/search`, `/api/issues/chat`, `/api/compare/[..]/[..]`.
- [ ] Verify `/api/analyze/[slug]` UX is unchanged — inline error path still applies, no toast.
- [ ] Click the stop button on `/laws/[slug]` mid-stream; confirm Anthropic upstream is aborted (Vercel function logs show the request canceled before completion).
- [ ] After deploy: `vercel logs --follow` and grep for `event:rate_limit_throttled`. Confirm one structured JSON line per throttle event with the canonical 5 keys.

## Threat Flags

None. The new client-side surface is purely UI; the new server-side surface is a single structured log emission with no user-controlled data flowing into it (the message is a hard-coded BG string in `lib/rate-limit.ts`, the IP comes from existing `getClientIp(req)`). All threats from the plan's `<threat_model>` are mitigated as designed.

## Self-Check: PASSED

Files created (all four exist):
- `/Users/beyond/Desktop/lex-web/lib/use-rate-limited-fetch.ts` — FOUND
- `/Users/beyond/Desktop/lex-web/app/components/rate-limit-toast.tsx` — FOUND
- `/Users/beyond/Desktop/lex-web/__tests__/rate-limit.test.ts` — FOUND
- `/Users/beyond/Desktop/lex-web/__tests__/use-rate-limited-fetch.test.tsx` — FOUND

Commits in `git log --oneline --all`:
- `b5e66e7` — FOUND
- `ddb737e` — FOUND
- `c4b8754` — FOUND
