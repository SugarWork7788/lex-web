"use client";

/**
 * <RateLimitToast /> — ARIA-live banner above a chat surface.
 *
 * Locked decisions:
 * - D-04: above chat, dismissible, auto-clears at countdown 0 (the parent
 *   hook clears state to null at 0; this component returns null when
 *   state is null).
 * - D-06: Bulgarian. Server message is source of truth; client appends
 *   the running countdown ("Опитайте отново след Ns").
 *
 * Accessibility: announces ONCE on null→set transition (RESEARCH Pitfall
 * 5). Sighted users see the visible countdown tick every second; SR users
 * hear the message + initial countdown exactly once.
 */
import { useEffect, useRef } from "react";

export type RateLimitToastState = { retryAfter: number; message: string };

export function RateLimitToast({
  state,
  onDismiss,
}: {
  state: RateLimitToastState | null;
  onDismiss: () => void;
}) {
  const announceRef = useRef<string>("");

  // Re-arm only on null↔set transitions; the visible countdown tick must
  // NOT trigger this effect (it would re-announce to screen readers).
  const isActive = state !== null;
  useEffect(() => {
    if (!isActive) {
      announceRef.current = "";
      return;
    }
    // Set ONCE on first appearance; sighted-user countdown still ticks
    // visibly via the aria-hidden span below.
    if (announceRef.current === "" && state) {
      announceRef.current = `${state.message} Опитайте отново след ${state.retryAfter} секунди.`;
    }
    // We intentionally exclude `state` from deps — re-running on each
    // retryAfter tick would defeat the announce-once contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  if (!state) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="mx-auto my-2 flex max-w-2xl items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200"
    >
      {/* SR text — set once on null→set; never re-announced as countdown ticks. */}
      <span className="sr-only">{announceRef.current}</span>
      {/* Visible text — updates every second. aria-hidden so SRs don't re-read it. */}
      <span aria-hidden>
        {state.message}{" "}
        <strong>Опитайте отново след {state.retryAfter}s</strong>
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="text-xs underline"
        aria-label="Затвори"
      >
        Затвори
      </button>
    </div>
  );
}
