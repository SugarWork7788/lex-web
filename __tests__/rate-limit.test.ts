import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

const SALT = "test-salt-for-rate-limit-test";
const TEST_IP = "203.0.113.42";

function expectedIpHash(ip: string): string {
  return createHmac("sha256", SALT).update(ip).digest("hex").slice(0, 16);
}

function makeReq(ip: string): Request {
  // Build a Request whose getClientIp(req) will return the given IP.
  return new Request("http://test.local/", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

describe("lib/rate-limit throttle log emission (D-08/09/10/11)", () => {
  let logs: string[] = [];

  beforeEach(() => {
    vi.resetModules();
    process.env.AUDIT_VOTE_SALT = SALT;
    logs = [];
    vi.spyOn(console, "log").mockImplementation((msg: unknown) => {
      if (typeof msg === "string") logs.push(msg);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits a single JSON throttle line on over-cap with the canonical 5-key shape", async () => {
    const { rateLimited } = await import("@/lib/rate-limit");
    const opts = { windowMs: 60_000, max: 3 };
    // Fill the slot to cap (no log expected — under-cap branch).
    for (let i = 0; i < 3; i++) {
      const r = rateLimited(makeReq(TEST_IP), "test-route", opts);
      expect(r).toBeNull();
    }
    expect(logs.length).toBe(0);
    // 4th call → over cap → emit log + return 429.
    const blocked = rateLimited(makeReq(TEST_IP), "test-route", opts);
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
    expect(logs.length).toBe(1);
    const parsed = JSON.parse(logs[0]);
    expect(parsed.event).toBe("rate_limit_throttled");
    expect(parsed.route).toBe("test-route");
    expect(parsed.ip_hash).toBe(expectedIpHash(TEST_IP));
    expect(parsed.ip_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(typeof parsed.retry_after).toBe("number");
    expect(parsed.retry_after).toBeGreaterThanOrEqual(1);
    expect(typeof parsed.ts).toBe("string");
    expect(() => new Date(parsed.ts)).not.toThrow();
    // Strict 5 keys (RESEARCH Pitfall 4 — log line size budget).
    expect(Object.keys(parsed).sort()).toEqual([
      "event", "ip_hash", "retry_after", "route", "ts",
    ]);
  });

  it("does NOT log on under-cap requests (D-11 applies to throttled events only)", async () => {
    const { rateLimited } = await import("@/lib/rate-limit");
    const opts = { windowMs: 60_000, max: 5 };
    for (let i = 0; i < 5; i++) {
      rateLimited(makeReq(TEST_IP), "underlimit", opts);
    }
    expect(logs.length).toBe(0);
  });

  it("uses HMAC (not plain SHA-256) — different salt produces different hash", async () => {
    // Re-import with same salt → same hash. Different salt module-load
    // (vi.resetModules + reset env) → different hash. This is the
    // structural property of HMAC vs plain hash that D-10 chose for.
    const { rateLimited } = await import("@/lib/rate-limit");
    const opts = { windowMs: 60_000, max: 1 };
    rateLimited(makeReq(TEST_IP), "k", opts);
    rateLimited(makeReq(TEST_IP), "k", opts); // triggers log
    const firstParsed = JSON.parse(logs[0]);

    vi.resetModules();
    process.env.AUDIT_VOTE_SALT = "different-salt-value";
    logs = [];
    const mod2 = await import("@/lib/rate-limit");
    mod2.rateLimited(makeReq(TEST_IP), "k", opts);
    mod2.rateLimited(makeReq(TEST_IP), "k", opts); // triggers log
    const secondParsed = JSON.parse(logs[0]);

    expect(firstParsed.ip_hash).not.toBe(secondParsed.ip_hash);
  });

  it("throws at module load if AUDIT_VOTE_SALT is missing (matches SEC-06)", async () => {
    vi.resetModules();
    delete process.env.AUDIT_VOTE_SALT;
    await expect(import("@/lib/rate-limit")).rejects.toThrow(/AUDIT_VOTE_SALT/);
  });
});
