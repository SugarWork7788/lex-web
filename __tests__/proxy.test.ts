// File: __tests__/proxy.test.ts
//
// Phase 5 (AUTH-05): asserts proxy.ts redirects anonymous requests to
// /sign-in?returnTo=<path> and lets through requests carrying a Supabase
// session cookie. Cookie-presence only — no network roundtrip in proxy.

import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { proxy, config } from "@/proxy";

function makeRequest(url: string, cookies: Record<string, string> = {}): NextRequest {
  const req = new NextRequest(new URL(url));
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
}

describe("proxy", () => {
  it("redirects anonymous request to /sign-in?returnTo=<path>", () => {
    const req = makeRequest("https://lex-web-eta.vercel.app/intel/sanctions");
    const res = proxy(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location")!;
    expect(location).toContain("/sign-in");
    expect(location).toContain("returnTo=%2Fintel%2Fsanctions");
  });

  it("preserves search params in returnTo", () => {
    const req = makeRequest("https://lex-web-eta.vercel.app/intel/offshore?q=foo&page=2");
    const res = proxy(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location")!;
    // %3F = ?, %3D = =, %26 = & — URL-encoded inside the returnTo param
    expect(location).toContain("returnTo=%2Fintel%2Foffshore%3Fq%3Dfoo%26page%3D2");
  });

  it("redirects /profile without a session cookie", () => {
    const req = makeRequest("https://lex-web-eta.vercel.app/profile");
    const res = proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("returnTo=%2Fprofile");
  });

  it("lets through requests carrying a Supabase auth-token cookie", () => {
    const req = makeRequest(
      "https://lex-web-eta.vercel.app/intel/sanctions",
      { "sb-qnoqayvdjeexpewfrcrj-auth-token": "base64-jwt-payload" },
    );
    const res = proxy(req);
    // NextResponse.next() returns a 200-like passthrough; we just check no redirect.
    expect(res.headers.get("location")).toBeNull();
  });

  it("ignores empty-value sb-* cookies (not a real session)", () => {
    const req = makeRequest(
      "https://lex-web-eta.vercel.app/profile",
      { "sb-qnoqayvdjeexpewfrcrj-auth-token": "" },
    );
    const res = proxy(req);
    expect(res.status).toBe(307);
  });

  it("ignores non-supabase cookies", () => {
    const req = makeRequest(
      "https://lex-web-eta.vercel.app/intel",
      { "some-other-cookie": "value" },
    );
    const res = proxy(req);
    expect(res.status).toBe(307);
  });

  it("matcher only targets /intel and /profile trees", () => {
    expect(config.matcher).toEqual(["/intel/:path*", "/profile/:path*"]);
  });
});
