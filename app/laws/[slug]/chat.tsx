"use client";

import { useEffect, useRef, useState } from "react";

type Turn = { q: string; a: string };

const ARTICLE_RE = /Чл\.?\s*(\d+[а-я]?)/g;

const EXAMPLE_QUESTIONS = [
  "Какви са основните права по този закон?",
  "Кой е задължен по този закон?",
  "Какви са санкциите?",
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

export function LawChat({ slug }: { slug: string }) {
  const [question, setQuestion] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [pendingAnswer, setPendingAnswer] = useState("");
  const [history, setHistory] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Auto-scroll to the bottom of the conversation as new content arrives.
  useEffect(() => {
    const el = conversationRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history.length, pendingAnswer, busy]);

  const submit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setQuestion("");
    setPendingQuestion(q);
    setPendingAnswer("");
    setBusy(true);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;
    let acc = "";

    try {
      const res = await fetch(`/api/chat/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          history: history.slice(-5),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || `HTTP ${res.status}`);
        setBusy(false);
        setPendingQuestion("");
        return;
      }
      if (!res.body) {
        setError("Празен отговор от сървъра");
        setBusy(false);
        setPendingQuestion("");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setPendingAnswer(acc);
      }
      setHistory((prev) => [...prev, { q, a: acc }]);
      setPendingAnswer("");
      setPendingQuestion("");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
      setPendingQuestion("");
    } finally {
      setBusy(false);
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

  const showPending = busy || (pendingAnswer.length > 0 && pendingQuestion);

  return (
    <div className="flex h-full min-h-[520px] flex-col md:min-h-0">
      {/* HEADER */}
      <header className="shrink-0 border-b border-black/[0.08] px-6 py-4 dark:border-white/[0.08]">
        <h2 className="font-serif text-base font-semibold">💬 Задай въпрос</h2>
        <p className="mt-0.5 text-xs text-black/55 dark:text-white/55">
          Отговарям само въз основа на членовете на този закон.
        </p>
      </header>

      {/* CONVERSATION */}
      <div
        ref={conversationRef}
        className="flex-1 overflow-y-auto px-6 py-4"
      >
        {history.length === 0 && !showPending && !error && (
          <EmptyState onPick={usePill} />
        )}

        <ol className="space-y-0">
          {history.map((turn, i) => (
            <TurnRow
              key={i}
              question={turn.q}
              answer={turn.a}
              streaming={false}
            />
          ))}
          {showPending && (
            <TurnRow
              question={pendingQuestion}
              answer={pendingAnswer}
              streaming={busy}
            />
          )}
        </ol>

        {error && (
          <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-200">
            Грешка: {error}
          </p>
        )}
      </div>

      {/* INPUT */}
      <div className="shrink-0 border-t border-black/[0.08] bg-white/60 px-6 py-3 dark:border-white/[0.08] dark:bg-white/[0.02]">
        <form onSubmit={submit} className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy}
            rows={1}
            placeholder="Задайте въпрос за този закон…"
            className="field-sizing-content min-h-[2.5rem] max-h-[6.5rem] flex-1 resize-none overflow-y-auto rounded-md border border-black/15 bg-white px-3 py-2 text-sm leading-snug text-black placeholder-black/40 focus:border-amber-600 focus:outline-none disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:placeholder-white/40"
          />
          <button
            type="submit"
            disabled={busy || !question.trim()}
            className="shrink-0 rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-600 dark:hover:bg-amber-500"
            aria-label="Изпрати"
          >
            {busy ? "…" : "Изпрати"}
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

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="py-10 text-center">
      <p className="mx-auto max-w-sm text-sm text-black/65 dark:text-white/65">
        Задайте въпрос за закона — ще отговоря въз основа на текста му.
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

function TurnRow({
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
      // clipboard unavailable
    }
  };

  return (
    <li className="border-b border-black/[0.06] py-4 first:pt-0 last:border-b-0 dark:border-white/[0.06]">
      <p className="text-[13px] font-medium text-amber-800 dark:text-amber-300">
        <span className="opacity-60">Вие:</span> {question}
      </p>
      <div className="mt-2 text-[0.95rem] leading-relaxed text-black/85 dark:text-white/85">
        {answer ? (
          <p className="whitespace-pre-line">{answer}</p>
        ) : (
          <p className="text-sm text-black/50 italic dark:text-white/50">
            <span className="animate-pulse">Чета закона и подготвям отговор…</span>
          </p>
        )}
        {streaming && answer && (
          <span className="ml-1 inline-block h-3 w-2 animate-pulse bg-amber-600 align-middle dark:bg-amber-400" />
        )}
      </div>

      {cited.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
          <span className="text-[10px] uppercase tracking-wide text-black/45 dark:text-white/45">
            Цитирани:
          </span>
          {cited.map((n) => (
            <a
              key={n}
              href={`#art-${n}`}
              className="rounded border border-black/15 bg-white px-1.5 py-0.5 font-medium text-black/80 hover:border-amber-500 hover:bg-amber-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-white/80 dark:hover:border-amber-600 dark:hover:bg-amber-950/40"
            >
              Чл. {n}
            </a>
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
