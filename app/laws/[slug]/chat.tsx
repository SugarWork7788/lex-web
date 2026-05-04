"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Turn = { q: string; a: string };

const ARTICLE_RE = /Чл\.?\s*(\d+[а-я]?)/g;

const EXAMPLE_QUESTIONS = [
  "Какви са правата ми при уволнение?",
  "Какви санкции предвижда законът за неплащане на наем?",
  "Как се урежда наследството при липса на завещание?",
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

// Tolerant inline-markdown renderer: splits on **bold** and renders the rest
// as plain text. Unmatched ** falls back to literal characters — important
// for rendering partial streams.
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

// Tolerant block-level markdown renderer for streamed Claude output.
// Supports: ## headings, - / * bullet lists, **bold**, paragraph breaks on
// blank lines. Unknown / partial markup degrades to plain text.
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

export function LawChat({ slug }: { slug: string }) {
  const [question, setQuestion] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [pendingAnswer, setPendingAnswer] = useState("");
  const [history, setHistory] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showJumpDown, setShowJumpDown] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // True if the user is parked at (or near) the bottom — "follow mode".
  // Toggles to false the moment they scroll up, restored when they scroll
  // back down or click the jump-down pill.
  const stickyRef = useRef(true);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Track user scroll position; flip out of follow-mode the moment they scroll up.
  useEffect(() => {
    const el = conversationRef.current;
    if (!el) return;
    const BOTTOM_THRESHOLD = 80; // px tolerance for "at bottom"
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const atBottom = distFromBottom <= BOTTOM_THRESHOLD;
      stickyRef.current = atBottom;
      // Pill only matters while the AI is still writing.
      setShowJumpDown(!atBottom && busy);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [busy]);

  // Auto-scroll only when the user is in follow-mode. If they've scrolled up,
  // surface the jump-down pill instead of yanking them back.
  useEffect(() => {
    const el = conversationRef.current;
    if (!el) return;
    if (stickyRef.current) {
      el.scrollTop = el.scrollHeight;
    } else if (busy) {
      setShowJumpDown(true);
    }
  }, [history.length, pendingAnswer, busy]);

  const jumpToBottom = () => {
    const el = conversationRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stickyRef.current = true;
    setShowJumpDown(false);
  };

  const stop = () => {
    abortRef.current?.abort();
  };

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
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-serif text-base font-semibold">Задай въпрос</h2>
          <span
            className={`inline-flex items-center gap-1.5 text-[11px] ${
              busy
                ? "text-amber-700 dark:text-amber-300"
                : "text-black/45 dark:text-white/45"
            }`}
            aria-live="polite"
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                busy
                  ? "animate-pulse bg-amber-600 dark:bg-amber-400"
                  : "bg-emerald-500"
              }`}
            />
            {busy ? "пиша…" : "готов"}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-black/55 dark:text-white/55">
          Отговарям само въз основа на членовете на този закон.
        </p>
      </header>

      {/* CONVERSATION */}
      <div className="relative flex-1 overflow-hidden">
        <div
          ref={conversationRef}
          className="h-full overflow-y-auto px-6 py-4 [scrollbar-width:thin]"
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

        {/* Jump-down pill — appears when user has scrolled up while AI is streaming */}
        {showJumpDown && (
          <button
            type="button"
            onClick={jumpToBottom}
            className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-amber-300 bg-amber-50/95 px-3 py-1.5 text-xs font-medium text-amber-900 shadow-sm backdrop-blur transition hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-950/80 dark:text-amber-100 dark:hover:bg-amber-900/80"
            aria-label="Скочи до новите съобщения"
          >
            ↓ нови съобщения
          </button>
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
          {busy ? (
            <button
              type="button"
              onClick={stop}
              className="shrink-0 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-200 dark:hover:bg-red-900/40"
              aria-label="Спри"
            >
              ◼ Спри
            </button>
          ) : (
            <button
              type="submit"
              disabled={!question.trim()}
              className="shrink-0 rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-600 dark:hover:bg-amber-500"
              aria-label="Изпрати"
            >
              Изпрати
            </button>
          )}
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
    <li className="group/turn border-b border-black/[0.06] py-5 first:pt-0 last:border-b-0 dark:border-white/[0.06]">
      {/* User message — right-aligned, soft amber bubble */}
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-2xl rounded-br-md bg-amber-100/70 px-3.5 py-2 text-[0.92rem] leading-snug text-amber-950 dark:bg-amber-900/30 dark:text-amber-50">
          {question}
        </div>
      </div>

      {/* AI answer — left-aligned, plain (lots of formatted content lives here) */}
      <div className="mt-3 flex items-start gap-2.5">
        <span
          className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-700 text-[11px] font-semibold text-white dark:bg-amber-600"
          aria-hidden
        >
          AI
        </span>
        <div className="min-w-0 flex-1 text-black/85 dark:text-white/85">
          {answer ? (
            <div>
              {renderMarkdown(answer)}
              {streaming && (
                <span className="ml-1 inline-block h-3.5 w-[3px] animate-pulse rounded-sm bg-amber-600 align-middle dark:bg-amber-400" />
              )}
            </div>
          ) : (
            <p className="text-sm text-black/55 italic dark:text-white/55">
              <span className="animate-pulse">
                Търся в 1240 закона и подготвям отговор…
              </span>
            </p>
          )}

          {cited.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span className="text-[10px] uppercase tracking-wider text-black/45 dark:text-white/45">
                Цитирани членове:
              </span>
              {cited.map((n) => (
                <a
                  key={n}
                  href={`#art-${n}`}
                  className="rounded-md border border-black/[0.12] bg-white px-1.5 py-0.5 text-xs font-medium text-black/80 transition hover:border-amber-500 hover:bg-amber-50 dark:border-white/[0.12] dark:bg-white/[0.04] dark:text-white/80 dark:hover:border-amber-600 dark:hover:bg-amber-950/40"
                >
                  Чл. {n}
                </a>
              ))}
            </div>
          )}

          {answer && !streaming && (
            <div className="mt-3 flex items-center gap-3 opacity-0 transition-opacity group-hover/turn:opacity-100 focus-within:opacity-100">
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1 text-[11px] text-black/55 hover:text-black/90 dark:text-white/55 dark:hover:text-white/90"
                aria-label={copied ? "Копирано" : "Копирай отговора"}
              >
                {copied ? "✓ копирано" : "⎘ копирай"}
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
