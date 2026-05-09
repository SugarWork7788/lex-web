"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRateLimitedFetch } from "@/lib/use-rate-limited-fetch";
import { RateLimitToast } from "@/app/components/rate-limit-toast";

type Turn = { q: string; a: string };

const EXAMPLE_QUESTIONS = [
  "Какво точно е проблемът?",
  "Какви са практическите последици?",
  "Как може да се избегне или адресира?",
];

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
        className="my-2 list-disc space-y-1 pl-5 text-[0.9rem] leading-relaxed"
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
          className="my-2 text-[0.9rem] leading-relaxed"
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
    if (line.startsWith("## ") || line.startsWith("### ") || line.startsWith("# ")) {
      flushPara();
      flushList();
      const content = line.replace(/^#{1,3}\s+/, "").trim();
      blocks.push(
        <h4
          key={`h-${blockKey++}`}
          className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-amber-800 first:mt-0 dark:text-amber-300"
        >
          {content}
        </h4>,
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

export function IssueChatButton({ issueId }: { issueId: string }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [pendingAnswer, setPendingAnswer] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rl = useRateLimitedFetch();

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [open]);

  const submit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = question.trim();
    if (!q || rl.busy) return;
    setQuestion("");
    setPendingQuestion(q);
    setPendingAnswer("");

    const result = await rl.submit("/api/issues/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issue_id: issueId,
        question: q,
        history: history.slice(-4),
      }),
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
  const hasContent = history.length > 0 || showPending || rl.error;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/40"
      >
        💬 Попитай AI
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-amber-300/60 bg-white/80 p-3 dark:border-amber-700/40 dark:bg-white/[0.03]">
      {/* RATE-LIMIT TOAST (D-04) — sits above the per-issue chat panel. */}
      <RateLimitToast state={rl.rateLimited} onDismiss={rl.dismissRateLimited} />
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide font-semibold text-amber-800 dark:text-amber-300">
          💬 AI чат за този проблем
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-black/55 hover:text-black/85 dark:text-white/55 dark:hover:text-white/85"
          aria-label="Затвори"
        >
          Затвори ✕
        </button>
      </div>

      {hasContent && (
        <ol className="mt-3 max-h-80 space-y-0 overflow-y-auto pr-1">
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
          {rl.error && (
            <li className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-200">
              Грешка: {rl.error}
            </li>
          )}
        </ol>
      )}

      {!hasContent && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLE_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => usePill(q)}
              className="rounded-full border border-black/15 bg-white px-2.5 py-0.5 text-[11px] text-black/75 hover:border-amber-500 hover:bg-amber-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-white/80 dark:hover:border-amber-600 dark:hover:bg-amber-950/40"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="mt-2 flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={rl.busy}
          rows={1}
          placeholder="Питайте за този проблем…"
          className="field-sizing-content min-h-[2.25rem] max-h-[5rem] flex-1 resize-none overflow-y-auto rounded-md border border-black/15 bg-white px-2.5 py-1.5 text-xs leading-snug text-black placeholder-black/40 focus:border-amber-600 focus:outline-none disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:placeholder-white/40"
        />
        <button
          type="submit"
          disabled={rl.busy || !question.trim()}
          className="shrink-0 rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-600 dark:hover:bg-amber-500"
        >
          {rl.busy ? "…" : "Изпрати"}
        </button>
      </form>
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
  return (
    <li className="border-b border-black/[0.06] py-2.5 first:pt-0 last:border-b-0 dark:border-white/[0.06]">
      <p className="text-[12px] font-medium text-amber-800 dark:text-amber-300">
        <span className="opacity-60">Вие:</span> {question}
      </p>
      <div className="mt-1.5 text-black/85 dark:text-white/85">
        {answer ? (
          <div>
            {renderMarkdown(answer)}
            {streaming && (
              <span className="ml-1 inline-block h-2.5 w-1.5 animate-pulse bg-amber-600 align-middle dark:bg-amber-400" />
            )}
          </div>
        ) : (
          <p className="text-xs text-black/50 italic dark:text-white/50">
            <span className="animate-pulse">Подготвям отговор…</span>
          </p>
        )}
      </div>
    </li>
  );
}
