"use client";

import { useEffect, useRef, useState } from "react";
import { useRateLimitedFetch } from "@/lib/use-rate-limited-fetch";

type Status = "idle" | "loading" | "streaming" | "done" | "error";

/**
 * Inline AI summary expansion for a single dv_acts row.
 *
 * Adapts Phase 1's intel-search-summary.tsx streaming pattern. POSTs to
 * /api/dv/summarize with `{ actId }`. Streams the response body chunk-by-chunk
 * via TextDecoder and re-renders the accumulated text on each chunk.
 *
 * Lifecycle:
 *   - `isExpanded === false`  → renders the "✦ AI обобщение" trigger button.
 *   - `isExpanded === true`   → fires the POST once (status === "idle"), shows
 *                                "✦ Зареждам…" until the first byte, then
 *                                streams text + a pulse-cursor span until done.
 *   - User clicks "Скрий"     → parent flips isExpanded → false; the reset-on-
 *                                collapse effect clears state for next expand.
 *
 * Rate-limit (429) and other errors are caught by `useRateLimitedFetch.submit`;
 * we render a single inline Bulgarian error line per UI-SPEC §"AI summary fails".
 *
 * `aria-live="polite"` is rendered ONLY when status === "done" — debounce per
 * UI-SPEC §"`aria-live` debouncing" (token-by-token streaming would overwhelm
 * screen readers).
 */
export function DvActSummary({
  actId,
  isExpanded,
  onExpand,
  onCollapse,
}: {
  actId: string;
  isExpanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [content, setContent] = useState("");
  const { submit } = useRateLimitedFetch();
  const startedRef = useRef(false);

  // Reset to idle when collapsed so the next expand re-fires the fetch.
  useEffect(() => {
    if (!isExpanded) {
      startedRef.current = false;
      setStatus("idle");
      setContent("");
    }
  }, [isExpanded]);

  useEffect(() => {
    if (!isExpanded) return;
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    setStatus("loading");

    (async () => {
      const result = await submit("/api/dv/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actId }),
      });

      if (cancelled) return;

      if (!result.ok) {
        if ("rateLimited" in result) {
          setStatus("error");
          setContent(
            `Превишен лимит. Опитайте отново след ${result.rateLimited.retryAfter}s.`,
          );
        } else if ("aborted" in result) {
          // request was aborted — silent (component likely unmounting)
          return;
        } else {
          setStatus("error");
          setContent("Грешка при обобщаване. Опитайте отново.");
        }
        return;
      }

      const reader = result.response.body?.getReader();
      if (!reader) {
        setStatus("error");
        setContent("Грешка при четене на отговора.");
        return;
      }

      setStatus("streaming");
      const decoder = new TextDecoder();
      let buf = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (cancelled) {
            await reader.cancel();
            return;
          }
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          setContent(buf);
        }
        // flush any remaining bytes
        buf += decoder.decode();
        setContent(buf);
        setStatus("done");
      } catch {
        if (!cancelled) {
          setStatus("error");
          setContent("Прекъсване по време на четене.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded, actId]);

  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={onExpand}
        className="mt-3 text-xs uppercase tracking-wider text-red-400 font-medium hover:text-red-300 print:hidden"
      >
        ✦ AI обобщение
      </button>
    );
  }

  return (
    <div className="mt-3 border-t border-stone-800 pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-red-400 font-medium">
          ✦ AI обобщение
        </span>
        <button
          type="button"
          onClick={onCollapse}
          className="text-xs text-stone-500 hover:text-stone-300 print:hidden"
          aria-label="Скрий AI обобщението"
        >
          Скрий
        </button>
      </div>

      {(status === "loading" ||
        (status === "streaming" && content.length === 0)) && (
        <p className="mt-2 text-sm italic text-stone-400 animate-pulse">
          ✦ Зареждам…
        </p>
      )}

      {(status === "streaming" || status === "done") && content.length > 0 && (
        <>
          <p className="mt-2 text-sm leading-relaxed text-stone-200 whitespace-pre-wrap">
            {content}
            {status === "streaming" && (
              <span className="ml-1 inline-block h-3 w-2 animate-pulse bg-red-500 align-middle" />
            )}
          </p>
          {/* Debounced aria-live announcement — fires only when stream completes */}
          {status === "done" && (
            <span className="sr-only" aria-live="polite">
              AI обобщението е готово.
            </span>
          )}
        </>
      )}

      {status === "error" && (
        <p className="mt-2 text-sm text-red-400" role="alert">
          {content || "Грешка при обобщаване. Опитайте отново."}
        </p>
      )}
    </div>
  );
}
