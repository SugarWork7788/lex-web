# Phase 1: Reliability & observability - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 1-Reliability & observability
**Areas discussed:** Rate-limit UX rollout scope, Countdown UI placement, Throttle log shape & location, OpenSanctions streaming + memory assertion

---

## Rate-limit UX rollout scope

| Option | Description | Selected |
|--------|-------------|----------|
| Just /laws/[slug] chat | Matches the success criterion verbatim, smallest change | |
| All AI chat surfaces (4 chat-style routes) | law + court + EU + issues; one shared hook | |
| All 8 rate-limited routes except analyze | law chat, court chat + summarize, EU chat + summarize, issues chat, intel search, compare. Analyze excluded (long-running multi-pass UX) | ✓ |

**User's choice:** "All 8 rate-limited routes except analyze" (clarified after first response — user originally wrote "8 AI chat surfaces (law + court + EU + issues)"; one follow-up question pinned the exact mapping).
**Notes:** Analyze is explicitly out — its 300s `maxDuration` + multi-pass error UI would conflict with the toast pattern. The success-criterion route (`/api/chat/[slug]`) MUST be in the converted set.

---

## Countdown UI placement

| Option | Description | Selected |
|--------|-------------|----------|
| Inline error pill above input | Replaces current `setError` text with a styled pill | |
| Disabled-input + countdown badge | Badge inside the textarea, near the send button | |
| Toast/banner above the chat | Top of chat column, auto-clears at 0 | ✓ |

**User's choice:** Toast/banner above the chat — auto-clear at 0.
**Notes:** Auto-clearing at 0 means the user doesn't have to dismiss anything to retry. Bulgarian text only; the existing server message is the source of truth, the countdown is rendered client-side from the JSON `retry_after`.

---

## Throttle log shape & location

| Option | Description | Selected |
|--------|-------------|----------|
| Log per-route in each handler | Per-route boilerplate, more flexible | |
| Log inside `rateLimited()` centrally | Single source of truth, every caller benefits | ✓ |
| JSON one-liner format | `{event, route, ip_hash, retry_after}` via console.log | ✓ |
| Grep-friendly key=value plain text | `[rate-limit] route=chat ip_hash=… retry=24s` | |
| Reuse `AUDIT_VOTE_SALT` | Already mandatory env var | ✓ |
| New `RATE_LIMIT_SALT` env var | More targeted scope | |

**User's choice:** Centralised in `rateLimited()`, JSON one-liner, reuse `AUDIT_VOTE_SALT`.
**Notes:** Sample rate not explicitly addressed — defaulting to "every throttle event, no sampling" since volume is bounded by the cap itself. `ip_hash` truncated to 16 hex chars (8 bytes) so logs stay scannable.

---

## OpenSanctions streaming + memory assertion

| Option | Description | Selected |
|--------|-------------|----------|
| Refactor `fetch_with_retry_sync` to support streaming | Existing helper; risky for ~10 other callers | |
| Fork a new streamed helper | New `fetch_with_retry_stream` alongside; old helper untouched | ✓ |
| `tracemalloc` snapshot | Python-allocations only; doesn't see lower-layer buffering | |
| `psutil.Process().memory_info().rss` post-run sampling | OS-level RSS; matches success-criterion semantics | ✓ |
| `resource.getrusage` post-run | Coarser; same RSS-ish info | |

**User's choice:** Fork a new streamed helper; psutil RSS sampling post-run.
**Notes:** Fixture choice not explicitly addressed — defaulting to a synthetic ~300 MB CSV generated in-test (deterministic, offline). Real-feed verification is part of phase UAT, not the test suite. psutil sampling cadence (every N rows vs. timer-based) left to executor.

---

## Claude's Discretion

- Exact name of the new client hook / fetch wrapper
- Toast component implementation (hand-rolled vs. existing primitive)
- Whether the new streamed helper lives in `_lib/http_retry.py` or `_lib/http_stream.py`
- psutil sampling cadence (every N rows vs. timer-based)
- Whether to factor a small `lib/log.ts` helper around the JSON.stringify
- Throttle-log sample rate (defaulted to "every event")
- Test fixture size / generation method (defaulted to ~300 MB synthetic)

## Deferred Ideas

- Distributed (Vercel KV / Upstash) rate limiter — captured in Phase 999.2
- Per-route limit-value tuning — Phase 1 surfaces existing throttle, doesn't change values
- Authenticated rate-limit identity (user_id-based) — blocked by v2.3 auth, not Phase 1's concern
- Sentry / external log aggregation — out of scope; stdout-to-Vercel-logs is enough
- `/analyze/[slug]` getting the toast UX — explicitly excluded
- OpenSanctions API-key fallback path — already handled by retry helper, unchanged
