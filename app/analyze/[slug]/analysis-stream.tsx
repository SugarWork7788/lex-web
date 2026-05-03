"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type Severity = "нисък" | "среден" | "висок";

const ALL_TYPES = [
  "КОНСТИТУЦИОННО НАРУШЕНИЕ",
  "КОНФЛИКТ МЕЖДУ ЗАКОНИ",
  "НАДХВЪРЛЯНЕ НА ПРАВОМОЩИЯ",
  "ВЪТРЕШНО ПРОТИВОРЕЧИЕ",
  "МЪРТВА ПРЕПРАТКА",
  "ПРАВНА ПРАЗНИНА",
  "НЕЯСНА ФОРМУЛИРОВКА",
] as const;

type IssueType = (typeof ALL_TYPES)[number];

type Issue = {
  type: IssueType;
  severity: Severity;
  explanation: string;
  primary_law_slug: string;
  primary_articles: string[];
  conflicting_law_slug: string | null;
  conflicting_articles: string[];
  quote_primary: string;
  quote_conflicting: string | null;
  _error?: boolean;
};

type Status = "loading" | "streaming" | "done" | "error";

const SEVERITY_ORDER: Record<Severity, number> = {
  висок: 0,
  среден: 1,
  нисък: 2,
};

const SEVERITY_LABEL: Record<Severity, string> = {
  висок: "Висок",
  среден: "Среден",
  нисък: "Нисък",
};

const SEVERITY_CARD: Record<Severity, string> = {
  висок:
    "border-red-300 bg-red-50/70 dark:border-red-800/60 dark:bg-red-950/30",
  среден:
    "border-orange-300 bg-orange-50/70 dark:border-orange-800/60 dark:bg-orange-950/30",
  нисък:
    "border-yellow-300 bg-yellow-50/70 dark:border-yellow-800/60 dark:bg-yellow-950/30",
};

const SEVERITY_BADGE: Record<Severity, string> = {
  висок: "bg-red-700 text-white dark:bg-red-500/90",
  среден: "bg-orange-600 text-white dark:bg-orange-500/90",
  нисък: "bg-yellow-500 text-yellow-950 dark:bg-yellow-400/90",
};

const TYPE_BADGE_TONE: Record<IssueType, string> = {
  "КОНСТИТУЦИОННО НАРУШЕНИЕ":
    "bg-indigo-100 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-200",
  "КОНФЛИКТ МЕЖДУ ЗАКОНИ":
    "bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200",
  "НАДХВЪРЛЯНЕ НА ПРАВОМОЩИЯ":
    "bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-950/60 dark:text-fuchsia-200",
  "ВЪТРЕШНО ПРОТИВОРЕЧИЕ":
    "bg-teal-100 text-teal-900 dark:bg-teal-950/60 dark:text-teal-200",
  "МЪРТВА ПРЕПРАТКА":
    "bg-stone-200 text-stone-900 dark:bg-stone-800/70 dark:text-stone-200",
  "ПРАВНА ПРАЗНИНА":
    "bg-sky-100 text-sky-900 dark:bg-sky-950/60 dark:text-sky-200",
  "НЕЯСНА ФОРМУЛИРОВКА":
    "bg-lime-100 text-lime-900 dark:bg-lime-950/60 dark:text-lime-200",
};

const PROGRESS_MESSAGES = [
  "Проверявам за конституционни нарушения…",
  "Търся конфликти между закони…",
  "Проверявам препратките…",
  "Идентифицирам правни празнини…",
];

