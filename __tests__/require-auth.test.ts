// File: __tests__/require-auth.test.ts
//
// Phase 5 (AUTH-05..07): asserts lib/require-auth.ts redirects unauthenticated
// callers to /sign-in?returnTo=<path> and returns the User otherwise.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { getSessionMock, redirectMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    // next/navigation `redirect()` throws to halt the rendering pipeline.
    // We mirror that so the helper's control flow matches production.
    const err = new Error(`NEXT_REDIRECT: ${url}`) as Error & { __redirect: true; url: string };
    err.__redirect = true;
    err.url = url;
    throw err;
  }),
}));

vi.mock("@/lib/supabase-auth", () => ({
  getSession: getSessionMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import { requireAuth } from "@/lib/require-auth";

describe("requireAuth", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    redirectMock.mockClear();
  });

  it("returns the user when getSession() resolves to a user", async () => {
    const user = { id: "u-1", email: "a@b.bg" };
    getSessionMock.mockResolvedValueOnce(user);
    const result = await requireAuth("/profile");
    expect(result).toBe(user);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to /sign-in?returnTo=<path> when no session", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    await expect(requireAuth("/profile")).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirectMock).toHaveBeenCalledWith("/sign-in?returnTo=%2Fprofile");
  });

  it("URL-encodes paths with query strings", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    await expect(requireAuth("/intel/offshore?q=foo")).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirectMock).toHaveBeenCalledWith(
      "/sign-in?returnTo=%2Fintel%2Foffshore%3Fq%3Dfoo",
    );
  });
});
