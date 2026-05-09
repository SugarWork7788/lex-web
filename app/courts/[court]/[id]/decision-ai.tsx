"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRateLimitedFetch } from "@/lib/use-rate-limited-fetch";
import { RateLimitToast } from "@/app/components/rate-limit-toast";

type Tab = "summary" | "chat";
type Turn = { q: string; a: string };

const ARTICLE_RE = /Чл\.?\s*(\d+[а-я]?)/g;

const EXAMPLE_QUESTIONS = [
  "Какво реши съдът накратко?",
  "Кои закони са приложени?",
  "Каква е практическата значимост?",
];

function extractCitedArticles(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  ARTICLE_RE.lastIndex = 0;
  while ((m = ARTICLE_RE.exec(text)) !== null) {
    const num = m[1];
    if (!seen.has(num)) {
      seen.add(num);
      out.push(num);
    }
  }
  return out;
}

function renderInline(text: string): ReactNode {
  if (!text) return null;
  const parts: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<strong key={key++}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  if (parts.length === 0) return text;
  return <>{parts}</>;
}

function renderMarkdown(text: string): ReactNode {
  if (!text) return null;
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let listBuf: ReactNode[] = [];
  let paraBuf: string[] = [];
  let blockKey = 0;

  const flushList = () => {
    if (listBuf.length === 0) return;
    blocks.push(
      <ul
        key={`ul-${blockKey++}`}
        className="my-2 list-disc space-y-1 pl-5 text-[0.95rem] leading-relaxed"
      >
        {listBuf}
      </ul>,
    );
    listBuf = [];
  };
  const flushPara = () => {
    if (paraBuf.length === 0) return;
    const joined = paraBuf.join(" ").trim();
    if (joined) {
      blocks.push(
        <p
          key={`p-${blockKey++}`}
          className="my-2 text-[0.95rem] leading-relaxed"
        >
          {renderInline(joined)}
        </p>,
      );
    }
    paraBuf = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    if (line.startsWith("## ") || line.startsWith("### ")) {
      flushPara();
      flushList();
      const content = line.replace(/^#{2,3}\s+/, "").trim();
      blocks.push(
        <h3
          key={`h-${blockKey++}`}
          className="mt-4 text-sm font-semibold uppercase tracking-wide text-amber-800 first:mt-0 dark:text-amber-300"
        >
          {content}
        </h3>,
      );
      continue;
    }
    if (line.startsWith("# ")) {
      flushPara();
      flushList();
      blocks.push(
        <h3
          key={`h-${blockKey++}`}
          className="mt-4 text-sm font-semibold uppercase tracking-wide text-amber-800 first:mt-0 dark:text-amber-300"
        >
          {line.slice(2).trim()}
        </h3>,
      );
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      flushPara();
      const content = line.slice(2).trim();
      listBuf.push(
        <li key={`li-${listBuf.length}`}>{renderInline(content)}</li>,
      );
      continue;
    }
    paraBuf.push(line);
  }
  flushPara();
  flushList();
  return <>{blocks}</>;
}

export function DecisionAI({ court, id }: { court: string; id: string }) {
  const [tab, setTab] = useState<Tab>("summary");
  // ONE hook instance shared across both fetch sites (summary + chat).
  // A user only triggers one surface at a time inside this component, so
  // sharing busy/rateLimited/abort state is correct.
  const rl = useRateLimitedFetch();

  return (
    <div className="flex h-full min-h-[520px] flex-col md:min-h-0">
      <div className="shrink-0 border-b border-black/[0.08] dark:border-white/[0.08]">
        <div className="flex">
          <TabButton
            active={tab === "summary"}
            onClick={() => setTab("summary")}
            label="✦ AI резюме"
          />
          <TabButton
            active={tab === "chat"}
            onClick={() => setTab("chat")}
            label="💬 Задай въпрос"
          />
        </div>
      </div>

      {/* RATE-LIMIT TOAST (D-04) — shared across summary + chat panes. */}
      <RateLimitToast
        state={rl.rateLimited}
        onDismiss={rl.dismissRateLimited}
      />

      <div className={tab === "summary" ? "flex-1 min-h-0" : "hidden"}>
        <SummaryPane court={court} id={id} active={tab === "summary"} rl={rl} />
      </div>
      <div className={tab === "chat" ? "flex-1 min-h-0" : "hidden"}>
        <ChatPane court={court} id={id} rl={rl} />
      </div>
    </div>
  );
}

type RL = ReturnType<typeof useRateLimitedFetch>;

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
        active
          ? "border-b-2 border-amber-600 text-amber-800 dark:border-amber-400 dark:text-amber-300"
          : "border-b-2 border-transparent text-black/55 hover:text-black/85 dark:text-white/55 dark:hover:text-white/85"
      }`}
    >
      {label}
    </button>
  );
}

function SummaryPane({
  court,
  id,
  active,
  rl,
}: {
  court: string;
  id: string;
  active: boolean;
  rl: RL;
}) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "streaming" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStatus("streaming");
    setText("");
    setError(null);

    (async () => {
      const result = await rl.submit(`/api/courts/summarize/${court}/${id}`, {
        method: "POST",
      });
      if (!result.ok) {
        if ("rateLimited" in result) {
          // Toast surfaces the 429; reset pane state so user can re-trigger.
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
        const decoder = new TextDecoder();
        let acc = "";
        while (true) {
          if (signal.aborted) break;
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setText(acc);
        }
        setStatus("done");
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      } finally {
        rl.finish();
      }
    })();

    // Cancel via the hook's controller — same chain that powers AI-07.
    return () => rl.cancel();
    // Hook identity is stable; rl is intentionally not in the dep array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [court, id]);

  return (
    <div className="h-full overflow-y-auto px-6 py-4" aria-hidden={!active}>
      {status === "streaming" && text === "" && <SummarySkeleton />}
      {status === "error" && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-200">
          Грешка при генериране на резюме: {error}
        </div>
      )}
      {text && (
        <div className="text-black/85 dark:text-white/85">
          {renderMarkdown(text)}
          {status === "streaming" && (
            <span className="ml-1 inline-block h-3 w-2 animate-pulse bg-amber-600 align-middle dark:bg-amber-400" />
          )}
        </div>
      )}
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <div className="h-3 w-32 animate-pulse rounded bg-black/[0.08] dark:bg-white/[0.08]" />
          <div className="mt-2 space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.05]" />
            <div className="h-3 w-11/12 animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.05]" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.05]" />
          </div>
        </div>
      ))}
      <p className="pt-2 text-xs text-black/45 italic dark:text-white/45 animate-pulse">
        Чета решението и подготвям резюме…
      </p>
    </div>
  );
}

function ChatPane({ court, id, rl }: { court: string; id: string; rl: RL }) {
  const [question, setQuestion] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [pendingAnswer, setPendingAnswer] = useState("");
  const [history, setHistory] = useState<Turn[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = conversationRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history.length, pendingAnswer, rl.busy]);

  const submit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = question.trim();
    if (!q || rl.busy) return;
    setQuestion("");
    setPendingQuestion(q);
    setPendingAnswer("");

    const result = await rl.submit(`/api/courts/chat/${court}/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, history: history.slice(-4) }),
    });

    if (!result.ok) {
      setPendingQuestion("");
      textareaRef.current?.focus();
      return;
    }

    const { response, signal } = result;
    if (!response.body) {
      rl.setError("Празен отговор");
      setPendingQuestion("");
      rl.finish();
      textareaRef.current?.focus();
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let acc = "";
    try {
      while (true) {
        if (signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setPendingAnswer(acc);
      }
      setHistory((prev) => [...prev, { q, a: acc }]);
      setPendingAnswer("");
      setPendingQuestion("");
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setPendingQuestion("");
        return;
      }
      rl.setError(err instanceof Error ? err.message : String(err));
      setPendingQuestion("");
    } finally {
      rl.finish();
      textareaRef.current?.focus();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  const usePill = (text: string) => {
    setQuestion(text);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const showPending = rl.busy || (pendingAnswer.length > 0 && pendingQuestion);

  return (
    <div className="flex h-full flex-col">
      <div ref={conversationRef} className="flex-1 overflow-y-auto px-6 py-4">
        {history.length === 0 && !showPending && !rl.error && (
          <ChatEmptyState onPick={usePill} />
        )}

        <ol className="space-y-0">
          {history.map((turn, i) => (
            <ChatTurn key={i} question={turn.q} answer={turn.a} streaming={false} />
          ))}
          {showPending && (
            <ChatTurn
              question={pendingQuestion}
              answer={pendingAnswer}
              streaming={rl.busy}
            />
          )}
        </ol>

        {rl.error && (
          <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-200">
            Грешка: {rl.error}
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-black/[0.08] bg-white/60 px-6 py-3 dark:border-white/[0.08] dark:bg-white/[0.02]">
        <form onSubmit={submit} className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={rl.busy}
            rows={1}
            placeholder="Задайте въпрос за решението…"
            className="field-sizing-content min-h-[2.5rem] max-h-[6.5rem] flex-1 resize-none overflow-y-auto rounded-md border border-black/15 bg-white px-3 py-2 text-sm leading-snug text-black placeholder-black/40 focus:border-amber-600 focus:outline-none disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:placeholder-white/40"
          />
          <button
            type="submit"
            disabled={rl.busy || !question.trim()}
            className="shrink-0 rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-600 dark:hover:bg-amber-500"
            aria-label="Изпрати"
          >
            {rl.busy ? "…" : "Изпрати"}
          </button>
        </form>
        <p className="mt-1.5 text-[11px] text-black/45 dark:text-white/45">
          <kbd className="rounded border border-black/15 bg-white px-1 dark:border-white/15 dark:bg-white/[0.06]">
            Enter
          </kbd>{" "}
          — изпрати,{" "}
          <kbd className="rounded border border-black/15 bg-white px-1 dark:border-white/15 dark:bg-white/[0.06]">
            Shift+Enter
          </kbd>{" "}
          — нов ред
        </p>
      </div>
    </div>
  );
}

function ChatEmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="py-10 text-center">
      <p className="mx-auto max-w-sm text-sm text-black/65 dark:text-white/65">
        Питайте за това решение — ще отговарям въз основа на текста му и
        свързаните закони.
      </p>
      <div className="mt-4 flex flex-col items-center gap-2">
        {EXAMPLE_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="rounded-full border border-black/15 bg-white px-3 py-1 text-xs text-black/75 hover:border-amber-500 hover:bg-amber-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-white/80 dark:hover:border-amber-600 dark:hover:bg-amber-950/40"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatTurn({
  question,
  answer,
  streaming,
}: {
  question: string;
  answer: string;
  streaming: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const cited = extractCitedArticles(answer);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <li className="border-b border-black/[0.06] py-4 first:pt-0 last:border-b-0 dark:border-white/[0.06]">
      <p className="text-[13px] font-medium text-amber-800 dark:text-amber-300">
        <span className="opacity-60">Вие:</span> {question}
      </p>
      <div className="mt-2 text-black/85 dark:text-white/85">
        {answer ? (
          <div>
            {renderMarkdown(answer)}
            {streaming && (
              <span className="ml-1 inline-block h-3 w-2 animate-pulse bg-amber-600 align-middle dark:bg-amber-400" />
            )}
          </div>
        ) : (
          <p className="text-sm text-black/50 italic dark:text-white/50">
            <span className="animate-pulse">
              Чета решението и подготвям отговор…
            </span>
          </p>
        )}
      </div>

      {cited.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
          <span className="text-[10px] uppercase tracking-wide text-black/45 dark:text-white/45">
            Цитирани:
          </span>
          {cited.map((n) => (
            <span
              key={n}
              className="rounded border border-black/15 bg-white px-1.5 py-0.5 font-medium text-black/80 dark:border-white/15 dark:bg-white/[0.04] dark:text-white/80"
            >
              Чл. {n}
            </span>
          ))}
        </div>
      )}

      {answer && !streaming && (
        <div className="mt-2">
          <button
            type="button"
            onClick={copy}
            className="text-[11px] text-black/55 hover:text-black/85 dark:text-white/55 dark:hover:text-white/85"
          >
            {copied ? "✓ Копирано" : "📋 Копирай отговора"}
          </button>
        </div>
      )}
    </li>
  );
}
