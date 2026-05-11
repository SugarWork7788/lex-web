// File: __tests__/sign-out-route.test.ts
//
// Asserts POST /api/auth/sign-out:
//  - calls supabase.auth.signOut()
//  - returns 303 redirect to /
//  - returns the 429 from rateLimited if the limit is hit (signOut NOT called)
//
// Env-var defaults provided by __tests__/setup.ts.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { signOutMock, createRouteHandlerSupabaseMock, rateLimitedMock } = vi.hoisted(() => {
  const signOutMock = vi.fn();
  const createRouteHandlerSupabaseMock = vi.fn(async () => ({
    auth: { signOut: signOutMock },
  }));
  const rateLimitedMock = vi.fn();
  return { signOutMock, createRouteHandlerSupabaseMock, rateLimitedMock };
});

vi.mock("@/lib/supabase-auth", () => ({
  createRouteHandlerSupabase: createRouteHandlerSupabaseMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimited: rateLimitedMock,
}));

import { POST } from "@/app/api/auth/sign-out/route";

function makeRequest(): Request {
  return new Request("https://lex-web-eta.vercel.app/api/auth/sign-out", {
    method: "POST",
  });
}

describe("/api/auth/sign-out POST", () => {
  beforeEach(() => {
    signOutMock.mockReset();
    createRouteHandlerSupabaseMock.mockClear();
    rateLimitedMock.mockReset();
    rateLimitedMock.mockReturnValue(null); // default: under the limit
    signOutMock.mockResolvedValue({ error: null });
  });

  it("calls supabase.auth.signOut and returns 303 redirect to /", async () => {
    const res = await POST(makeRequest());

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toMatch(/\/$/);
  });

  it("uses rateLimited helper with key 'auth-signout' and 20/min/IP", async () => {
    await POST(makeRequest());

    expect(rateLimitedMock).toHaveBeenCalledTimes(1);
    expect(rateLimitedMock).toHaveBeenCalledWith(
      expect.any(Request),
      "auth-signout",
      { windowMs: 60_000, max: 20 },
    );
  });

  it("returns 429 from rateLimited without calling signOut when limit hit", async () => {
    const tooManyResponse = new Response(JSON.stringify({ error: "too many" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "3" },
    });
    rateLimitedMock.mockReturnValueOnce(tooManyResponse);

    const res = await POST(makeRequest());

    expect(res.status).toBe(429);
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
