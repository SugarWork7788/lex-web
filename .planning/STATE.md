---
gsd_state_version: 1.0
milestone: v2.3
milestone_name: Auth & Premium hooks
status: in_progress
last_updated: "2026-05-12T11:35:00Z"
last_activity: 2026-05-12 -- Phase 6.1 (Voting gate) shipped via PR #13 → 743808f → prod dpl_5j9427ct1. Live-DB migration applied with 2 historical anonymous rows preserved. /audit reading stays public; vote button now server-decided anon/authed; /api/audit/vote returns 401 for anon. Next phase = Phase 6.2 (Favorites/Saved items) or Phase 3 (Mobile polish + CodeRabbit, still pending in v2.2).
progress:
  total_phases: 12
  completed_phases: 7
  total_plans: 15
  completed_plans: 15
  percent: 90
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-04)

**Core value:** Every Bulgarian citizen can read, understand, and act on the law that affects them — without paying for a lawyer to translate it.
**Current focus:** v2.2 ship sequence — Phase 02 + Phase 08 both merging; only Phase 03 (Mobile + CodeRabbit) left in this milestone.

## Current Position

**Milestone v2.2** — Phases 1, 2, 8, 8.1 merged; Phase 3 (Mobile polish + CodeRabbit) still pending.
**Milestone v2.3** — Phase 4 (Auth foundation) merged 2026-05-11 (PR #8 → d1d83d0); Phase 5 (Auth middleware) merged 2026-05-12 (PR #12 → 11f74705).

**Most recent shipping activity (overnight 2026-05-11 → 2026-05-12):**
  - PR #10 (5a692a0): restore Bulgarian historical-figure preset avatars
  - PR #11 (b290c8a): avatar picker image-only (drop text labels)
  - PR #12 (11f74705): Phase 5 — auth proxy + requireAuth() helper

**Active background processes (lex-brain):**
  - DV 2020–2023 backfill (PID 8362) — running since 2026-05-11T11:58 local
  - DV 2016–2019 backfill (PID 55601) — running since 2026-05-12T10:14 local
  - EUR-Lex v2 scraper (PID 62352) — restarted 2026-05-12 with jittered 60–180s empty-page retry (up to 10 attempts/page) replacing the old "exit after 3 empty pages" bug

Next phase in milestone v2.3: **Phase 6 — Page gating** (gate `/audit` voting + record `user_id` on votes; `/account` page).

Progress: █████████░ 87% (6/8 v2.2+v2.3 phases done; Phase 3 mobile-polish + Phase 6+7 pending)

## Performance Metrics

**Velocity:**

- Total plans completed: 9 (Phase 1 + Phase 2 + Phase 8)
- Average duration: ~22 min
- Total execution time: ~197 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 3/3 | ~29 min | ~10 min |
| 2 | 3/3 | ~43 min | ~14 min |
| 3 | 0/3 | — | — |
| 8 | 3/3 | ~125 min | ~42 min |

**Recent Trend:**

- Last 5 plans: 08-03 (~30 min, parallel agent), 08-02 (~30 min, parallel agent), 08-01 (~65 min, main-context with 2 BLOCKING), 02-03 (~10 min, 2 auto-fix cycles), 02-02 (~8 min, 3 auto-fix cycles)
- Trend: ↑ (Phase 8 plans larger because 08-01 spans two repos + surfaces JSF protocol bugs at runtime; Phase 2 plans tight thanks to clean parallel execution + auto-fix cycles)

**Plan history:**

| Phase | Plan | Duration | Tasks | Files | Completed |
|-------|------|----------|-------|-------|-----------|
| 01-reliability-observability | 00 | 3 min | 3 | 5 | 2026-05-09 |
| 01-reliability-observability | 01 | ~10 min | 3 | 4 | 2026-05-09 |
| 01-reliability-observability | 02 | ~16 min | 3 | 11 | 2026-05-09 |
| 02-new-ai-features | 01 | ~25 min | 3 + 1 deviation | 4 (db/intel_fts.sql, scripts/apply-intel-fts.ts, package.json, bun.lock) | 2026-05-10 |
| 02-new-ai-features | 02 | ~8 min | 3 + 3 auto-fix | 9 (lib/intel-search.ts, app/api/intel/quote/route.ts, app/intel/search/{best-matches,best-match-card,best-match-quote}.tsx, app/intel/search/page.tsx, 3 test files) | 2026-05-10 |
| 02-new-ai-features | 03 | ~10 min | 3 + 2 auto-fix | 6 (package.json, next.config.ts, app/api/audit/pdf/route.ts, app/audit/download-pdf-button.tsx, app/audit/page.tsx, __tests__/audit-pdf-route.test.ts) | 2026-05-10 |
| 08-dv-gazette | 01 | ~65 min | 5 (2 BLOCKING) | 8 (across 2 repos) | 2026-05-10 |
| 08-dv-gazette | 02 | ~30 min | 3 | 13 | 2026-05-11 |
| 08-dv-gazette | 03 | ~30 min | 2 | 2 | 2026-05-11 |

*Updated after each plan completion*

## Accumulated Context

### Decisions

- 2026-05-11 (08-01): DV act-title extraction lives in the `<td>`'s text between `</strong><br>` and the `стр. N` page-marker — NOT the `<a href="showMaterialDV.jsp">` link text (always "Преглед на материала"). Caught at runtime during smoke; first parser run produced 10 rows with `act_type="Other"`. Fix: `_extract_title_for_anchor()` walks up to the parent `<td>`, splits text on `<br>`, skips `<strong>` body + anchor text + page-marker.
- 2026-05-11 (08-01): `apply-dv-schema.ts` adds `ssl: { rejectUnauthorized: false }` to mirror Phase 2's `apply-schema.ts` working pattern (Supabase TLS chain). Without it the live connect rejects.
- 2026-05-11 (08-01): lex-brain Phase 8 branched off `chore/post-phase-02-state-update` (5 unmerged Phase 1 follow-ups) rather than `main` — needed `fetch_with_retry_stream` infra. Rebase later when post-phase-02 lands on lex-brain `main`.
- 2026-05-11 (08-03): Hard-coded model literal `"claude-sonnet-4-6"` (no env var, no constant) — required for the plan's grep-test acceptance gate. Model upgrade is a deliberate code change, not config.
- 2026-05-11 (08-02): vitest jest-dom matchers wired via `__tests__/setup.ts` + `setupFiles` in `vitest.config.ts`. Phase 1 left a gap (didn't import `@testing-library/jest-dom` globally); 08-02 fixed it. All prior 8 tests still green after the change.
- 2026-05-11 (08-02): All Bulgarian date formatters pinned to `timeZone: "Europe/Sofia"` to avoid CI/Vercel TZ shift (host TZ would render `2026-05-08` as `07.05.2026` west of UTC).
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

- **DV TOC parsing — anchor text is useless.** `<a href="showMaterialDV.jsp?idMat=N">` always renders "Преглед на материала". Real act title is the `<td>` text between `</strong><br>` and `стр. N`. The full smoke-test loop (10 acts × 2 razdel sections × ~1.5 s polite delay = ~45 s) is the only way to catch a regression here at the data-quality level.
- **DV `infer_act_type` 10-type list is incomplete.** Issue 2026/42 contained 2 acts with prefixes the regex didn't recognize: `Определение` (court ruling) + `Споразумение` (international agreement). Both fall through to `Other`. Acceptable per RESEARCH Q3 but the user-facing `/dv` filter chips will undercount these. Future expansion should add more prefixes or move to a curated dictionary.
- **lex-brain branch on `chore/post-phase-02-state-update`** — phase 8 branched off this state-update branch (not `main`) because Phase 1 follow-ups (`fetch_with_retry_stream`) are needed by the DV scraper. Rebase later when those Phase 1 follow-ups land on lex-brain `main`.
- Phase 2's PDF route must use Node runtime (Vercel Edge can't spawn puppeteer). Stay consistent with the existing streaming-route pattern: `runtime: "nodejs"` + explicit `maxDuration`.
- Phase 1's rate-limit UI message must be accessible — don't gate behind a hover-only tooltip.
- Vitest 4 dropped the `basic` reporter — the plan's smoke-test command needs the default reporter (or `default`/`verbose`/`tap`). Discovered while running 01-00 Task 3.
- `lib/rate-limit.ts` now throws at module load if `AUDIT_VOTE_SALT` is missing — local Next builds need it in `.env.local`, CI needs it in env, Vercel already has it. Future tests that import the module must set the env var before the dynamic `import()`.
- `AUDIT_VOTE_SALT` is now used in two HMAC/hash domains (audit/vote `createHash` + rate-limit `createHmac`). When audit/vote is upgraded to HMAC, add domain prefixes (`"vote:"` vs `"ratelimit:"`) for full domain separation.

### Last session

- **Last session:** 2026-05-10T22:11:00Z — 2026-05-11T00:40:00Z (~2.5 h wall; Phase 8 executed in 2 waves; Phase 2 + Phase 8 PRs merged)
- **Stopped at:** Phase 02 PR #5 squash-merged → main; Phase 08 PR #6 mid-conflict-resolution against new main; DV 2-year backfill running in lex-brain (PID 84212).
- **Resume file:** None — once PR #6 lands, only Phase 03 (Mobile + CodeRabbit) remains in milestone v2.2. Watch the backfill log; CodeRabbit auto-installs in Phase 03 itself.

---
*State initialized: 2026-05-04*
*Last plan complete: 2026-05-11 -- 08-02 + 08-03 (Wave 2 parallel: lex-web /dv UI + /api/dv/summarize endpoint)*
