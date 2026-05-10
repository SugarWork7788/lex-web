"use client";

import { useEffect, useRef, useState } from "react";
import { useRateLimitedFetch } from "@/lib/use-rate-limited-fetch";

/**
 * <BestMatchQuote> — Phase 02 INT-02 (D-03 / D-04) — streams a Haiku 4.5
 * extracted 1–2 sentence Bulgarian quote into an article best-match card via
 * POST /api/intel/quote.
 *
 * Per CONTEXT.md D-06 the only network-call path here is useRateLimitedFetch
 * — bare browser-fetch is forbidden in this surface. The hook owns the
 * abort-signal lifecycle + 429 parsing + the page-level <RateLimitToast>
 * announce-on-throttle.
 *
 * aria-live debouncing (UI-SPEC §"Accessibility Contract" line 396 / 400):
 *   The visible streaming <p> is `aria-hidden` so screen readers don't hear
 *   every token. A separate sr-only `<span aria-live="polite">` holds the
 *   final text and is populated ONCE on `status === 'done'` — the AT user
 *   hears the final quote a single time, not a chorus during streaming.
 *
 * Pattern is copy-verbatim from app/intel/search/intel-search-summary.tsx
 * lines 64-124 with three changes:
 *   - endpoint: /api/intel/quote
 *   - body: { query, summary } (was { query, counts, samples })
 *   - text rendering: plain text (no markdown — quote is one sentence)
 */
export function BestMatchQuote({
  query,
  summary,
}: {
  query: string;
  summary: string;
}) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<
    "idle" | "streaming" | "done" | "error"
  >("idle");
  const startedRef = useRef(false);
  const rl = useRateLimitedFetch();

  useEffect(() => {
    if (startedRef.current) return;
    if (!summary.trim()) {
      // No summary to extract from — render the fallback copy (D-03 fallback).
      setStatus("error");
      return;
    }
    startedRef.current = true;
    setStatus("streaming");
    (async () => {
      const result = await rl.submit("/api/intel/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, summary }),
      });
      if (!result.ok) {
        if ("rateLimited" in result) {
          // RateLimitToast on the page-level summary surfaces the 429.
          // Per-card fallback copy below shows so the user doesn't see a
          // permanently empty quote slot.
          startedRef.current = false;
          setStatus("error");
          return;
        }
        if ("aborted" in result) return;
        setStatus("error");
        return;
      }
      const { response, signal } = result;
      if (!response.body) {
        setStatus("error");
        rl.finish();
        return;
      }
      try {
        const reader = response.body.getReader();
        const dec = new TextDecoder();
        let acc = "";
        while (true) {
          if (signal.aborted) break;
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          setText(acc);
        }
        setStatus("done");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setStatus("error");
      } finally {
        rl.finish();
      }
    })();
    return () => rl.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, summary]);

  if (status === "error") {
    return (
      <p className="text-xs text-stone-500 italic">
        Цитатът не може да бъде извлечен. Виж пълния текст в раздела.
      </p>
    );
  }

  if (status === "streaming" && text === "") {
    return (
      <p className="text-sm text-stone-400 italic animate-pulse">
        Извличам цитати…
      </p>
    );
  }

  return (
    <>
      <p aria-hidden className="text-sm leading-relaxed text-stone-100">
        {text}
        {status === "streaming" && (
          <span
            aria-hidden
            className="ml-1 inline-block h-3 w-2 animate-pulse bg-red-500 align-middle"
          />
        )}
      </p>
      {/* SR announcement — fires once when stream completes (debounced). */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {status === "done" ? text : ""}
      </span>
    </>
  );
}
