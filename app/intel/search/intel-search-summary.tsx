"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRateLimitedFetch } from "@/lib/use-rate-limited-fetch";
import { RateLimitToast } from "@/app/components/rate-limit-toast";

type Counts = {
  sanctioned: number; offshore: number; olaf: number;
  articles: number; prosecution: number; nap: number;
};
type Samples = {
  sanctioned: string[]; offshore: string[]; olaf: string[];
  articles: string[]; prosecution: string[]; nap: string[];
};

function renderInline(t: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = re.exec(t)) !== null) {
    if (m.index > last) parts.push(t.slice(last, m.index));
    parts.push(<strong key={k++}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < t.length) parts.push(t.slice(last));
  return parts.length ? <>{parts}</> : t;
}

function renderMarkdown(text: string): ReactNode {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let listBuf: ReactNode[] = []; let para: string[] = []; let k = 0;
  const flushP = () => {
    if (para.length) {
      blocks.push(<p key={`p-${k++}`} className="my-2 text-[0.95rem] leading-relaxed">{renderInline(para.join(" ").trim())}</p>);
      para = [];
    }
  };
  const flushL = () => {
    if (listBuf.length) {
      blocks.push(<ul key={`u-${k++}`} className="my-2 list-disc space-y-1 pl-5 text-[0.95rem]">{listBuf}</ul>);
      listBuf = [];
    }
  };
  for (const raw of lines) {
    const ln = raw.trim();
    if (!ln) { flushP(); flushL(); continue; }
    if (ln.startsWith("## ") || ln.startsWith("# ")) {
      flushP(); flushL();
      blocks.push(<h3 key={`h-${k++}`} className="mt-4 text-sm font-semibold uppercase tracking-wide text-red-300 first:mt-0">{ln.replace(/^#+\s*/, "")}</h3>);
      continue;
    }
    if (ln.startsWith("- ") || ln.startsWith("* ")) {
      flushP();
      listBuf.push(<li key={`l-${listBuf.length}`}>{renderInline(ln.slice(2).trim())}</li>);
      continue;
    }
    para.push(ln);
  }
  flushP(); flushL();
  return <>{blocks}</>;
}

export function IntelSearchSummary({
  query, counts, samples,
}: { query: string; counts: Counts; samples: Samples }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "streaming" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const rl = useRateLimitedFetch();

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStatus("streaming");
    (async () => {
      const result = await rl.submit("/api/intel/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, counts, samples }),
      });
      if (!result.ok) {
        if ("rateLimited" in result) {
          // Toast handles the 429; re-arm so a retry after 0 can fire.
          startedRef.current = false;
          setStatus("idle");
          return;
        }
        if ("aborted" in result) return;
        setError(result.error);
        setStatus("error");
        return;
      }
      const { response, signal } = result;
      if (!response.body) {
        setError("Празен отговор");
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
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      } finally {
        rl.finish();
      }
    })();
    return () => rl.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, counts, samples]);

  return (
    <>
      <RateLimitToast state={rl.rateLimited} onDismiss={rl.dismissRateLimited} />
      <div className="rounded-lg border border-red-800/40 bg-red-950/15 p-5">
        <div className="text-xs uppercase tracking-wider text-red-400 font-medium mb-2">
          ✦ AI обобщение
        </div>
        {status === "streaming" && text === "" && (
          <p className="text-sm text-stone-400 italic animate-pulse">Анализирам всички бази…</p>
        )}
        {status === "error" && (
          <p className="text-sm text-red-300">Грешка: {error}</p>
        )}
        {text && (
          <div className="text-stone-100">
            {renderMarkdown(text)}
            {status === "streaming" && (
              <span className="ml-1 inline-block h-3 w-2 animate-pulse bg-red-500 align-middle" />
            )}
          </div>
        )}
      </div>
    </>
  );
}