function normalizeIssue(raw: unknown): Issue | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const sevRaw = typeof o.severity === "string" ? o.severity.toLowerCase().trim() : "";
  const severity: Severity =
    sevRaw === "висок" || sevRaw === "среден" || sevRaw === "нисък"
      ? (sevRaw as Severity)
      : "среден";

  const typeRaw = typeof o.type === "string" ? o.type.toUpperCase().trim() : "";
  const type: IssueType =
    (ALL_TYPES as readonly string[]).includes(typeRaw)
      ? (typeRaw as IssueType)
      : "НЕЯСНА ФОРМУЛИРОВКА";

  const toStringArray = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
    if (typeof v === "string")
      return v
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    return [];
  };

  const explanation = typeof o.explanation === "string" ? o.explanation : "";
  if (!explanation) return null;

  const primary_law_slug =
    typeof o.primary_law_slug === "string" ? o.primary_law_slug : "";
  const conflicting_law_slug_raw = o.conflicting_law_slug;
  const conflicting_law_slug =
    typeof conflicting_law_slug_raw === "string" && conflicting_law_slug_raw
      ? conflicting_law_slug_raw
      : null;

  const quote_primary = typeof o.quote_primary === "string" ? o.quote_primary : "";
  const quote_conflicting_raw = o.quote_conflicting;
  const quote_conflicting =
    typeof quote_conflicting_raw === "string" && quote_conflicting_raw
      ? quote_conflicting_raw
      : null;

  return {
    type,
    severity,
    explanation,
    primary_law_slug,
    primary_articles: toStringArray(o.primary_articles),
    conflicting_law_slug,
    conflicting_articles: toStringArray(o.conflicting_articles),
    quote_primary,
    quote_conflicting,
    _error: o._error === true,
  };
}

function truncateName(name: string, max = 40): string {
  if (name.length <= max) return name;
  return name.slice(0, max - 1) + "…";
}

