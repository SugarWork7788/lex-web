"use client";

import { useEffect, useRef, useState } from "react";
import { useRateLimitedFetch } from "@/lib/use-rate-limited-fetch";
import { RateLimitToast } from "@/app/components/rate-limit-toast";

type Category = "overlap" | "conflict" | "gap" | "hierarchy";
type Severity = "нисък" | "среден" | "висок";

type Finding = {
  id: string;
  category: Category;
  severity: Severity;
  explanation: string;
  law1_articles: string[];
  law2_articles: string[];
  quote_law1: string | null;
  quote_law2: string | null;
};

const CATEGORY_META: Record<
  Category,
  { label: string; icon: string; tone: string }
> = {
  overlap: {
    label: "Застъпване",
    icon: "🔄",
    tone: "border-blue-300 bg-blue-50/60 dark:border-blue-800/60 dark:bg-blue-950/30",
  },
  conflict: {
    label: "Противоречия",
    icon: "⚡",
    tone: "border-red-300 bg-red-50/60 dark:border-red-800/60 dark:bg-red-950/30",
  },
  gap: {
    label: "Правни празнини",
    icon: "🕳",
    tone: "border-orange-300 bg-orange-50/60 dark:border-orange-800/60 dark:bg-orange-950/30",
  },
  hierarchy: {
    label: "Йерархични конфликти",
    icon: "⚖",
    tone: "border-purple-300 bg-purple-50/60 dark:border-purple-800/60 dark:bg-purple-950/30",
  },
};

const SEVERITY_BADGE: Record<Severity, string> = {
  висок: "bg-red-700 text-white dark:bg-red-500/90",
  среден: "bg-orange-600 text-white dark:bg-orange-500/90",
  нисък: "bg-yellow-500 text-yellow-950 dark:bg-yellow-400/90",
};

function normalize(raw: unknown, idx: number): Finding | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const cat = String(o.category ?? "").toLowerCase();
  const category: Category =
    cat === "overlap" || cat === "conflict" || cat === "gap" || cat === "hierarchy"
      ? (cat as Category)
      : "overlap";
  const sevRaw = String(o.severity ?? "").toLowerCase();
  const severity: Severity =
    sevRaw === "висок" || sevRaw === "среден" || sevRaw === "нисък"
      ? (sevRaw as Severity)
      : "среден";
  const explanation = typeof o.explanation === "string" ? o.explanation : "";
  if (!explanation) return null;
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
  return {
    id: `f${idx}`,
    category,
    severity,
    explanation,
    law1_articles: arr(o.law1_articles),
    law2_articles: arr(o.law2_articles),
    quote_law1: typeof o.quote_law1 === "string" ? o.quote_law1 : null,
    quote_law2: typeof o.quote_law2 === "string" ? o.quote_law2 : null,
  };
}

