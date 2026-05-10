"use client";

/**
 * <DownloadPdfButton /> — PDF-01 / D-12 — single CTA that fetches /api/audit/pdf
 * and triggers a browser download of the resulting blob.
 *
 * State machine: idle → loading → done (transient ~2s) → idle. error path
 * surfaces a co-located toast with retry (modeled on RateLimitToast but with
 * role="alert" + aria-live="assertive" per UI-SPEC §"Error toast for PDF failure").
 *
 * Per CONTEXT.md D-06: useRateLimitedFetch is the only fetch path; bare fetch()
 * is forbidden. The 429 path surfaces the existing RateLimitToast (already
 * rendered by IntelSearchSummary on /intel/search; on /audit there is no page-
 * level toast yet, so the hook's rateLimited state is rendered alongside
 * the error toast in this component — see render block below).
 *
 * Filename: server controls via Content-Disposition; the client re-derives
 * for the <a download> attribute (servers set browser-side filename via
 * the response header; download attr is a hint).
 */
import { useEffect, useRef, useState } from "react";
import { useRateLimitedFetch } from "@/lib/use-rate-limited-fetch";
import { RateLimitToast } from "@/app/components/rate-limit-toast";

type State = "idle" | "loading" | "done" | "error";

export function DownloadPdfButton({ className }: { className?: string }) {
  const [state, setState] = useState<State>("idle");
  const [errorVisible, setErrorVisible] = useState(false);
  const announceRef = useRef<string>(""); // sr-only announcement; updates only on idle↔done/error transitions
  const rl = useRateLimitedFetch();

  const click = async () => {
    if (state === "loading") return;
    setState("loading");
    setErrorVisible(false);
    announceRef.current = "";
    try {
      const result = await rl.submit("/api/audit/pdf", { method: "GET" });
      if (!result.ok) {
        if ("rateLimited" in result) {
          // RateLimitToast (rendered below) shows the countdown.
          setState("idle");
          return;
        }
        if ("aborted" in result) {
          setState("idle");
          return;
        }
        setState("error");
        setErrorVisible(true);
        return;
      }
      const { response } = result;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const today = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lex-brain-audit-${today}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      announceRef.current = "PDF файлът е свален.";
      setState("done");
      // Auto-revert to idle after 2 s (UI-SPEC §"Свали като PDF button" Done state)
      setTimeout(() => setState("idle"), 2_000);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setState("idle");
        return;
      }
      setState("error");
      setErrorVisible(true);
    } finally {
      rl.finish();
    }
  };

  // Cleanup on unmount: rl already handles abort; nothing else to clean up.
  useEffect(() => () => rl.cancel(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const label =
    state === "loading"
      ? "Генерирам PDF…"
      : state === "done"
        ? "Свален ✓"
        : "Свали като PDF";

  return (
    <div className={`flex flex-col items-end gap-1 ${className ?? ""}`}>
      <button
        type="button"
        onClick={click}
        disabled={state === "loading"}
        aria-busy={state === "loading"}
        aria-label="Свали целия одит като PDF файл"
        className="inline-flex items-center gap-2 rounded-md bg-red-700 px-4 py-3 text-sm font-medium text-white
                   hover:bg-red-600 active:bg-red-800
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500
                   disabled:cursor-wait disabled:opacity-80"
      >
        {label}
        {state === "loading" && (
          <span aria-hidden className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-white/70" />
        )}
        {/* sr-only announcement — fires once on idle→done transition */}
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {announceRef.current}
        </span>
      </button>
      <p className="text-xs text-stone-500">~10 секунди · A4 · с воден знак LEX.BRAIN</p>

      {/* 429 toast reuses Phase 1 RateLimitToast (amber palette, polite, single-action). */}
      <RateLimitToast state={rl.rateLimited} onDismiss={rl.dismissRateLimited} />

      {/* Error toast — co-located, distinct from RateLimitToast (UI-SPEC §"Error toast for PDF failure"). */}
      {errorVisible && (
        <div
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="mx-auto my-2 flex max-w-2xl items-start justify-between gap-3
                     rounded-md border border-red-700/60 bg-red-950/40
                     px-3 py-2.5 text-sm text-red-200"
        >
          <div>
            <strong className="block">Неуспешно генериране на PDF</strong>
            <span className="text-red-300">
              Опитайте отново след минута. Ако грешката се повтори, използвайте Cmd+P → Запази като PDF.
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setErrorVisible(false);
                click();
              }}
              className="text-xs underline"
            >
              Опитай отново
            </button>
            <button
              type="button"
              onClick={() => setErrorVisible(false)}
              aria-label="Затвори"
              className="text-xs underline"
            >
              Затвори
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
