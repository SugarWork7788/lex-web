// File: __tests__/get-session.test.ts
//
// Asserts the server-side getSession() helper:
//  - calls supabase.auth.getUser() (NOT supabase.auth.getSession()) — Pitfall 5
//  - returns the user object or null
//
// Env-var defaults provided by __tests__/setup.ts (loaded via setupFiles).
//
// Strategy: mock `next/headers` (cookies()) and `@supabase/ssr`
// (createServerClient) at the module boundary so the REAL getSession()
// + createServerSupabase() code paths execute. This proves the Pitfall 5
// invariant in production code, not in a re-implementation.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { getUserMock, getSessionMock, cookiesMock, createServerClientMock } = vi.hoisted(() => {
  const getUserMock = vi.fn();
  const getSessionMock = vi.fn();
  const cookiesMock = vi.fn();
  const createServerClientMock = vi.fn(() => ({
    auth: { getUser: getUserMock, getSession: getSessionMock },
  }));
  return { getUserMock, getSessionMock, cookiesMock, createServerClientMock };
});

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: vi.fn(),
  createServerClient: createServerClientMock,
}));

import { getSession } from "@/lib/supabase-auth";

describe("getSession() server util", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    getSessionMock.mockReset();
    cookiesMock.mockReset();
    createServerClientMock.mockClear();
    cookiesMock.mockResolvedValue({
      getAll: () => [],
      set: vi.fn(),
    });
  });

  it("returns the user when getUser succeeds", async () => {
    const user = { id: "user-1", email: "u@example.bg" };
    getUserMock.mockResolvedValueOnce({ data: { user }, error: null });

    const result = await getSession();

    expect(result).toEqual(user);
    expect(getUserMock).toHaveBeenCalledTimes(1);
    expect(getSessionMock).not.toHaveBeenCalled(); // Pitfall 5 invariant
  });

  it("returns null when no user is signed in", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });

    const result = await getSession();

    expect(result).toBeNull();
    expect(getUserMock).toHaveBeenCalledTimes(1);
    expect(getSessionMock).not.toHaveBeenCalled();
  });
});
