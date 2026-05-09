---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: milestone
status: discussing
last_updated: "2026-05-10T00:00:00Z"
last_activity: 2026-05-10 -- Phase 02 context gathered (13 decisions captured, ready for /gsd-plan-phase 2)
progress:
  total_phases: 11
  completed_phases: 1
  total_plans: 3
  completed_plans: 3
  percent: 27
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-04)

**Core value:** Every Bulgarian citizen can read, understand, and act on the law that affects them — without paying for a lawyer to translate it.
**Current focus:** Phase 02 — new-ai-features (intel search v2 + audit PDF download)

## Current Position

Phase: 02 (new-ai-features) — DISCUSSING (CONTEXT.md written; 13 decisions locked across INT-02 + PDF-01)
Plan: 0 of 4 (planned: 02-01 intel API ranking, 02-02 intel UI cards, 02-03 audit PDF route, 02-04 audit download button)
Status: Ready for /gsd-plan-phase 2
Last activity: 2026-05-10 -- Phase 02 context gathered via /gsd-discuss-phase

Progress: ███░░░░░░░ 27%

## Performance Metrics

**Velocity:**

- Total plans completed: 3
- Average duration: ~10 min
- Total execution time: ~29 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 3/3 | ~29 min | ~10 min |
| 2 | 0/4 | — | — |
| 3 | 0/3 | — | — |

**Recent Trend:**

- Last 5 plans: 01-02 (16 min, parallel with 01-01), 01-01 (10 min, parallel with 01-02), 01-00 (3 min)
- Trend: ↑ (longer plans as they leave bootstrap and touch real source)

**Plan history:**

| Phase | Plan | Duration | Tasks | Files | Completed |
|-------|------|----------|-------|-------|-----------|
| 01-reliability-observability | 00 | 3 min | 3 | 5 | 2026-05-09 |
| 01-reliability-observability | 01 | ~10 min | 3 | 4 | 2026-05-09 |
| 01-reliability-observability | 02 | ~16 min | 3 | 11 | 2026-05-09 |

*Updated after each plan completion*

## Accumulated Context

### Decisions

- 2026-05-04: GSD initialized in auto mode (skipped deep questioning + research) because the project is brownfield with deep session context already captured in PROJECT.md.
- 2026-05-04: All planning + code commits flow through PRs on feature branches (rule in user memory). PR #1 (chore/gsd-setup) merged.
- **2026-05-05**: User authentication promoted from "Out of Scope" to a new **v2.3 milestone** (Phases 4–7). Anonymous reading preserved on `/laws` and `/audit` content; only voting + `/intel` + future premium features will be gated. Stripe / billing explicitly stays out of scope; v2.3 only ships the gating hooks.
- 2026-05-09 (01-00): Accepted uv's default psutil pin (^7.2.2) — psutil 7.x is current per RESEARCH §"Standard Stack — Track A".
- 2026-05-09 (01-00): vitest.config.ts uses `path.resolve(__dirname, ".")` for the `@` alias to mirror tsconfig.json `paths` exactly so test imports of `@/lib/*` resolve identically to production.
- 2026-05-09 (01-00): `globals: true` in vitest config so `describe`/`it`/`expect` work without explicit imports (matches Vitest convention used by RESEARCH §"Vitest hook test skeleton").
- 2026-05-09 (01-01): `_IterBytesAdapter` duplicated (16 lines × 2 callers) rather than promoted to `_lib/` — duplication costs less than coupling for two callers. Promote when a third caller appears.
- 2026-05-09 (01-01): Test monkeypatched `scripts._lib.http_retry.time.sleep` (module-bound name) instead of global `time.sleep` to match the existing sync-helper test convention in the same file.
- 2026-05-09 (01-02): Local `.env.local` gained `AUDIT_VOTE_SALT=local-dev-salt-do-not-deploy-this-value` (git-ignored) so the new module-load throw in `lib/rate-limit.ts` doesn't block local `bunx next build`. Production already has the real salt on Vercel.
- 2026-05-09 (01-02): Hook re-arm + toast announce-once both keyed on a derived `isActive = state !== null` boolean for clearer null↔set transition semantics; behaviour identical to RESEARCH Pattern 3 / 5.

### Milestone queue

1. **v2.2** (active, Phase 1 in flight) — Reliability & observability → New AI features → Mobile polish & CodeRabbit
2. **v2.3** (queued, starts after v2.2) — Auth foundation → Middleware → Page gating → Premium hooks

### Open questions

- (none — Phase 1 implementation complete; verifier next)

### Pitfalls

- Phase 2's PDF route must use Node runtime (Vercel Edge can't spawn puppeteer). Stay consistent with the existing streaming-route pattern: `runtime: "nodejs"` + explicit `maxDuration`.
- Phase 1's rate-limit UI message must be accessible — don't gate behind a hover-only tooltip.
- Vitest 4 dropped the `basic` reporter — the plan's smoke-test command needs the default reporter (or `default`/`verbose`/`tap`). Discovered while running 01-00 Task 3.
- `lib/rate-limit.ts` now throws at module load if `AUDIT_VOTE_SALT` is missing — local Next builds need it in `.env.local`, CI needs it in env, Vercel already has it. Future tests that import the module must set the env var before the dynamic `import()`.
- `AUDIT_VOTE_SALT` is now used in two HMAC/hash domains (audit/vote `createHash` + rate-limit `createHmac`). When audit/vote is upgraded to HMAC, add domain prefixes (`"vote:"` vs `"ratelimit:"`) for full domain separation.

### Last session

- **Last session:** 2026-05-09T17:46:00Z — 2026-05-09T18:05:00Z (~19 min wall, 2 plans completed in parallel: 01-01 + 01-02)
- **Stopped at:** Phase 01 implementation complete (3/3 plans). All gates green: 8/8 vitest, tsc clean, 38/38 pytest. UAT D-16 (live OpenSanctions feed peak-RSS sniff) still deferred.
- **Resume file:** None — next step is `/gsd-verify-work 1` (or move on to Phase 2).

---
*State initialized: 2026-05-04*
*Last plan complete: 2026-05-09 -- 01-02 (rate-limit observability + 429 toast)*
