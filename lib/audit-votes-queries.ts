// File: lib/audit-votes-queries.ts
//
// Thin query layer over the audit_votes table + increment_audit_vote RPC.
// Exists to give the /api/audit/vote route a clean seam for unit testing —
// the Supabase fluent builder (.from().select().eq().eq().gte()) is awkward
// to mock directly (the chain depends on call ordering). By splitting these
// 4 operations into named functions, __tests__/audit-vote-route.test.ts
// can mock this module instead of the supabase-js client.
//
// Phase 6.1 deviation: this extraction is explicitly permitted by 06.1-01
// PLAN Task 3a (CONTEXT D-03 fluent-builder fragility callout).
// See SUMMARY.md "Deviations from Plan" for the rationale.

import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  // Service role to bypass RLS for the audit_votes write + increment_audit_vote
  // RPC. Auth identity is verified upstream via createRouteHandlerSupabase().
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

/**
 * Count votes from this IP within the last 24h. Used for the
 * 50-votes-per-IP-per-24h rate-limit (D-03 — ip_hash stays as rate-limit key).
 */
export async function countRecentVotesByIp(
  ipHash: string,
  sinceIso: string,
): Promise<number> {
  const sb = getServiceClient();
  const res = await sb
    .from("audit_votes")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("voted_at", sinceIso);
  return res.count ?? 0;
}

/**
 * Count existing votes by this user on this finding. Returns 0/1.
 * D-03: uniqueness is keyed on (finding_id, user_id) — NOT on ip_hash or
 * fingerprint_hash.
 */
export async function countExistingVoteByUser(
  findingId: string,
  userId: string,
): Promise<number> {
  const sb = getServiceClient();
  const res = await sb
    .from("audit_votes")
    .select("id", { count: "exact", head: true })
    .eq("finding_id", findingId)
    .eq("user_id", userId);
  return res.count ?? 0;
}

/**
 * Insert a new vote row. fingerprint_hash is deliberately omitted (column
 * is nullable per D-03 migration step 4; client no longer computes it).
 * Returns { error: { code, message } | null } so the caller can branch on
 * 23505 (unique violation → already_voted race-loser).
 */
export async function insertVote(payload: {
  finding_id: string;
  ip_hash: string;
  user_id: string;
}): Promise<{ error: { code?: string; message?: string } | null }> {
  const sb = getServiceClient();
  const res = await sb.from("audit_votes").insert(payload);
  return { error: res.error ?? null };
}

/**
 * Atomic increment via the increment_audit_vote Postgres RPC. Returns the
 * new vote_count or throws via the rpcErr branch upstream.
 */
export async function incrementAuditVoteRpc(findingId: string): Promise<{
  data: number | null;
  error: { message?: string } | null;
}> {
  const sb = getServiceClient();
  const { data, error } = await sb.rpc("increment_audit_vote", { fid: findingId });
  return { data: data == null ? null : Number(data), error: error ?? null };
}
