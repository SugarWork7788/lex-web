---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: milestone
status: in_progress
last_updated: "2026-05-11T00:30:00Z"
last_activity: 2026-05-11 -- Phase 08 shipped — PR #6 (lex-web). lex-brain side still needs its own PR.
progress:
  total_phases: 11
  completed_phases: 2
  total_plans: 6
  completed_plans: 6
  percent: 36
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-04)

**Core value:** Every Bulgarian citizen can read, understand, and act on the law that affects them — without paying for a lawyer to translate it.
**Current focus:** Phase 08 — dv-gazette (Държавен вестник scraper + browser); Phase 02 in flight on parallel branch (PR #5)

## Current Position

Phase: 08 (dv-gazette) — **SHIPPED** (PR #6 open, 21 commits ahead of main)
Status: PR open at https://github.com/SugarWork7788/lex-web/pull/6 — awaiting CI + review.
Pending companion: lex-brain `feat/phase-08-dv-gazette` branch (2 commits) needs its own PR before this PR can land with backfill ready.
Last activity: 2026-05-11 -- Phase 08 PR #6 opened; STATE updated to reflect ship.

Note: Phase 02 (PR #5) is still in flight on `feat/phase-02-ai-features`. Phase 08 forks off `main` and will rebase or merge in `main` once Phase 02 lands. Phase 08 will benefit from Phase 02's tsvector + recency-decay pattern + source-pill design tokens once those merge.

**Deferred (post-merge operator step, NOT a phase merge gate):** full 2-year DV backfill in lex-brain (~250 issues × ~30–50 acts ≈ 10,000 rows; resumable). Recipe documented in 08-01-SUMMARY.md.

Progress: ████░░░░░░ 36%

## Performance Metrics

**Velocity:**

- Total plans completed: 6
- Average duration: ~25 min
- Total execution time: ~150 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 3/3 | ~29 min | ~10 min |
| 2 | 0/4 | — | — |
| 3 | 0/3 | — | — |
| 8 | 3/3 | ~125 min | ~42 min |

**Recent Trend:**

- Last 5 plans: 08-03 (~30 min, parallel agent), 08-02 (~30 min, parallel agent), 08-01 (~65 min, main-context with 2 BLOCKING), 01-02 (16 min), 01-01 (10 min)
- Trend: ↑ (Phase 8 plans are larger; 08-01 spans two repos and surfaces JSF protocol bugs at runtime)

**Plan history:**

| Phase | Plan | Duration | Tasks | Files | Completed |
|-------|------|----------|-------|-------|-----------|
| 01-reliability-observability | 00 | 3 min | 3 | 5 | 2026-05-09 |
| 01-reliability-observability | 01 | ~10 min | 3 | 4 | 2026-05-09 |
| 01-reliability-observability | 02 | ~16 min | 3 | 11 | 2026-05-09 |
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

- **Last session:** 2026-05-10T22:11:00Z — 2026-05-11T00:30:00Z (~2.3 h wall; Phase 8 executed in 2 waves)
- **Stopped at:** Phase 08 complete (3/3 plans, verifier PASS-WITH-DEFERRED-BACKFILL). Wave 1 in main context with 2 BLOCKING checkpoints (live DB push + live-net scraper smoke); Wave 2 in parallel worktrees (08-02 UI + 08-03 endpoint). All gates green: 55/55 vitest, tsc clean, build registers /dv + /dv/[slug] + /api/dv/summarize. lex-brain has 16/16 pytest on dv_jsf module. Live DB has issue 2026/42 ingested (10 acts, 0 jsessionid leaks, 0 missing bodies).
- **Resume file:** None — next step is `/gsd-ship 8` (PR + cross-AI review). Post-merge: launch the 2-year DV backfill (`nohup uv run python scripts/scrape_dv.py > logs/scrapers/dv-backfill.log 2>&1 &` from lex-brain).

---
*State initialized: 2026-05-04*
*Last plan complete: 2026-05-11 -- 08-02 + 08-03 (Wave 2 parallel: lex-web /dv UI + /api/dv/summarize endpoint)*
