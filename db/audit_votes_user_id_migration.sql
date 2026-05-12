-- Phase 6.1 — Voting gate: attribute votes to auth.users.id and remove legacy
-- ip/fingerprint uniqueness constraints. Per CONTEXT D-01..D-04.
-- Idempotent — safe to re-run. Additive only (no UPDATE, no DELETE).
--
-- Historical anonymous votes (user_id IS NULL) are preserved (D-02) and the
-- partial unique index below intentionally excludes them.

-- D-02 + D-03 step 1: add nullable user_id linked to auth.users with
-- ON DELETE SET NULL so user-account deletion preserves the historical vote
-- (counts stay), just orphans it from the user identity.
ALTER TABLE audit_votes
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- D-03 step 2: drop the legacy UNIQUE(finding_id, ip_hash) constraint —
-- otherwise two signed-in users on a shared household IP cannot both vote on
-- the same finding (rejected option C in D-03).
ALTER TABLE audit_votes
  DROP CONSTRAINT IF EXISTS audit_votes_finding_id_ip_hash_key;

-- D-03 step 3: drop the legacy UNIQUE(finding_id, fingerprint_hash) constraint —
-- otherwise the new insert path (which writes fingerprint_hash IS NULL) is
-- blocked by the unique constraint treating NULL collisions inconsistently
-- across Postgres versions, and we can't insert without a client fingerprint.
ALTER TABLE audit_votes
  DROP CONSTRAINT IF EXISTS audit_votes_finding_id_fingerprint_hash_key;

-- D-03 step 4: relax fingerprint_hash NOT NULL — the client no longer computes
-- a fingerprint (D-03 client simplification). Historical rows keep their hash;
-- new rows write NULL. Column itself is NOT dropped (D-03 forensic-only).
ALTER TABLE audit_votes
  ALTER COLUMN fingerprint_hash DROP NOT NULL;

-- D-03 step 5: new per-user-per-finding uniqueness via a PARTIAL unique index.
-- WHERE user_id IS NOT NULL leaves historical anonymous rows (user_id IS NULL,
-- D-02) entirely unconstrained — their old hash-based uniqueness is now gone
-- and that's fine because no new rows are ever inserted with user_id IS NULL
-- (route handler is auth-gated per D-04).
CREATE UNIQUE INDEX IF NOT EXISTS audit_votes_user_finding_unique
  ON audit_votes (finding_id, user_id) WHERE user_id IS NOT NULL;
