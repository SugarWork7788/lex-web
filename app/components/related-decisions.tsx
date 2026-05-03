"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Decision = {
  id: string;
  court: string;
  court_code: string;
  act_type: string | null;
  case_number: string | null;
  decision_number: string | null;
  decision_date: string | null;
  year: number | null;
  title: string | null;
  source_url: string;
};

const COURT_BADGE: Record<string, { label: string; tone: string }> = {
  CC: {
    label: "КС",
    tone: "bg-rose-600 text-white dark:bg-rose-500/90",
  },
  SC: {
    label: "ВКС",
    tone: "bg-indigo-600 text-white dark:bg-indigo-500/90",
  },
  SA: {
    label: "ВАС",
    tone: "bg-teal-600 text-white dark:bg-teal-500/90",
  },
};

const COURT_SLUG: Record<string, string> = {
  CC: "ks",
  SC: "vks",
  SA: "vas",
};

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export function RelatedDecisions({ slug }: { slug: string }) {
  const [items, setItems] = useState<Decision[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/courts/related?slug=${encodeURIComponent(slug)}&limit=6`,
        );
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          setLoading(false);
          return;
        }
        const data = (await res.json()) as Decision[];
        if (!cancelled) {
          setItems(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) return <SkeletonAside />;
  if (error) return null;
  if (!items || items.length === 0) return null;

  return (
    <aside className="mt-12 rounded-lg border border-black/[0.08] bg-black/[0.02] px-5 py-5 dark:border-white/[0.1] dark:bg-white/[0.02] print:hidden">
      <header className="mb-4">
        <h2 className="font-serif text-xl font-semibold tracking-tight">
          Съдебна практика по този закон
        </h2>
        <p className="mt-1 text-xs text-black/55 dark:text-white/55">
          Решения на ВКС, ВАС и КС, цитиращи този закон
        </p>
      </header>

      <ul className="space-y-2.5">
        {items.map((d) => {
          const courtSlug = COURT_SLUG[d.court_code] ?? "ks";
          const badge = COURT_BADGE[d.court_code] ?? COURT_BADGE.CC;
          const titleText =
            d.title || d.decision_number || d.case_number || "Решение";
          const meta: string[] = [];
          if (d.act_type) meta.push(d.act_type);
          if (d.decision_date) meta.push(d.decision_date.slice(0, 10));
          return (
            <li key={d.id}>
              <Link
                href={`/courts/${courtSlug}/${d.id}`}
                className="block rounded-md border border-black/[0.06] bg-white px-3 py-2.5 text-sm hover:border-black/15 hover:bg-black/[0.02] dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:border-white/20 dark:hover:bg-white/[0.06]"
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${badge.tone}`}
                  >
                    {badge.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="leading-snug text-black/85 dark:text-white/85">
                      {truncate(titleText, 100)}
                    </p>
                    {meta.length > 0 && (
                      <p className="mt-0.5 text-[11px] text-black/50 dark:text-white/50">
                        {meta.join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 text-right">
        <Link
          href="/courts"
          className="text-xs text-amber-700 hover:underline dark:text-amber-400"
        >
          Виж всички решения →
        </Link>
      </div>
    </aside>
  );
}

function SkeletonAside() {
  return (
    <aside className="mt-12 rounded-lg border border-black/[0.08] bg-black/[0.02] px-5 py-5 dark:border-white/[0.1] dark:bg-white/[0.02] print:hidden">
      <div className="mb-4 h-5 w-64 animate-pulse rounded bg-black/[0.08] dark:bg-white/[0.08]" />
      <ul className="space-y-2.5">
        {[0, 1, 2].map((i) => (
          <li key={i}>
            <div className="rounded-md border border-black/[0.06] bg-white px-3 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.04]">
              <div className="flex items-start gap-2">
                <div className="mt-0.5 h-4 w-7 shrink-0 animate-pulse rounded-full bg-black/[0.08] dark:bg-white/[0.08]" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-11/12 animate-pulse rounded bg-black/[0.06] dark:bg-white/[0.06]" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.05]" />
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
