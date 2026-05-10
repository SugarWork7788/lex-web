---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: milestone
status: shipping
last_updated: "2026-05-10T09:30:00Z"
last_activity: 2026-05-10 -- Phase 02 shipped — PR #5 (preview green, MERGEABLE)
progress:
  total_phases: 11
  completed_phases: 2
  total_plans: 6
  completed_plans: 6
  percent: 55
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-04)

**Core value:** Every Bulgarian citizen can read, understand, and act on the law that affects them — without paying for a lawyer to translate it.
**Current focus:** Phase 02 — new-ai-features (intel search v2 + audit PDF download)

## Current Position

Phase: 02 (new-ai-features) — SHIPPED (PR #5 open, Vercel preview green, CodeRabbit pending, MERGEABLE)
Plan: 3 of 3 (02-01 ✓ + 02-02 ✓ + 02-03 ✓ — Wave 2 parallel done; PDF-01 + INT-02 closed)
Status: PR #5 open against main — preview deploy READY, MERGEABLE; 6 manual UAT items deferred to preview verification before merge
Last activity: 2026-05-10 -- Phase 02 shipped via PR #5 (https://github.com/SugarWork7788/lex-web/pull/5)

Progress: █████░░░░░ 55%

## Performance Metrics

**Velocity:**

- Total plans completed: 6
- Average duration: ~12 min
- Total execution time: ~72 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 3/3 | ~29 min | ~10 min |
| 2 | 3/3 | ~43 min | ~14 min |
| 3 | 0/3 | — | — |

**Recent Trend:**

- Last 5 plans: 02-03 (~10 min, 2 auto-fix cycles: @sparticuz/chromium@148 API drift, Uint8Array→BodyInit TS variance), 02-02 (~8 min, 3 auto-fix cycles), 02-01 (~25 min, 1 deviation cycle: IMMUTABLE wrapper for GENERATED column), 01-02 (16 min, parallel with 01-01), 01-01 (10 min, parallel with 01-02)
- Trend: → (Phase 2 wave 2 was clean parallel execution: zero file overlap between 02-02 and 02-03, both committed to the same feature branch with interleaved hashes, full test suite stays green throughout)

**Plan history:**

| Phase | Plan | Duration | Tasks | Files | Completed |
|-------|------|----------|-------|-------|-----------|
| 01-reliability-observability | 00 | 3 min | 3 | 5 | 2026-05-09 |
| 01-reliability-observability | 01 | ~10 min | 3 | 4 | 2026-05-09 |
| 01-reliability-observability | 02 | ~16 min | 3 | 11 | 2026-05-09 |
| 02-new-ai-features | 01 | ~25 min | 3 + 1 deviation | 4 (db/intel_fts.sql, scripts/apply-intel-fts.ts, package.json, bun.lock) | 2026-05-10 |
| 02-new-ai-features | 02 | ~8 min | 3 + 3 auto-fix | 9 (lib/intel-search.ts, app/api/intel/quote/route.ts, app/intel/search/{best-matches,best-match-card,best-match-quote}.tsx, app/intel/search/page.tsx, 3 test files) | 2026-05-10 |
| 02-new-ai-features | 03 | ~10 min | 3 + 2 auto-fix | 6 (package.json, next.config.ts, app/api/audit/pdf/route.ts, app/audit/download-pdf-button.tsx, app/audit/page.tsx, __tests__/audit-pdf-route.test.ts) | 2026-05-10 |

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
- **2026-05-10 (02-01)**: Postgres `array_to_string(anyarray, text)` is STABLE; `GENERATED ALWAYS` columns require IMMUTABLE expressions. Wrapped via `immutable_array_to_string(text[], text) LANGUAGE sql IMMUTABLE` pure passthrough — safe because the underlying built-in is deterministic on `text[]` inputs. Used in `prosecution_cases.search_vector` generated expression. Pattern reusable for any future GENERATED column needing a STABLE built-in (e.g., `lower(text)` is already IMMUTABLE; `concat_ws` is STABLE — would need similar wrapper).
- **2026-05-10 (02-01)**: `intel_search_top(q text)` SQL function is the canonical scoring contract. Constants 0.7 / 0.3 / 365 are hardcoded in the SQL; plan 02-02 must import the same constants in TS for any client-side recomputation/test.
- **2026-05-10 (02-02)**: `lib/intel-search.ts` mirrors the SQL constants (`LEX_WEIGHT=0.7`, `RECENCY_WEIGHT=0.3`, `RECENCY_HALF_LIFE_DAYS=365`) for unit testing — keep both in sync if the SQL is retuned. The helper falls back to `[]` on RPC error/throw with `console.warn` so the page still renders the per-source breakdown if `intel_search_top` is missing on a staging DB.
- **2026-05-10 (02-02)**: Anthropic SDK in test environments is mocked via `vi.mock("@anthropic-ai/sdk", ...)` returning a synthetic class with a stream handle that fires `text` deltas + `finalMessage()`. Lets routes assert on model identity, signal forwarding, and system-prompt content without live API access. Pattern reusable for future Anthropic-backed routes.
- **2026-05-10 (02-02)**: `@testing-library/jest-dom` matchers (`toBeInTheDocument`) are NOT available in this vitest project (no setup file registered). Component tests use plain Vitest assertions (`toBeTruthy`, `not.toBeNull`, className regex matches). Avoids touching `vitest.config.ts`. If future plans want jest-dom matchers, add `setupFiles: ["@testing-library/jest-dom/vitest"]` and re-enable.
- **2026-05-10 (02-03)**: `@sparticuz/chromium@148` removed `defaultViewport` and `headless` static getters from the class (only `args`, `setGraphicsMode`, `executablePath` remain). Canonical v148 launch shape per upstream README is literal viewport + `headless: "shell"` literal + `puppeteer.defaultArgs({args: chromium.args, headless: "shell"})` for arg composition. RESEARCH Pattern 4 referred to an older v141ish API. Future puppeteer-using routes must follow the v148 shape; plan-time research should always check `node_modules/@sparticuz/chromium/build/esm/index.d.ts` directly.
- **2026-05-10 (02-03)**: `page.pdf()` returns `Uint8Array<ArrayBufferLike>`; DOM `BodyInit` requires an `ArrayBuffer`-backed Uint8Array under TypeScript strict (variance issue, not a real shape bug). Wrap puppeteer binary outputs in `Buffer.from(pdf)` before constructing a Response — Node Buffer extends `Uint8Array<ArrayBuffer>` and is V8 zero-copy share. Pattern reusable for any future binary-Response route that consumes puppeteer / sharp / similar Uint8Array<ArrayBufferLike> producers.
- **2026-05-10 (02-03)**: Next 16 `outputFileTracingIncludes` is the TOP-LEVEL config key (NOT under `experimental.*` — that was the Next 14 placement; promoted to stable since v15). Verified against `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md` line 90 per AGENTS.md "this is NOT the Next.js you know" mandate. Future plans that pin native binaries (sharp, ffmpeg, etc.) into the Vercel function bundle must use the same top-level shape, not `experimental`.
- **2026-05-10 (02-03)**: NFT trace at `.next/server/app/api/audit/pdf/route.js.nft.json` contained 588 files including all 4 chromium brotli archives (al2023.tar.br, chromium.br, fonts.tar.br, swiftshader.tar.br) under the narrow `node_modules/@sparticuz/chromium/bin/**/*` glob. No widening to `lib/**/*` was required. RESEARCH Pitfall 3 fallback (widen the glob if Vercel deploy fails with "Could not find Chromium (rev. ...)") remains pre-emptively documented in `next.config.ts` for the first deploy.

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

- **Last session:** 2026-05-10T08:39:00Z — 2026-05-10T08:50:00Z (~10 min wall, 02-03 executed end-to-end including 2 auto-fix cycles; ran parallel with 02-02)
- **Stopped at:** Phase 2 implementation complete — 02-03 done: PDF-01 closed via `/api/audit/pdf` route (puppeteer-core + @sparticuz/chromium) + `<DownloadPdfButton />` mounted on `/audit` stats row + Next 16 `outputFileTracingIncludes` pinning the chromium binary into the function bundle. NFT trace contains all 4 chromium brotli archives. 42/42 tests green; build green. Wave 2 parallel safety preserved (zero file overlap with 02-02; commits `8c9ea93/546216e/9fd586a` interleaved with 02-02's `dcc4f98/604db85/3ceadda`).
- **Resume file:** None — Phase 2 implementation done. Next: `/gsd-verify-phase 2`.

---
*State initialized: 2026-05-04*
*Last plan complete: 2026-05-10 -- 02-03 (audit PDF download via puppeteer + chromium; PDF-01 closed; Phase 2 implementation complete)*
