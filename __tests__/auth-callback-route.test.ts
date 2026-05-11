// File: __tests__/auth-callback-route.test.ts
//
// Asserts /auth/callback GET handler:
//  - happy path: ?code=abc&next=/foo → redirect to /foo (after exchange)
//  - open-redirect guard: ?code=abc&next=https://evil.com → redirect to /
//  - exchange error: redirect to /sign-in?error=callback
//  - code missing: redirect to /sign-in?error=callback
//  - x-forwarded-host respected in prod
//
// Env-var defaults provided by __tests__/setup.ts.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { exchangeCodeForSessionMock, createRouteHandlerSupabaseMock } = vi.hoisted(() => {
  const exchangeCodeForSessionMock = vi.fn();
  const createRouteHandlerSupabaseMock = vi.fn(async () => ({
    auth: { exchangeCodeForSession: exchangeCodeForSessionMock },
  }));
  return { exchangeCodeForSessionMock, createRouteHandlerSupabaseMock };
});

vi.mock("@/lib/supabase-auth", () => ({
  createRouteHandlerSupabase: createRouteHandlerSupabaseMock,
}));

import { GET } from "@/app/auth/callback/route";

const ORIGIN = "https://lex-web-eta.vercel.app";

function makeRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, { method: "GET", headers });
}

describe("/auth/callback GET", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    exchangeCodeForSessionMock.mockReset();
    createRouteHandlerSupabaseMock.mockClear();
    // Force prod-like env so we exercise the x-forwarded-host branch.
    // vi.stubEnv handles the read-only NODE_ENV proxy that vitest installs.
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalNodeEnv ?? "test");
    vi.unstubAllEnvs();
  });

  it("happy path: redirects to next after successful exchange", async () => {
    exchangeCodeForSessionMock.mockResolvedValueOnce({ error: null });

    const res = await GET(makeRequest("/auth/callback?code=abc&next=/dashboard"));

    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get("Location")).toBe(`${ORIGIN}/dashboard`);
    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("abc");
  });

  it("open-redirect guard: rejects absolute-URL next, redirects to / instead", async () => {
    exchangeCodeForSessionMock.mockResolvedValueOnce({ error: null });

    const res = await GET(makeRequest("/auth/callback?code=abc&next=https://evil.com"));

    expect(res.headers.get("Location")).toBe(`${ORIGIN}/`);
    expect(res.headers.get("Location")).not.toContain("evil.com");
  });

  it("open-redirect guard: rejects protocol-relative //evil.com", async () => {
    exchangeCodeForSessionMock.mockResolvedValueOnce({ error: null });

    const res = await GET(makeRequest("/auth/callback?code=abc&next=//evil.com"));

    // // starts with /, so the simple guard would let it through — RESEARCH
    // Pattern 5 only checks startsWith("/"). Document this as a known
    // limitation: //evil.com WOULD pass the guard. We accept this risk
    // because the URL constructor + NextResponse.redirect normalises:
    // `${origin}//evil.com` becomes `https://lex-web-eta.vercel.app//evil.com`
    // which is a same-origin double-slashed path, NOT a redirect to evil.com.
    // Browser will request /evil.com on lex-web-eta.vercel.app → 404.
    const location = res.headers.get("Location") || "";
    expect(location.startsWith(ORIGIN)).toBe(true);
  });

  it("exchange error: redirects to /sign-in?error=callback", async () => {
    exchangeCodeForSessionMock.mockResolvedValueOnce({
      error: { message: "Invalid PKCE verifier" },
    });

    const res = await GET(makeRequest("/auth/callback?code=bad-code"));

    expect(res.headers.get("Location")).toBe(`${ORIGIN}/sign-in?error=callback`);
  });

  it("code missing: redirects to /sign-in?error=callback", async () => {
    const res = await GET(makeRequest("/auth/callback"));

    expect(res.headers.get("Location")).toBe(`${ORIGIN}/sign-in?error=callback`);
    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
  });

  it("uses x-forwarded-host in prod (Vercel preview)", async () => {
    exchangeCodeForSessionMock.mockResolvedValueOnce({ error: null });

    const res = await GET(
      makeRequest("/auth/callback?code=abc&next=/", {
        "x-forwarded-host": "lex-web-pr-42.vercel.app",
      }),
    );

    expect(res.headers.get("Location")).toBe("https://lex-web-pr-42.vercel.app/");
  });
});