export function AnalysisStream({
  targetSlug,
  targetName,
  initialLawsMap,
  analyzedCount,
}: {
  targetSlug: string;
  targetName: string;
  initialLawsMap: Record<string, string>;
  analyzedCount: number;
}) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lawsMap, setLawsMap] = useState<Record<string, string>>(initialLawsMap);
  const [filter, setFilter] = useState<IssueType | null>(null);
  const [progressIdx, setProgressIdx] = useState(0);
  const [retryToken, setRetryToken] = useState(0);
  const startedRef = useRef(false);
  const searchParams = useSearchParams();
  const targetIssueParam = searchParams.get("issue");

  // Cycle progress messages while loading.
  useEffect(() => {
    if (status !== "loading" && status !== "streaming") return;
    if (issues.length > 0) return;
    const id = setInterval(
      () => setProgressIdx((i) => (i + 1) % PROGRESS_MESSAGES.length),
      2500,
    );
    return () => clearInterval(id);
  }, [status, issues.length]);

  // Open the stream and consume.
  useEffect(() => {
    startedRef.current = false;
  }, [retryToken]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const controller = new AbortController();
    setIssues([]);
    setErrorMsg(null);
    setStatus("loading");
    setLawsMap(initialLawsMap);

    (async () => {
      try {
        const res = await fetch(`/api/analyze/${targetSlug}`, {
          method: "POST",
          signal: controller.signal,
        });
        if (!res.ok) {
          const text = await res.text();
          setErrorMsg(text || `HTTP ${res.status}`);
          setStatus("error");
          return;
        }

        const headerMap = res.headers.get("X-Laws-Map");
        if (headerMap) {
          try {
            const parsed = JSON.parse(decodeURIComponent(headerMap));
            if (parsed && typeof parsed === "object")
              setLawsMap((prev) => ({ ...prev, ...parsed }));
          } catch {
            // header missing/garbled — keep server-provided map
          }
        }

        if (!res.body) {
          setErrorMsg("Празен отговор от сървъра");
          setStatus("error");
          return;
        }

        setStatus("streaming");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            try {
              const parsed = normalizeIssue(JSON.parse(line));
              if (parsed) setIssues((prev) => [...prev, parsed]);
            } catch {
              // Incomplete line — wait for more bytes.
            }
          }
        }

        const tail = buffer.trim();
        if (tail) {
          try {
            const parsed = normalizeIssue(JSON.parse(tail));
            if (parsed) setIssues((prev) => [...prev, parsed]);
          } catch {
            // ignore
          }
        }

        setStatus("done");
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    })();

    return () => controller.abort();
  }, [targetSlug, initialLawsMap, retryToken]);

  // Group + sort + filter.
  const grouped = useMemo(() => {
    const filtered = filter ? issues.filter((i) => i.type === filter) : issues;
    const sorted = [...filtered].sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
    );
    return sorted;
  }, [issues, filter]);

  const counts = useMemo(() => {
    const byType: Record<string, number> = {};
    let high = 0,
      mid = 0,
      low = 0;
    for (const i of issues) {
      byType[i.type] = (byType[i.type] ?? 0) + 1;
      if (i.severity === "висок") high++;
      else if (i.severity === "среден") mid++;
      else low++;
    }
    return { high, mid, low, byType };
  }, [issues]);

  // Scroll to ?issue=N once results have loaded.
  useEffect(() => {
    if (!targetIssueParam) return;
    const idx = Number(targetIssueParam);
    if (!Number.isFinite(idx)) return;
    if (grouped.length <= idx) return;
    const el = document.getElementById(`issue-${idx}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-amber-500");
    const t = setTimeout(
      () => el.classList.remove("ring-2", "ring-amber-500"),
      2400,
    );
    return () => clearTimeout(t);
  }, [targetIssueParam, grouped.length]);

  return (
    <section className="mt-8 print-area">
      {issues.length > 0 && (
        <SummaryCard
          counts={counts}
          targetName={targetName}
          analyzedCount={analyzedCount}
          status={status}
        />
      )}

      {issues.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2 print:hidden">
          <FilterPill
            label={`Всички (${issues.length})`}
            active={filter === null}
            onClick={() => setFilter(null)}
          />
          {ALL_TYPES.filter((t) => counts.byType[t] > 0).map((t) => (
            <FilterPill
              key={t}
              label={`${t} (${counts.byType[t]})`}
              active={filter === t}
              onClick={() => setFilter(filter === t ? null : t)}
            />
          ))}
          <button
            type="button"
            onClick={() => window.print()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-black/15 bg-white px-3 py-1 text-xs text-black/70 hover:bg-black/[0.04] dark:border-white/20 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]"
          >
            🖨 Принтирай / PDF
          </button>
        </div>
      )}

      {(status === "loading" ||
        (status === "streaming" && issues.length === 0)) && (
        <LoadingSkeleton
          message={
            status === "loading"
              ? `Анализирам ${analyzedCount} закона…`
              : PROGRESS_MESSAGES[progressIdx]
          }
        />
      )}

      {grouped.length > 0 && (
        <ul className="mt-6 space-y-4">
          {grouped.map((issue, displayIdx) => {
            const issueIdx = issues.indexOf(issue);
            return (
              <IssueCard
                key={issueIdx}
                issue={issue}
                index={issueIdx}
                displayIndex={displayIdx}
                targetSlug={targetSlug}
                lawsMap={lawsMap}
              />
            );
          })}
        </ul>
      )}

      {status === "streaming" && issues.length > 0 && (
        <p className="mt-6 text-xs text-black/55 dark:text-white/55 animate-pulse print:hidden">
          {PROGRESS_MESSAGES[progressIdx]}
        </p>
      )}

      {status === "done" && issues.length === 0 && (
        <div className="mt-8 rounded-lg border border-emerald-300 bg-emerald-50 px-5 py-6 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200">
          <h3 className="font-serif text-lg font-semibold">
            Не са открити съществени правни проблеми
          </h3>
          <p className="mt-1 text-sm">
            Анализът на {analyzedCount} закона не откри значими противоречия,
            конституционни нарушения или правни празнини.
          </p>
        </div>
      )}

      {status === "error" && (
        <div className="mt-6 rounded-lg border border-red-300 bg-red-50 px-5 py-4 text-red-900 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-200">
          <h3 className="font-semibold">Анализът не успя</h3>
          <p className="mt-1 text-sm">{errorMsg}</p>
          <button
            type="button"
            onClick={() => setRetryToken((n) => n + 1)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-red-400 bg-white px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100 dark:border-red-700 dark:bg-red-950 dark:text-red-100 dark:hover:bg-red-900"
          >
            ↻ Опитай отново
          </button>
        </div>
      )}
    </section>
  );
}

function SummaryCard({
  counts,
  targetName,
  analyzedCount,
  status,
}: {
  counts: { high: number; mid: number; low: number };
  targetName: string;
  analyzedCount: number;
  status: Status;
}) {
  const total = counts.high + counts.mid + counts.low;
  return (
    <div className="rounded-lg border border-black/[0.08] bg-white px-5 py-4 dark:border-white/[0.1] dark:bg-white/[0.03] print:border-black">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold">
          Открити {total} {total === 1 ? "проблем" : "проблема"}
        </h2>
        <span className="text-xs text-black/55 dark:text-white/55 print:hidden">
          {status === "done" ? "Анализът завършен" : "Анализът продължава…"}
        </span>
      </div>
      <p className="mt-1 text-sm text-black/65 dark:text-white/65">
        В {targetName} и {analyzedCount - 1} свързани акта.
      </p>
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <SummaryStat n={counts.high} label="критични" tone="red" />
        <SummaryStat n={counts.mid} label="средни" tone="orange" />
        <SummaryStat n={counts.low} label="ниски" tone="yellow" />
      </div>
    </div>
  );
}

function SummaryStat({
  n,
  label,
  tone,
}: {
  n: number;
  label: string;
  tone: "red" | "orange" | "yellow";
}) {
  const dot =
    tone === "red"
      ? "bg-red-600"
      : tone === "orange"
        ? "bg-orange-500"
        : "bg-yellow-400";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden />
      <strong className="font-semibold">{n}</strong>
      <span className="text-black/65 dark:text-white/65">{label}</span>
    </span>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? "border-amber-500 bg-amber-100 text-amber-900 dark:border-amber-500 dark:bg-amber-900/40 dark:text-amber-100"
          : "border-black/15 bg-white text-black/70 hover:bg-black/[0.04] dark:border-white/15 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]"
      }`}
    >
      {label}
    </button>
  );
}

