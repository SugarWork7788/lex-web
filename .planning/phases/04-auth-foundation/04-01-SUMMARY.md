---
phase: 04
plan: 01
status: complete
requirements: [AUTH-03]
wave: 1
completed_at: 2026-05-11T11:15:00Z
---

# Plan 04-01 Summary — DB migration (auth_schema)

## Outcome

AUTH-03 satisfied at the schema level. `user_profiles` table + RLS + hardened SECURITY DEFINER trigger landed on live Supabase (project `qnoqayvdjeexpewfrcrj`). Idempotent — second run produces no diff. The trigger's COALESCE chain (display_name → full_name → email-localpart) makes both email and Google signups land a non-null `display_name` row automatically.

## Tasks delivered

| # | Task | Commit |
|---|------|--------|
| 0 | **BLOCKING** — operator checklist (Supabase Auth providers + Google OAuth + Bulgarian email template + URL allow-list) | (no source change; user approval) |
| 1 | `db/auth_schema.sql` — table + RLS + handle_new_user trigger | `d2cc6ee` |
| 2 | `scripts/apply-auth-schema.ts` + `bun run db:auth-schema` script | `7e9a77d` |
| 3 | **BLOCKING** — apply to live Supabase (idempotent re-run green) | (no source change; live DB mutation) |

## Verification (live Supabase)

All 5 probes green on first apply, all 5 still green on idempotent re-run:

```
OK: user_profiles table exists (1/1)
OK: RLS enabled on user_profiles (1/1)
OK: user_profiles has both RLS policies (read + update) (2/2)
OK: handle_new_user is SECURITY DEFINER with search_path=public (hardened) (1/1)
OK: on_auth_user_created trigger registered on auth.users (1/1)
```

End-to-end trigger proof (from Smoke 1 in plan 04-03 Task 3): a real Google OAuth signup landed a `user_profiles` row with `display_name = "SugarWork"` (auto-derived from `raw_user_meta_data.full_name`). The COALESCE chain works as designed.

**Schema later extended** by avatar feature (commit `9eedcd7` on plan 04-03 surface): `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_id text DEFAULT 'asparuh'`. Same applier picks it up on re-run; the 6th probe (`avatar_id column exists with default 'asparuh'`) was added at the same time.

## Deviations from plan

1. **`db/auth_schema.sql` comment reword.** Plan's verbatim SQL had a comment `(no locale column)` — the literal word `locale` failed the plan's own strict grep gate `! grep -q 'locale'`. Reworded to `(single-language site, YAGNI)`. Same intent, satisfies the literal gate.
2. **Schema later mutated by Phase 4's avatar feature** (logged above) — appended ALTER + new probe. Idempotency preserved. CONTEXT D-06 ("no `locale` column") still holds — `avatar_id` is a different concern.

## Threats verified at runtime (T-04-* from plan 04-01 threat model)

- T-04-01 (RLS bypass via service role) — RLS policies use `auth.uid() = id`, which only `authenticated` role can satisfy. Service role bypasses RLS by design but lex-web app code uses anon key (`lib/supabase.ts` + `lib/supabase-auth.ts`).
- T-04-02 (SECURITY DEFINER search_path injection) — mitigated by `SET search_path = public` on `handle_new_user()`. Probe 4 enforces.
- T-04-03 (trigger missing on existing rows) — N/A; `user_profiles` table is empty at migration time. Trigger fires only on future `auth.users` inserts.

## Self-Check: PASSED

All 3 task acceptance criteria verified. Live-DB probes confirm all 5 (then 6) invariants. End-to-end trigger fire confirmed by Smoke 1.