export function CompareStream({
  slug1,
  name1,
  slug2,
  name2,
}: {
  slug1: string;
  name1: string;
  slug2: string;
  name2: string;
}) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [status, setStatus] = useState<"loading" | "streaming" | "done" | "error">(
    "loading",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const startedRef = useRef(false);
  const counterRef = useRef(0);
  const rl = useRateLimitedFetch();

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setFindings([]);
    setStatus("loading");
    setErrorMsg(null);
    counterRef.current = 0;

    (async () => {
      const result = await rl.submit(`/api/compare/${slug1}/${slug2}`, {
        method: "POST",
      });
      if (!result.ok) {
        if ("rateLimited" in result) {
          // Toast surfaces 429; re-arm so an after-countdown retry can fire.
          startedRef.current = false;
          setStatus("loading");
          return;
        }
        if ("aborted" in result) return;
        setErrorMsg(result.error);
        setStatus("error");
        return;
      }
      const { response, signal } = result;
      if (!response.body) {
        setErrorMsg("Празен отговор");
        setStatus("error");
        rl.finish();
        return;
      }
      setStatus("streaming");
      try {
        // JSON-lines decoder — preserved verbatim from the pre-migration
        // implementation. Only the fetch shell changed.
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          if (signal.aborted) break;
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            try {
              const parsed = normalize(JSON.parse(line), counterRef.current);
              if (parsed) {
                counterRef.current++;
                setFindings((prev) => [...prev, parsed]);
              }
            } catch {
              /* incomplete */
            }
          }
        }
        const tail = buffer.trim();
        if (tail) {
          try {
            const parsed = normalize(JSON.parse(tail), counterRef.current);
            if (parsed) {
              counterRef.current++;
              setFindings((prev) => [...prev, parsed]);
            }
          } catch {
            /* ignore */
          }
        }
        setStatus("done");
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStatus("error");
      } finally {
        rl.finish();
      }
    })();
    return () => rl.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug1, slug2]);

  const grouped: Record<Category, Finding[]> = {
    overlap: [],
    conflict: [],
    gap: [],
    hierarchy: [],
  };
  for (const f of findings) grouped[f.category].push(f);

  return (
    <section className="mt-8">
      {/* RATE-LIMIT TOAST (D-04) — above the comparison content. */}
      <RateLimitToast state={rl.rateLimited} onDismiss={rl.dismissRateLimited} />
      {(status === "loading" || (status === "streaming" && findings.length === 0)) && (
        <div className="rounded-lg border border-black/[0.08] bg-white px-5 py-6 text-sm text-black/65 animate-pulse dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-white/65">
          Сравнявам {name1} и {name2}…
        </div>
      )}

      {status === "error" && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-5 py-4 text-red-900 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-200">
          <h3 className="font-semibold">Сравнението не успя</h3>
          <p className="mt-1 text-sm">{errorMsg}</p>
        </div>
      )}

      {findings.length > 0 && (
        <div className="space-y-8">
          {(Object.keys(grouped) as Category[]).map((cat) => {
            const items = grouped[cat];
            if (items.length === 0) return null;
            const meta = CATEGORY_META[cat];
            return (
              <section key={cat}>
                <h2 className="font-serif text-xl font-semibold">
                  <span aria-hidden className="mr-2">
                    {meta.icon}
                  </span>
                  {meta.label}
                  <span className="ml-2 text-sm font-normal text-black/55 dark:text-white/55">
                    ({items.length})
                  </span>
                </h2>
                <ul className="mt-3 space-y-3">
                  {items.map((f) => (
                    <FindingCard
                      key={f.id}
                      finding={f}
                      slug1={slug1}
                      name1={name1}
                      slug2={slug2}
                      name2={name2}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {status === "done" && findings.length === 0 && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-5 py-6 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200">
          Не са открити значими сравнения между двата закона.
        </div>
      )}

      {status === "streaming" && findings.length > 0 && (
        <p className="mt-6 text-xs text-black/55 dark:text-white/55 animate-pulse">
          Сравнението продължава…
        </p>
      )}
    </section>
  );
}

function FindingCard({
  finding,
  slug1,
  name1,
  slug2,
  name2,
}: {
  finding: Finding;
  slug1: string;
  name1: string;
  slug2: string;
  name2: string;
}) {
  const [showQuotes, setShowQuotes] = useState(false);
  const meta = CATEGORY_META[finding.category];
  const hasQuotes = Boolean(finding.quote_law1 || finding.quote_law2);

  return (
    <li className={`rounded-lg border px-5 py-4 ${meta.tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${SEVERITY_BADGE[finding.severity]}`}
        >
          {finding.severity}
        </span>
        <span className="inline-flex items-center rounded-full bg-black/[0.06] px-2.5 py-0.5 text-[11px] font-medium dark:bg-white/[0.08]">
          {meta.icon} {meta.label}
        </span>
      </div>
      <p className="mt-3 text-[0.95rem] leading-relaxed text-black/85 dark:text-white/85">
        {finding.explanation}
      </p>

      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <ArticleColumn
          slug={slug1}
          name={name1}
          articles={finding.law1_articles}
        />
        <ArticleColumn
          slug={slug2}
          name={name2}
          articles={finding.law2_articles}
        />
      </div>

      {hasQuotes && (
        <button
          type="button"
          onClick={() => setShowQuotes((v) => !v)}
          className="mt-4 inline-flex items-center gap-1 rounded-md border border-black/15 bg-white/60 px-2.5 py-1 text-xs text-black/70 hover:bg-white dark:border-white/15 dark:bg-white/[0.05] dark:text-white/75 dark:hover:bg-white/[0.1]"
        >
          {showQuotes ? "▲ Скрий цитати" : "▼ Покажи цитати"}
        </button>
      )}

      {showQuotes && hasQuotes && (
        <div className="mt-3 space-y-2 border-t border-black/10 pt-3 text-sm dark:border-white/10">
          {finding.quote_law1 && (
            <blockquote className="border-l-2 border-current/30 pl-3 italic opacity-90">
              <span className="block text-[11px] uppercase tracking-wide opacity-70 not-italic">
                {name1}
              </span>
              {finding.quote_law1}
            </blockquote>
          )}
          {finding.quote_law2 && (
            <blockquote className="border-l-2 border-current/30 pl-3 italic opacity-90">
              <span className="block text-[11px] uppercase tracking-wide opacity-70 not-italic">
                {name2}
              </span>
              {finding.quote_law2}
            </blockquote>
          )}
        </div>
      )}
    </li>
  );
}

function ArticleColumn({
  slug,
  name,
  articles,
}: {
  slug: string;
  name: string;
  articles: string[];
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide font-semibold text-black/55 dark:text-white/55">
        {name.length > 40 ? name.slice(0, 40) + "…" : name}
      </p>
      {articles.length === 0 ? (
        <p className="mt-1 text-xs text-black/45 dark:text-white/45">—</p>
      ) : (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {articles.map((a) => (
            <a
              key={a}
              href={`/laws/${slug}#art-${a}`}
              className="rounded border border-current/20 bg-white/70 px-2 py-0.5 text-xs font-medium hover:bg-white dark:bg-white/[0.06] dark:hover:bg-white/[0.12]"
            >
              Чл. {a}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
