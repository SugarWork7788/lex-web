import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SALT = process.env.AUDIT_VOTE_SALT || "lex-brain-audit-2026";

function sha(s: string): string {
  return createHash("sha256").update(s + SALT).digest("hex");
}

function getServiceClient() {
  // The vote needs to bypass RLS to write to audit_votes / increment vote_count.
  // Use service role if available; fall back to anon (will fail loudly if RLS rejects).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  let body: { finding_id?: string; fingerprint?: string };
  try { body = await req.json(); }
  catch { return Response.json({ success: false, reason: "bad_json" }, { status: 400 }); }

  const findingId = body.finding_id;
  const fp = (body.fingerprint || "").trim();
  if (!findingId || !fp) {
    return Response.json({ success: false, reason: "missing_fields" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const ipHash = sha(ip);
  const fpHash = sha(fp);

  const sb = getServiceClient();

  // 24h global rate limit per IP
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const recent = await sb.from("audit_votes")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash).gte("voted_at", since);
  if ((recent.count ?? 0) >= 50) {
    return Response.json({ success: false, reason: "rate_limited" }, { status: 429 });
  }

  // Already voted on this finding?
  const existing = await sb.from("audit_votes")
    .select("id", { head: true, count: "exact" })
    .eq("finding_id", findingId)
    .or(`ip_hash.eq.${ipHash},fingerprint_hash.eq.${fpHash}`);
  if ((existing.count ?? 0) > 0) {
    return Response.json({ success: false, reason: "already_voted" });
  }

  const ins = await sb.from("audit_votes").insert({
    finding_id: findingId, ip_hash: ipHash, fingerprint_hash: fpHash,
  });
  if (ins.error) {
    if (ins.error.code === "23505") {
      return Response.json({ success: false, reason: "already_voted" });
    }
    return Response.json({ success: false, reason: ins.error.message }, { status: 500 });
  }

  // Atomic increment via Postgres RPC. The fallback read-then-write was a
  // TOCTOU race that lost concurrent votes; the RPC now exists in DB and
  // returns the new vote_count directly.
  const { data: newCount, error: rpcErr } = await sb.rpc(
    "increment_audit_vote",
    { fid: findingId },
  );
  if (rpcErr) {
    console.error(`[vote] increment_audit_vote rpc failed: ${rpcErr.message}`);
    return Response.json(
      { success: false, reason: "vote_count_update_failed" },
      { status: 500 },
    );
  }
  return Response.json({ success: true, new_count: Number(newCount) || 0 });
}
