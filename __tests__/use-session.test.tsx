// File: __tests__/use-session.test.tsx
//
// Asserts the useSession() client hook:
//  - initial render: loading=true, user=null
//  - after initial getSession resolves: loading=false, user=session.user
//  - after onAuthStateChange fires SIGNED_IN: user updates
//  - on unmount: subscription.unsubscribe() called

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const getSessionMock = vi.fn();
const onAuthStateChangeMock = vi.fn();
const unsubscribeMock = vi.fn();

vi.mock("@/lib/supabase-auth", () => ({
  createBrowserSupabase: () => ({
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
    },
  }),
}));

import { useSession } from "@/lib/use-session";

describe("useSession() client hook", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    onAuthStateChangeMock.mockReset();
    unsubscribeMock.mockReset();
    onAuthStateChangeMock.mockReturnValue({
      data: { subscription: { unsubscribe: unsubscribeMock } },
    });
  });

  it("starts loading=true with user=null, transitions to loading=false after initial getSession", async () => {
    const user = { id: "u-1", email: "a@b.bg" };
    getSessionMock.mockResolvedValueOnce({
      data: { session: { user } },
      error: null,
    });

    const { result } = renderHook(() => useSession());

    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.user).toEqual(user);
  });

  it("returns null user when getSession returns no session", async () => {
    getSessionMock.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    const { result } = renderHook(() => useSession());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.user).toBeNull();
  });

  it("updates user when onAuthStateChange fires SIGNED_IN", async () => {
    getSessionMock.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Simulate Supabase emitting a SIGNED_IN event.
    const callback = onAuthStateChangeMock.mock.calls[0][0] as (
      event: string,
      session: { user: { id: string } } | null,
    ) => void;

    const newUser = { id: "u-2", email: "x@y.bg" };
    act(() => {
      callback("SIGNED_IN", { user: newUser });
    });

    expect(result.current.user).toEqual(newUser);
  });

  it("unsubscribes on unmount", async () => {
    getSessionMock.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    const { unmount } = renderHook(() => useSession());
    await waitFor(() => expect(onAuthStateChangeMock).toHaveBeenCalled());

    unmount();

    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });
});
