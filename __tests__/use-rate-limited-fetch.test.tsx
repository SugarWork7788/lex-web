import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRateLimitedFetch } from "@/lib/use-rate-limited-fetch";

describe("useRateLimitedFetch (RL-01 hook contract)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("parses 429 + retry_after into rateLimited state (D-05/D-06)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "Твърде много заявки. Моля, изчакайте.",
          retry_after: 47,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      ),
    );
    const { result } = renderHook(() => useRateLimitedFetch());
    await act(async () => {
      const res = await result.current.submit("/api/x");
      expect(res.ok).toBe(false);
      if (!res.ok && "rateLimited" in res) {
        expect(res.rateLimited.retryAfter).toBe(47);
        expect(res.rateLimited.message).toContain("Твърде много");
      }
    });
    expect(result.current.rateLimited?.retryAfter).toBe(47);
    expect(result.current.busy).toBe(false);
  });

  it("decrements countdown each second and clears at 0 (D-04)", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ retry_after: 2, error: "x" }), {
        status: 429,
      }),
    );
    const { result } = renderHook(() => useRateLimitedFetch());
    await act(async () => {
      await result.current.submit("/api/x");
    });
    expect(result.current.rateLimited?.retryAfter).toBe(2);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.rateLimited?.retryAfter).toBe(1);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.rateLimited).toBeNull();
  });

  it("propagates abort signal to fetch (preserves AI-07)", async () => {
    let receivedSignal: AbortSignal | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      receivedSignal = init?.signal ?? undefined;
      return new Response("ok", { status: 200 });
    });
    const { result } = renderHook(() => useRateLimitedFetch());
    await act(async () => {
      const res = await result.current.submit("/api/x");
      expect(res.ok).toBe(true);
      if (res.ok) {
        // Hook hands back the same signal so caller can drive streaming.
        expect(res.signal).toBeDefined();
      }
    });
    expect(receivedSignal).toBeDefined();
    expect(receivedSignal!.aborted).toBe(false);
    act(() => result.current.cancel());
    expect(receivedSignal!.aborted).toBe(true);
  });

  it("non-429 errors flow to setError, not rateLimited (D-07)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("server exploded", { status: 500 }),
    );
    const { result } = renderHook(() => useRateLimitedFetch());
    await act(async () => {
      const res = await result.current.submit("/api/x");
      expect(res.ok).toBe(false);
      if (!res.ok && "error" in res) {
        expect(res.error).toContain("server exploded");
      }
    });
    expect(result.current.rateLimited).toBeNull();
    expect(result.current.error).toContain("server exploded");
  });
});
