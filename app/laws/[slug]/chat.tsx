"use client";

import { useEffect, useRef, useState } from "react";

type Turn = { q: string; a: string };

const ARTICLE_RE = /Чл\.?\s*(\d+[а-я]?)/g;

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
  const [pendingAnswer, setPendingAnswer] = useState("");
  const [history, setHistory] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setQuestion("");
    setBusy(true);
    setError(null);
    setPendingAnswer("");

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
        return;
      }
      if (!res.body) {
        setError("Празен отговор от сървъра");
        setBusy(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        acc += chunk;
        setPendingAnswer(acc);
      }
      setHistory((prev) => [...prev, { q, a: acc }]);
      setPendingAnswer("");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <section className="mt-16 border-t border-black/[0.08] dark:border-white/[0.08] pt-8">
      <header>
        <h2 className="font-serif text-2xl font-semibold">
          💬 Задайте въпрос за този закон
        </h2>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          AI отговор, базиран само на съдържанието на закона. Резултатите са
          ориентировъчни и не заместват професионално правно мнение.
        </p>
      </header>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          ref={inputRef}
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Задайте въпрос за този закон…"
          disabled={busy}
          className="flex-1 rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black placeholder-black/40 focus:border-amber-600 focus:outline-none disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:placeholder-white/40"
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-600 dark:hover:bg-amber-500"
        >
          {busy ? "…" : "Питай"}
        </button>
      </form>

      {error && (
        <p className="mt-3 text-sm text-red-700 dark:text-red-400">
          Грешка: {error}
        </p>
      )}

      {(history.length > 0 || pendingAnswer || busy) && (
        <ol className="mt-6 space-y-5">
          {history.map((turn, i) => (
            <ChatBubble
              key={i}
              question={turn.q}
              answer={turn.a}
              slug={slug}
              streaming={false}
            />
          ))}
          {(busy || pendingAnswer) && (
            <ChatBubble
              question={question || history[history.length - 1]?.q || "…"}
              answer={pendingAnswer}
              slug={slug}
              streaming={busy}
              hideQuestion={true}
            />
          )}
        </ol>
      )}
    </section>
  );
}

function ChatBubble({
  question,
  answer,
  slug,
  streaming,
  hideQuestion,
}: {
  question: string;
  answer: string;
  slug: string;
  streaming: boolean;
  hideQuestion?: boolean;
}) {
  const cited = extractCitedArticles(answer);
  return (
    <li>
      {!hideQuestion && (
        <div className="text-sm font-medium text-black/85 dark:text-white/85">
          <span className="text-black/55 dark:text-white/55">Вие:</span>{" "}
          {question}
        </div>
      )}
      <div className="mt-2 rounded-lg border border-black/[0.08] bg-white px-4 py-3 text-[0.95rem] leading-relaxed text-black/85 dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-white/85">
        {answer ? (
          <p className="whitespace-pre-line">{answer}</p>
        ) : (
          <p className="text-sm text-black/50 dark:text-white/50 animate-pulse">
            Чета закона и подготвям отговор…
          </p>
        )}
        {streaming && answer && (
          <span className="ml-1 inline-block h-3 w-2 animate-pulse bg-amber-600 align-middle dark:bg-amber-400" />
        )}
        {cited.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="uppercase tracking-wide text-black/55 dark:text-white/55">
              Цитирани членове:
            </span>
            {cited.map((n) => (
              <a
                key={n}
                href={`#art-${n}`}
                className="rounded border border-black/15 bg-white px-1.5 py-0.5 font-medium hover:bg-black/[0.03] dark:border-white/15 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
              >
                Чл. {n}
              </a>
            ))}
            <a
              href={`/laws/${slug}`}
              className="ml-auto text-amber-700 hover:underline dark:text-amber-400"
            >
              Виж пълния текст →
            </a>
          </div>
        )}
      </div>
    </li>
  );
}
