import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { createRouteHandlerSupabase } from "@/lib/supabase-auth";
import {
  countRecentVotesByIp,
  countExistingVoteByUser,
  insertVote,
  incrementAuditVoteRpc,
} from "@/lib/audit-votes-queries";

export const runtime = "nodejs";

const SALT = process.env.AUDIT_VOTE_SALT || "lex-brain-audit-2026";

function sha(s: string): string {
  return createHash("sha256").update(s + SALT).digest("hex");
}

export async function POST(req: NextRequest) {
  // D-04: auth gate. Anonymous callers get 401 — they should never reach this
  // path normally because <VoteButtonServer> renders the disabled variant for
  // anons, but the API enforces the contract directly as belt-and-suspenders.
  const auth = await createRouteHandlerSupabase();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return Response.json({ success: false, reason: "auth_required" }, { status: 401 });
  }

  let body: { finding_id?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ success: false, reason: "bad_json" }, { status: 400 });
  }

  const findingId = body.finding_id;
  if (!findingId) {
    return Response.json({ success: false, reason: "missing_fields" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const ipHash = sha(ip);

  // 24h global rate limit per IP (D-03 — ip_hash stays as rate-limit key).
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const recentCount = await countRecentVotesByIp(ipHash, since);
  if (recentCount >= 50) {
    return Response.json({ success: false, reason: "rate_limited" }, { status: 429 });
  }

  // D-03: per-user-per-finding uniqueness. user_id is the only identity that
  // matters; legacy ip_hash / fingerprint_hash uniqueness is gone.
  const existingCount = await countExistingVoteByUser(findingId, user.id);
  if (existingCount > 0) {
    return Response.json({ success: false, reason: "already_voted" });
  }

  // INSERT: only finding_id + ip_hash + user_id. fingerprint_hash is
  // deliberately omitted (column is nullable per the D-03 migration).
  const ins = await insertVote({
    finding_id: findingId,
    ip_hash: ipHash,
    user_id: user.id,
  });
  if (ins.error) {
    if (ins.error.code === "23505") {
      // Partial unique index race-loser — treat as already_voted.
      return Response.json({ success: false, reason: "already_voted" });
    }
    return Response.json(
      { success: false, reason: ins.error.message ?? "insert_failed" },
      { status: 500 },
    );
  }

  // Atomic RPC increment (unchanged — keeps findings.vote_count consistent).
  const { data: newCount, error: rpcErr } = await incrementAuditVoteRpc(findingId);
  if (rpcErr) {
    console.error(`[vote] increment_audit_vote rpc failed: ${rpcErr.message}`);
    return Response.json(
      { success: false, reason: "vote_count_update_failed" },
      { status: 500 },
    );
  }
  return Response.json({ success: true, new_count: Number(newCount) || 0 });
}
