// File: __tests__/audit-vote-route.test.ts
//
// Covers POST /api/audit/vote behaviors from 06.1-01 PLAN Task 3 <behavior>:
//  - 401 auth_required for anonymous caller (D-04)
//  - 200 happy-path INSERT with {user_id, ip_hash}, NO fingerprint (D-03)
//  - 200 already_voted on second vote by same user_id (D-03 uniqueness)
//  - 429 rate_limited at 50/24h cap (D-03 ip_hash rate-limit preserved)
//  - 400 missing_fields when finding_id absent
//  - 400 bad_json on malformed body
//  - Uniqueness check uses countExistingVoteByUser, not legacy .or() on ip/fp
//
// Phase 6.1 deviation: per PLAN Task 3a, we mock at the lib/audit-votes-queries
// seam rather than at the Supabase fluent-builder level. The fluent-builder
// mock in PLAN.md L456-495 was flagged fragile by the plan-checker and the
// PLAN explicitly permits this extraction.

import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  getUserMock,
  createRouteHandlerSupabaseMock,
  countRecentVotesByIpMock,
  countExistingVoteByUserMock,
  insertVoteMock,
  incrementAuditVoteRpcMock,
} = vi.hoisted(() => {
  const getUserMock = vi.fn();
  const createRouteHandlerSupabaseMock = vi.fn(async () => ({
    auth: { getUser: getUserMock },
  }));
  const countRecentVotesByIpMock = vi.fn();
  const countExistingVoteByUserMock = vi.fn();
  const insertVoteMock = vi.fn();
  const incrementAuditVoteRpcMock = vi.fn();
  return {
    getUserMock,
    createRouteHandlerSupabaseMock,
    countRecentVotesByIpMock,
    countExistingVoteByUserMock,
    insertVoteMock,
    incrementAuditVoteRpcMock,
  };
});

vi.mock("@/lib/supabase-auth", () => ({
  createRouteHandlerSupabase: createRouteHandlerSupabaseMock,
}));
vi.mock("@/lib/audit-votes-queries", () => ({
  countRecentVotesByIp: countRecentVotesByIpMock,
  countExistingVoteByUser: countExistingVoteByUserMock,
  insertVote: insertVoteMock,
  incrementAuditVoteRpc: incrementAuditVoteRpcMock,
}));

import { POST } from "@/app/api/audit/vote/route";

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request("https://lex-web-eta.vercel.app/api/audit/vote", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "1.2.3.4",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function wireHappyPath({
  recentCount = 0,
  existingCount = 0,
  newCount = 42,
}: { recentCount?: number; existingCount?: number; newCount?: number } = {}) {
  countRecentVotesByIpMock.mockResolvedValue(recentCount);
  countExistingVoteByUserMock.mockResolvedValue(existingCount);
  insertVoteMock.mockResolvedValue({ error: null });
  incrementAuditVoteRpcMock.mockResolvedValue({ data: newCount, error: null });
}

describe("/api/audit/vote POST", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    createRouteHandlerSupabaseMock.mockClear();
    countRecentVotesByIpMock.mockReset();
    countExistingVoteByUserMock.mockReset();
    insertVoteMock.mockReset();
    incrementAuditVoteRpcMock.mockReset();
  });

  it("returns 401 auth_required for anonymous caller (D-04)", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({ finding_id: "f-1" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, reason: "auth_required" });
    expect(countRecentVotesByIpMock).not.toHaveBeenCalled();
    expect(countExistingVoteByUserMock).not.toHaveBeenCalled();
    expect(insertVoteMock).not.toHaveBeenCalled();
    expect(incrementAuditVoteRpcMock).not.toHaveBeenCalled();
  });

  it("inserts a vote with user_id + ip_hash, NO fingerprint, for an authed user", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    wireHappyPath();
    const res = await POST(makeRequest({ finding_id: "f-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.new_count).toBe(42);

    expect(insertVoteMock).toHaveBeenCalledTimes(1);
    const insertedRow = insertVoteMock.mock.calls[0][0];
    expect(insertedRow).toMatchObject({ finding_id: "f-1", user_id: "user-1" });
    expect(insertedRow.ip_hash).toEqual(expect.any(String));
    expect(insertedRow).not.toHaveProperty("fingerprint_hash");
    expect(insertedRow).not.toHaveProperty("fingerprint");
  });

  it("uniqueness check is keyed on (finding_id, user_id), not ip/fingerprint (D-03)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    wireHappyPath();
    await POST(makeRequest({ finding_id: "f-1" }));
    expect(countExistingVoteByUserMock).toHaveBeenCalledTimes(1);
    expect(countExistingVoteByUserMock).toHaveBeenCalledWith("f-1", "user-1");
  });

  it("rejects double-vote by same user_id with already_voted (D-03 uniqueness)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    wireHappyPath({ existingCount: 1 });
    const res = await POST(makeRequest({ finding_id: "f-1" }));
    const body = await res.json();
    expect(body).toEqual({ success: false, reason: "already_voted" });
    expect(insertVoteMock).not.toHaveBeenCalled();
    expect(incrementAuditVoteRpcMock).not.toHaveBeenCalled();
  });

  it("returns 429 rate_limited when IP has 50+ votes in 24h", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    wireHappyPath({ recentCount: 50 });
    const res = await POST(makeRequest({ finding_id: "f-1" }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({ success: false, reason: "rate_limited" });
    expect(countExistingVoteByUserMock).not.toHaveBeenCalled();
    expect(insertVoteMock).not.toHaveBeenCalled();
  });

  it("returns 400 missing_fields when finding_id absent", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ success: false, reason: "missing_fields" });
  });

  it("returns 400 bad_json on malformed body", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await POST(makeRequest("{not-json"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ success: false, reason: "bad_json" });
  });

  it("treats 23505 unique-violation from INSERT as already_voted (race-loser)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    countRecentVotesByIpMock.mockResolvedValue(0);
    countExistingVoteByUserMock.mockResolvedValue(0);
    insertVoteMock.mockResolvedValue({ error: { code: "23505", message: "unique" } });
    const res = await POST(makeRequest({ finding_id: "f-1" }));
    const body = await res.json();
    expect(body).toEqual({ success: false, reason: "already_voted" });
    expect(incrementAuditVoteRpcMock).not.toHaveBeenCalled();
  });
});
