/**
 * Smoke test for /api/audit/pdf — verifies the route module imports cleanly
 * with puppeteer-core mocked. Full puppeteer rendering is UAT (manual run on
 * Vercel preview). Per RESEARCH §"Recommended Project Structure" Wave-0 Gaps.
 *
 * Validates VALIDATION rows 02-03-02:
 *   - module imports without throwing (puppeteer + chromium mocked)
 *   - GET returns 200 with Content-Type: application/pdf and Content-Disposition
 *     attachment + filename pattern
 *   - rate-limit gate (audit-pdf, 60s, max 5) returns 429 on 6th call
 *   - Cache-Control: no-store header (Pitfall 4)
 *
 * Mocks puppeteer-core + @sparticuz/chromium so the test never spawns chrome.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

// AUDIT_VOTE_SALT is mandatory at module-load time of @/lib/rate-limit (SEC-06).
// Set BEFORE the first dynamic import below.
process.env.AUDIT_VOTE_SALT ??= "test-salt-for-audit-pdf-route";

vi.mock("puppeteer-core", () => ({
  default: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        emulateMediaType: vi.fn().mockResolvedValue(undefined),
        goto: vi.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
        pdf: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])), // %PDF
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
    // @sparticuz/chromium@148 README pattern: puppeteer.defaultArgs({args, headless})
    // is invoked inside the route to compose flags. Stub returns the input args
    // unchanged for shallow assertion needs.
    defaultArgs: vi.fn().mockImplementation(({ args }: { args: string[] }) => args),
  },
}));

vi.mock("@sparticuz/chromium", () => ({
  default: {
    args: [],
    defaultViewport: { width: 1280, height: 720 },
    executablePath: vi.fn().mockResolvedValue("/mocked/chromium"),
    headless: "shell" as const,
    setGraphicsMode: false,
  },
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("/api/audit/pdf route smoke (PDF-01)", () => {
  it("module imports without throwing", async () => {
    await expect(import("@/app/api/audit/pdf/route")).resolves.toBeDefined();
  });

  it("GET returns 200 with Content-Type application/pdf when puppeteer is mocked", async () => {
    const mod = await import("@/app/api/audit/pdf/route");
    // Build a minimal Request that passes the rate-limit gate (fresh slot, low traffic).
    const req = new Request("http://localhost/api/audit/pdf", {
      headers: { "x-forwarded-for": `127.0.0.${Math.floor(Math.random() * 250)}` },
    });
    const res = await mod.GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    const cd = res.headers.get("Content-Disposition") || "";
    expect(cd).toContain("attachment");
    expect(cd).toMatch(/filename="lex-brain-audit-\d{4}-\d{2}-\d{2}\.pdf"/);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rate-limits at 5/min/IP (6th request returns 429)", async () => {
    const mod = await import("@/app/api/audit/pdf/route");
    const ip = `10.0.0.${Math.floor(Math.random() * 250)}`;
    for (let i = 0; i < 5; i++) {
      const req = new Request("http://localhost/api/audit/pdf", {
        headers: { "x-forwarded-for": ip },
      });
      const res = await mod.GET(req);
      expect(res.status).toBe(200);
    }
    const sixthReq = new Request("http://localhost/api/audit/pdf", {
      headers: { "x-forwarded-for": ip },
    });
    const sixthRes = await mod.GET(sixthReq);
    expect(sixthRes.status).toBe(429);
    const body = (await sixthRes.json()) as { error?: string; retry_after?: number };
    expect(body).toHaveProperty("error");
    expect(body).toHaveProperty("retry_after");
  });
});