function LoadingSkeleton({ message }: { message: string }) {
  return (
    <div className="mt-6 print:hidden">
      <p className="text-sm text-black/65 dark:text-white/65 animate-pulse">
        {message}
      </p>
      <div className="mt-4 space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-lg border border-black/[0.08] bg-black/[0.03] dark:border-white/[0.08] dark:bg-white/[0.04]"
          />
        ))}
      </div>
    </div>
  );
}

function IssueCard({
  issue,
  index,
  displayIndex,
  targetSlug,
  lawsMap,
}: {
  issue: Issue;
  index: number;
  displayIndex: number;
  targetSlug: string;
  lawsMap: Record<string, string>;
}) {
  const [showQuotes, setShowQuotes] = useState(false);
  const [copied, setCopied] = useState(false);

  const primaryLawName =
    lawsMap[issue.primary_law_slug] ?? issue.primary_law_slug;
  const conflictingLawName = issue.conflicting_law_slug
    ? (lawsMap[issue.conflicting_law_slug] ?? issue.conflicting_law_slug)
    : null;

  const hasQuotes = Boolean(issue.quote_primary || issue.quote_conflicting);

  const handleShare = async () => {
    const url = `${window.location.origin}/analyze/${targetSlug}?issue=${displayIndex}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore — clipboard unavailable
    }
  };

  return (
    <li
      id={`issue-${displayIndex}`}
      className={`rounded-lg border px-5 py-4 transition-shadow ${SEVERITY_CARD[issue.severity]} print:break-inside-avoid`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${SEVERITY_BADGE[issue.severity]}`}
        >
          {SEVERITY_LABEL[issue.severity]}
        </span>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${TYPE_BADGE_TONE[issue.type]}`}
        >
          {issue.type}
        </span>
        <span className="ml-auto text-[11px] text-black/45 dark:text-white/45 print:hidden">
          #{displayIndex + 1}
        </span>
      </div>

      <p className="mt-3 text-[0.95rem] leading-relaxed text-black/85 dark:text-white/85">
        {issue.explanation}
      </p>

      {issue.primary_articles.length > 0 && (
        <ArticleRow
          label="Засегнати членове"
          lawSlug={issue.primary_law_slug}
          lawName={primaryLawName}
          articles={issue.primary_articles}
        />
      )}

      {issue.conflicting_law_slug && issue.conflicting_articles.length > 0 && (
        <ArticleRow
          label="Конфликт с"
          lawSlug={issue.conflicting_law_slug}
          lawName={conflictingLawName ?? issue.conflicting_law_slug}
          articles={issue.conflicting_articles}
        />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 print:hidden">
        {hasQuotes && (
          <button
            type="button"
            onClick={() => setShowQuotes((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-black/15 bg-white/60 px-2.5 py-1 text-xs text-black/70 hover:bg-white dark:border-white/15 dark:bg-white/[0.05] dark:text-white/75 dark:hover:bg-white/[0.1]"
          >
            <span aria-hidden>{showQuotes ? "▲" : "▼"}</span>
            {showQuotes ? "Скрий цитати" : "Покажи цитати"}
          </button>
        )}
        <button
          type="button"
          onClick={handleShare}
          className="inline-flex items-center gap-1 rounded-md border border-black/15 bg-white/60 px-2.5 py-1 text-xs text-black/70 hover:bg-white dark:border-white/15 dark:bg-white/[0.05] dark:text-white/75 dark:hover:bg-white/[0.1]"
          title="Копирай линк към този проблем"
        >
          {copied ? "✓ Копирано" : "🔗 Сподели"}
        </button>
      </div>

      {showQuotes && hasQuotes && (
        <div className="mt-3 space-y-2 border-t border-black/10 pt-3 text-sm dark:border-white/10">
          {issue.quote_primary && (
            <blockquote className="border-l-2 border-current/30 pl-3 italic opacity-90">
              <span className="block text-[11px] uppercase tracking-wide opacity-70 not-italic">
                {truncateName(primaryLawName)}
              </span>
              {issue.quote_primary}
            </blockquote>
          )}
          {issue.quote_conflicting && conflictingLawName && (
            <blockquote className="border-l-2 border-current/30 pl-3 italic opacity-90">
              <span className="block text-[11px] uppercase tracking-wide opacity-70 not-italic">
                {truncateName(conflictingLawName)}
              </span>
              {issue.quote_conflicting}
            </blockquote>
          )}
        </div>
      )}

      {/* Print-only quotes always visible */}
      {hasQuotes && (
        <div className="mt-3 hidden space-y-2 border-t border-black pt-3 text-sm print:block">
          {issue.quote_primary && (
            <blockquote className="border-l-2 border-black pl-3 italic">
              <span className="block text-[11px] uppercase tracking-wide not-italic">
                {primaryLawName}
              </span>
              {issue.quote_primary}
            </blockquote>
          )}
          {issue.quote_conflicting && conflictingLawName && (
            <blockquote className="border-l-2 border-black pl-3 italic">
              <span className="block text-[11px] uppercase tracking-wide not-italic">
                {conflictingLawName}
              </span>
              {issue.quote_conflicting}
            </blockquote>
          )}
        </div>
      )}
    </li>
  );
}

function ArticleRow({
  label,
  lawSlug,
  lawName,
  articles,
}: {
  label: string;
  lawSlug: string;
  lawName: string;
  articles: string[];
}) {
  return (
    <div className="mt-3 text-sm">
      <p className="text-[11px] uppercase tracking-wide font-semibold text-black/55 dark:text-white/55">
        {label}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <a
          href={`/laws/${lawSlug}`}
          title={lawName}
          className="font-medium text-black/85 hover:underline dark:text-white/85"
        >
          {truncateName(lawName)}
        </a>
        <span className="text-black/40 dark:text-white/40">→</span>
        <div className="flex flex-wrap gap-1.5">
          {articles.map((a) => (
            <a
              key={a}
              href={`/laws/${lawSlug}#art-${a}`}
              className="inline-flex items-center rounded-md border border-current/20 bg-white/70 px-2 py-0.5 text-xs font-medium hover:bg-white dark:bg-white/[0.06] dark:hover:bg-white/[0.12]"
            >
              Чл. {a}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
