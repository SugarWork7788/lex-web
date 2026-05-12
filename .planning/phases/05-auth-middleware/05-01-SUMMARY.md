---
phase: 05
plan: 01
status: complete
requirements: [AUTH-05, AUTH-06, AUTH-07]
wave: 1
completed_at: 2026-05-12T09:49:15Z
---

# Plan 05-01 Summary — Auth proxy + requireAuth() helper

## Workflow note

This phase was executed in **autonomous-overnight mode** (user explicitly waived the discuss → plan → execute checkpoints for the run). No `05-CONTEXT.md`, `05-RESEARCH.md`, or `05-PLAN.md` was produced; this summary is the single artifact and was written retroactively. The PR description (#12) carries the equivalent of the discussion/plan output. Future phases revert to the standard workflow unless the user explicitly re-authorizes the shortcut.

## Outcome

AUTH-05..07 satisfied. Anonymous requests to `/intel/*` and `/profile/*` are redirected to `/sign-in?returnTo=<original-path-with-search>` via a Next.js 16 `proxy.ts` (the renamed-in-Next-16 successor to `middleware.ts`). Real session validation continues to happen at the Server-Component / Route-Handler level via the existing `getSession()` helper, called through the new `lib/require-auth.ts` wrapper which catches stale / expired / spoofed cookies the proxy intentionally can't see.

Verified live on production (`https://lex-web-eta.vercel.app`):
- `/intel/sanctions` → 307 → `/sign-in?returnTo=%2Fintel%2Fsanctions`
- `/intel/offshore?q=foo` → 307 → `/sign-in?returnTo=%2Fintel%2Foffshore%3Fq%3Dfoo` (query preserved)
- `/profile` → 307 → `/sign-in?returnTo=%2Fprofile`
- `/laws`, `/` → 200 (public routes unaffected — not in proxy matcher)

## Files delivered

| File | Purpose | Commit |
|------|---------|--------|
| `proxy.ts` | Cookie-presence optimistic redirect for `/intel/:path*` and `/profile/:path*`. Probes for any `sb-*-auth-token` cookie so the gate is env-agnostic across Supabase project switches. | `fd4a66a` |
| `lib/require-auth.ts` | Server helper: calls `getSession()`, returns User or redirects to `/sign-in?returnTo=<path>`. URL-encodes the path. | `fd4a66a` |
| `app/profile/page.tsx` | Switched inline `redirect()` for `requireAuth()` for consistency. | `fd4a66a` |
| `__tests__/proxy.test.ts` | 7 cases: anon redirect, query-param preservation, `/profile` redirect, valid-cookie passthrough, empty-cookie ignored, non-sb cookie ignored, matcher shape. | `fd4a66a` |
| `__tests__/require-auth.test.ts` | 3 cases: returns user, redirects on null session, URL-encodes query strings. | `fd4a66a` |

PR #12 — squash-merged as `11f74705` on 2026-05-12T09:49:15Z.

## Scope decisions (made autonomously per the user's brief)

1. **`/intel/*` uses ISR** (`revalidate=600`). Adding `requireAuth()` to each page would force them dynamic and break caching. Per Next 16 §"Optimistic checks with Proxy", static routes that share non-user-specific data across visitors are gated via proxy alone — no page-level check.
2. **`/audit` voting gating deferred to Phase 6** per ROADMAP. That needs a `<VoteButton>` anonymous variant + `/api/audit/vote` session check, not a proxy matcher entry — out of scope for the middleware infra.
3. **Phase 5 did NOT produce a `<ProtectedRoute>` boundary component** (the ROADMAP's 05-02 line). The current architecture has no client-tree-only protected sub-areas; if/when one appears, add the boundary in that PR.
4. **Phase 5 did NOT update PROJECT.md's "Key Decisions"** (the ROADMAP's 05-03 line). The protected-route convention is documented inline in `proxy.ts` + `lib/require-auth.ts` headers; promote to PROJECT.md when the convention is referenced from a third file.

## Verification

- **Unit tests:** 127/127 pass (10 new — 7 proxy + 3 require-auth).
- **Build:** clean. Build log shows `ƒ Proxy (Middleware)` confirming Next 16 picked up the file under its renamed identity.
- **Live smoke:** 5 curl probes against `lex-web-eta.vercel.app` post-deploy (see Outcome above).

## Pitfalls captured for future sessions

- **Next 16 renamed `middleware.ts` → `proxy.ts`.** Functionally identical, but the filename matters and the framework explicitly labels it differently in build output. Saved to `~/.claude/projects/-Users-beyond-Desktop-lex-web/memory/next16_breaking_changes.md`.
- **Next 16 docs warn: "Proxy is _not_ intended for slow data fetching... it should not be used as a full session management or authorization solution."** Hence the split: proxy = optimistic cookie probe; `requireAuth()` = real validation at page level.
- **`@supabase/ssr` cookie name format**: `sb-<project-ref>-auth-token`, sometimes split into `.0`/`.1` chunks for large JWTs. Don't hardcode the project ref in the proxy probe — use a `startsWith("sb-") && includes("-auth-token")` check so the gate survives Supabase project switches (staging / preview / prod).
