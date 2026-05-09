"use client";

/**
 * Shared client hook for rate-limited fetches (Phase 01-02 / RL-01).
 *
 * Replaces the bespoke `fetch + setError` block at 8 chat surfaces (D-01).
 * Owns: abort signal lifecycle, 429 parsing, countdown ticker, error state
 * for non-429 failures (D-07).
 * Hands back: { response, signal } on success — caller owns the body
 * reader (different surfaces decode differently). The signal must be
 * preserved through the streaming consumer to keep AI-07's abort
 * propagation chain intact.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type RateLimitState = {
  retryAfter: number; // seconds remaining (countdown decrements client-side)
  message: string; // server-emitted Bulgarian string (D-06)
};

export type SubmitResult =
  | { ok: true; response: Response; signal: AbortSignal }
  | { ok: false; rateLimited: RateLimitState }
  | { ok: false; error: string }
  | { ok: false; aborted: true };

export function useRateLimitedFetch() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState<RateLimitState | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick the countdown once per second; clear at 0 (D-04).
  // Re-arm only when the active/inactive state flips (null<->set), not on
  // every retryAfter decrement — interval would be torn down and rebuilt
  // each tick otherwise.
  const isActive = rateLimited !== null;
  useEffect(() => {
    if (!isActive) return;
    tickRef.current = setInterval(() => {
      setRateLimited((prev) => {
        if (!prev) return null;
        const next = prev.retryAfter - 1;
        return next <= 0 ? null : { ...prev, retryAfter: next };
      });
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [isActive]);

  // Cleanup: abort any in-flight request on unmount (preserves AI-07).
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const submit = useCallback(
    async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<SubmitResult> => {
      // Abort any prior in-flight request bound to this hook instance.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      setError(null);
      // Do NOT clear rateLimited here — if the user clicks while throttled,
      // we want a fresh server response to either replace the state or
      // (post-zero) fall through to a 200/4xx.

      try {
        const res = await fetch(input, {
          ...init,
          signal: controller.signal,
        });

        if (res.status === 429) {
          // D-05: prefer JSON retry_after over the Retry-After header.
          // D-06: server message is source of truth (Bulgarian).
          let retryAfter = 60;
          let message = "Твърде много заявки. Моля, изчакайте.";
          try {
            const body = (await res.json()) as {
              error?: string;
              retry_after?: number;
            };
            if (typeof body.retry_after === "number")
              retryAfter = body.retry_after;
            if (typeof body.error === "string") message = body.error;
          } catch {
            // Defensive: server may not have emitted JSON. Use defaults above.
          }
          const state: RateLimitState = { retryAfter, message };
          setRateLimited(state);
          setBusy(false);
          return { ok: false, rateLimited: state };
        }

        if (!res.ok) {
          // D-07: non-429 errors fall back to setError; caller still has
          // its own inline-error path for backward compat.
          const text = await res.text();
          const msg = text || `HTTP ${res.status}`;
          setError(msg);
          setBusy(false);
          return { ok: false, error: msg };
        }

        // SUCCESS: caller owns res.body. Hand back the signal so they
        // pass it through their streaming consumer (preserves AI-07).
        return { ok: true, response: res, signal: controller.signal };
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setBusy(false);
          return { ok: false, aborted: true };
        }
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setBusy(false);
        return { ok: false, error: msg };
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // setBusy(false) is caller-driven on the success branch — the caller
  // owns the body reader and decides when streaming ends.
  const finish = useCallback(() => setBusy(false), []);

  const dismissRateLimited = useCallback(() => setRateLimited(null), []);

  return {
    submit,
    cancel,
    finish,
    dismissRateLimited,
    busy,
    error,
    rateLimited,
    setError,
  };
}
