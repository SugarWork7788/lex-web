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
  id: string;
  type: IssueType;
  severity: Severity;
  explanation: string;
  primary_law_slug: string;
  primary_articles: string[];
  conflicting_law_slug: string | null;
  conflicting_articles: string[];
  quote_primary: string;
  quote_conflicting: string | null;
};

type IssueUpdate = {
  status: "verifying" | "verified" | "skipped" | "error";
  verified?: boolean;
  refined_explanation?: string;
  note?: string;
};

type Phase = { name: string; message: string };

type SearchStats = {
  searched_terms?: number;
  raw_hits?: number;
  unique_articles?: number;
  laws_touched?: number;
};

type SearchProgress = {
  searched_terms?: number;
  queries_done?: number;
  articles_found?: number;
  laws_loaded?: number;
  laws_total_to_load?: number;
};

type Status = "idle" | "streaming" | "done" | "error";

const PHASE_DURATIONS_S: Record<string, number> = {
  concepts: 15,
  search: 10,
  analyze: 75,
  deep_dive: 30,
};

function estimateRemainingSeconds(
  phaseName: string | null,
  cached: boolean,
): number {
  const order = cached
    ? ["analyze", "deep_dive"]
    : ["concepts", "search", "analyze", "deep_dive"];
  if (!phaseName) {
    return order.reduce((s, p) => s + PHASE_DURATIONS_S[p], 0);
  }
  const base = phaseName
    .replace(/_done$/, "")
    .replace(/_progress$/, "")
    .replace(/^cache_hit$/, "analyze");
  const idx = order.indexOf(base);
  if (idx < 0) return 0;
  const phaseSliceFromCurrent = order
    .slice(idx)
    .reduce((s, p) => s + PHASE_DURATIONS_S[p], 0);
  return phaseSliceFromCurrent;
}

function formatMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

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

const PHASE_LABELS: Record<string, string> = {
  concepts: "1 / 4 — Извличане на концепции",
  concepts_done: "1 / 4 — Концепции готови",
  search: "2 / 4 — Търсене в 1240 закона",
  search_done: "2 / 4 — Търсене готово",
  analyze: "3 / 4 — Дълбок анализ",
  analyze_done: "3 / 4 — Анализ готов",
  deep_dive: "4 / 4 — Задълбочен преглед на критичните",
};

function normalizeIssueFromEvent(raw: Record<string, unknown>): Issue | null {
  const sevRaw = typeof raw.severity === "string" ? raw.severity.toLowerCase().trim() : "";
  const severity: Severity =
    sevRaw === "висок" || sevRaw === "среден" || sevRaw === "нисък"
      ? (sevRaw as Severity)
      : "среден";

  const typeRaw = typeof raw.type === "string" ? raw.type.toUpperCase().trim() : "";
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

  const explanation = typeof raw.explanation === "string" ? raw.explanation : "";
  if (!explanation) return null;

  const id = typeof raw.id === "string" ? raw.id : "";
  if (!id) return null;

  const primary_law_slug =
    typeof raw.primary_law_slug === "string" ? raw.primary_law_slug : "";
  const conflictingRaw = raw.conflicting_law_slug;
  const conflicting_law_slug =
    typeof conflictingRaw === "string" && conflictingRaw ? conflictingRaw : null;

  const quote_primary = typeof raw.quote_primary === "string" ? raw.quote_primary : "";
  const quote_conflicting_raw = raw.quote_conflicting;
  const quote_conflicting =
    typeof quote_conflicting_raw === "string" && quote_conflicting_raw
      ? quote_conflicting_raw
      : null;

  return {
    id,
    type,
    severity,
    explanation,
    primary_law_slug,
    primary_articles: toStringArray(raw.primary_articles),
    conflicting_law_slug,
    conflicting_articles: toStringArray(raw.conflicting_articles),
    quote_primary,
    quote_conflicting,
  };
}

function truncateName(name: string, max = 40): string {
  if (name.length <= max) return name;
  return name.slice(0, max - 1) + "…";
}

export function AnalysisStream({
  targetSlug,
  targetName,
}: {
  targetSlug: string;
  targetName: string;
}) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [updates, setUpdates] = useState<Record<string, IssueUpdate>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [lawsMap, setLawsMap] = useState<Record<string, string>>({
    [targetSlug]: targetName,
  });
  const [searchStats, setSearchStats] = useState<SearchStats | null>(null);
  const [searchProgress, setSearchProgress] = useState<SearchProgress | null>(
    null,
  );
  const [usedCache, setUsedCache] = useState(false);
  const [cacheAgeMin, setCacheAgeMin] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [savedAnalysisId, setSavedAnalysisId] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState<string | null>(null);
  const [filter, setFilter] = useState<IssueType | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const startedRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const searchParams = useSearchParams();
  const targetIssueParam = searchParams.get("issue");

  // Open the stream and consume typed events.
  useEffect(() => {
    startedRef.current = false;
  }, [retryToken]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const controller = new AbortController();
    setIssues([]);
    setUpdates({});
    setErrorMsg(null);
    setStatus("streaming");
    setPhase(null);
    setSearchStats(null);
    setSearchProgress(null);
    setUsedCache(false);
    setCacheAgeMin(null);
    setElapsedMs(0);
    setLawsMap({ [targetSlug]: targetName });
    setSavedAnalysisId(null);
    setSaveFailed(null);
    startedAtRef.current = Date.now();

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
        if (!res.body) {
          setErrorMsg("Празен отговор от сървъра");
          setStatus("error");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const handleEvent = (raw: unknown) => {
          if (!raw || typeof raw !== "object") return;
          const ev = raw as Record<string, unknown>;
          const type = ev.event;
          if (type === "phase") {
            const name = String(ev.phase ?? "");
            const message = String(ev.message ?? "");
            setPhase({ name, message });
            if (name === "cache_hit") {
              setUsedCache(true);
              const age = (ev.data as { age_minutes?: number } | undefined)
                ?.age_minutes;
              if (typeof age === "number") setCacheAgeMin(age);
            }
            if (name === "search_progress") {
              const data = ev.data;
              if (data && typeof data === "object") {
                setSearchProgress(data as SearchProgress);
              }
            }
          } else if (type === "laws_map") {
            const map = ev.laws_map;
            if (map && typeof map === "object") {
              setLawsMap((prev) => ({ ...prev, ...(map as Record<string, string>) }));
            }
            if (ev.stats && typeof ev.stats === "object") {
              setSearchStats(ev.stats as SearchStats);
            }
            if (ev.cached === true) setUsedCache(true);
          } else if (type === "issue") {
            const issue = normalizeIssueFromEvent(ev);
            if (issue) setIssues((prev) => [...prev, issue]);
          } else if (type === "issue_update") {
            const id = typeof ev.id === "string" ? ev.id : "";
            if (!id) return;
            setUpdates((prev) => ({
              ...prev,
              [id]: {
                ...(prev[id] ?? { status: "verifying" }),
                status: (ev.status as IssueUpdate["status"]) ?? prev[id]?.status ?? "verifying",
                verified:
                  typeof ev.verified === "boolean" ? ev.verified : prev[id]?.verified,
                refined_explanation:
                  typeof ev.refined_explanation === "string"
                    ? ev.refined_explanation
                    : prev[id]?.refined_explanation,
                note: typeof ev.note === "string" ? ev.note : prev[id]?.note,
              },
            }));
          } else if (type === "saved") {
            const id = typeof ev.analysis_id === "string" ? ev.analysis_id : null;
            if (id) setSavedAnalysisId(id);
          } else if (type === "save_failed") {
            const reason = typeof ev.reason === "string" ? ev.reason : "грешка";
            setSaveFailed(reason);
          } else if (type === "done") {
            setStatus("done");
          } else if (type === "fatal") {
            setErrorMsg(String(ev.message ?? "Неизвестна грешка"));
            setStatus("error");
          }
        };

        const flushLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          try {
            const parsed = JSON.parse(trimmed);
            handleEvent(parsed);
          } catch {
            // incomplete line — wait
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            flushLine(line);
          }
        }
        if (buffer.trim()) flushLine(buffer);

        // If the stream closed without explicit done/fatal, mark done.
        setStatus((s) => (s === "streaming" ? "done" : s));
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    })();

    return () => controller.abort();
  }, [targetSlug, targetName, retryToken]);

  // Live elapsed timer (1 Hz) while streaming.
  useEffect(() => {
    if (status !== "streaming") return;
    const id = setInterval(() => {
      if (startedAtRef.current != null) {
        setElapsedMs(Date.now() - startedAtRef.current);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [status]);

  // Sort + filter for display.
  const grouped = useMemo(() => {
    const filtered = filter ? issues.filter((i) => i.type === filter) : issues;
    return [...filtered].sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
    );
  }, [issues, filter]);

  const counts = useMemo(() => {
    const byType: Record<string, number> = {};
    let high = 0,
      mid = 0,
      low = 0;
    let verified = 0,
      refuted = 0;
    for (const i of issues) {
      byType[i.type] = (byType[i.type] ?? 0) + 1;
      if (i.severity === "висок") high++;
      else if (i.severity === "среден") mid++;
      else low++;
      const u = updates[i.id];
      if (u?.status === "verified") {
        if (u.verified) verified++;
        else refuted++;
      }
    }
    return { high, mid, low, byType, verified, refuted };
  }, [issues, updates]);

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

  const totalAnalyzedLaws = Object.keys(lawsMap).length;
  const showPhaseStrip = status === "streaming" && phase !== null;
  const elapsedS = Math.floor(elapsedMs / 1000);
  const remainingEstimate = estimateRemainingSeconds(
    phase?.name ?? null,
    usedCache,
  );

  return (
    <section className="mt-6 print-area">
      {usedCache && (
        <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200 print:hidden">
          <span aria-hidden>⚡</span>
          Използвам кеширани резултати от по-ранен анализ
          {cacheAgeMin != null && (
            <span className="opacity-70">
              · преди {cacheAgeMin} {cacheAgeMin === 1 ? "минута" : "минути"}
            </span>
          )}
        </div>
      )}

      {savedAnalysisId && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200 print:hidden">
          <span>✓ Анализът е запазен.</span>
          <a href="/issues" className="font-medium underline-offset-2 hover:underline">
            Вижте всички анализи →
          </a>
        </div>
      )}

      {saveFailed && (
        <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200 print:hidden">
          <span aria-hidden>⚠</span>
          Запазването на анализа не успя ({saveFailed}). Резултатите тук са валидни.
        </div>
      )}

      {showPhaseStrip && (
        <PhaseStrip
          phase={phase!}
          stats={searchStats}
          status={status}
          elapsedS={elapsedS}
          remainingEstimateS={remainingEstimate}
          searchProgress={searchProgress}
        />
      )}

      {totalAnalyzedLaws > 1 && (
        <PillsBar
          lawsMap={lawsMap}
          targetSlug={targetSlug}
          stats={searchStats}
        />
      )}

      {issues.length > 0 && (
        <SummaryCard
          counts={counts}
          targetName={targetName}
          analyzedCount={totalAnalyzedLaws}
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

      {status === "streaming" && issues.length === 0 && (
        <LoadingSkeleton message={phase?.message ?? "Подготовка…"} />
      )}

      {grouped.length > 0 && (
        <ul className="mt-6 space-y-4">
          {grouped.map((issue, displayIdx) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              displayIndex={displayIdx}
              targetSlug={targetSlug}
              lawsMap={lawsMap}
              update={updates[issue.id]}
            />
          ))}
        </ul>
      )}

      {status === "done" && issues.length === 0 && (
        <div className="mt-8 rounded-lg border border-emerald-300 bg-emerald-50 px-5 py-6 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200">
          <h3 className="font-serif text-lg font-semibold">
            Не са открити съществени правни проблеми
          </h3>
          <p className="mt-1 text-sm">
            Анализът на {totalAnalyzedLaws} закона не откри значими
            противоречия, конституционни нарушения или правни празнини.
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

function PhaseStrip({
  phase,
  stats,
  status,
  elapsedS,
  remainingEstimateS,
  searchProgress,
}: {
  phase: Phase;
  stats: SearchStats | null;
  status: Status;
  elapsedS: number;
  remainingEstimateS: number;
  searchProgress: SearchProgress | null;
}) {
  const label = PHASE_LABELS[phase.name] ?? phase.message;
  const isActive = !phase.name.endsWith("_done") && status === "streaming";
  const showLiveLawCount =
    phase.name === "search" || phase.name === "search_progress";
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/60 px-4 py-2.5 text-sm dark:border-amber-700/60 dark:bg-amber-950/30 print:hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            isActive ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
          }`}
          aria-hidden
        />
        <strong className="font-semibold text-amber-900 dark:text-amber-200">
          {label}
        </strong>
        <span className="text-amber-800/80 dark:text-amber-200/80">
          {phase.message}
        </span>
        {showLiveLawCount &&
          searchProgress &&
          (searchProgress.laws_loaded ?? 0) > 0 && (
            <span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-800/60 dark:text-amber-100">
              {searchProgress.laws_loaded} закона вече заредени
            </span>
          )}
        {stats && phase.name === "search_done" && (
          <span className="text-xs text-amber-800/70 dark:text-amber-200/70">
            {stats.searched_terms} термина · {stats.unique_articles} статии ·{" "}
            {stats.laws_touched} закона
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-3 text-xs tabular-nums text-amber-900/80 dark:text-amber-100/80">
          <span title="Изминало време">⏱ {formatMMSS(elapsedS)}</span>
          {remainingEstimateS > 0 && (
            <span
              className="opacity-75"
              title="Очаквано оставащо време (приблизително)"
            >
              ~{formatMMSS(Math.max(0, remainingEstimateS - 0))} оставащи
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function PillsBar({
  lawsMap,
  targetSlug,
  stats,
}: {
  lawsMap: Record<string, string>;
  targetSlug: string;
  stats: SearchStats | null;
}) {
  const constitutionSlug = "konstitutsiya-na-republika-balgariya";
  const slugs = Object.keys(lawsMap);
  const target = lawsMap[targetSlug];
  const constitution = lawsMap[constitutionSlug];
  const others = slugs.filter(
    (s) => s !== targetSlug && s !== constitutionSlug,
  );

  return (
    <section className="mt-4 print:hidden">
      <h2 className="text-xs uppercase tracking-wider font-medium text-black/55 dark:text-white/55">
        Анализирани закони ({slugs.length})
        {stats && ` — намерени чрез full-text search в 1240 закона`}
      </h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {target && (
          <PillLink
            slug={targetSlug}
            label={target}
            icon="★"
            tone="target"
          />
        )}
        {constitution && constitutionSlug !== targetSlug && (
          <PillLink
            slug={constitutionSlug}
            label={constitution}
            icon="⚖"
            tone="constitution"
          />
        )}
        {others.map((s) => (
          <PillLink key={s} slug={s} label={lawsMap[s]} tone="ref" />
        ))}
      </div>
    </section>
  );
}

function PillLink({
  slug,
  label,
  icon,
  tone,
}: {
  slug: string;
  label: string;
  icon?: string;
  tone: "target" | "constitution" | "ref";
}) {
  const truncated = label.length > 48 ? label.slice(0, 46) + "…" : label;
  const toneClass =
    tone === "target"
      ? "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-600/60 dark:bg-amber-950/40 dark:text-amber-200"
      : tone === "constitution"
        ? "border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-700/60 dark:bg-indigo-950/40 dark:text-indigo-200"
        : "border-black/10 bg-white text-black/75 hover:bg-black/[0.03] dark:border-white/15 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.06]";
  return (
    <a
      href={`/laws/${slug}`}
      title={label}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${toneClass}`}
    >
      {icon && <span aria-hidden>{icon}</span>}
      <span>{truncated}</span>
    </a>
  );
}

function SummaryCard({
  counts,
  targetName,
  analyzedCount,
  status,
}: {
  counts: {
    high: number;
    mid: number;
    low: number;
    verified: number;
    refuted: number;
  };
  targetName: string;
  analyzedCount: number;
  status: Status;
}) {
  const total = counts.high + counts.mid + counts.low;
  return (
    <div className="mt-5 rounded-lg border border-black/[0.08] bg-white px-5 py-4 dark:border-white/[0.1] dark:bg-white/[0.03] print:border-black">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold">
          Открити {total} {total === 1 ? "проблем" : "проблема"}
        </h2>
        <span className="text-xs text-black/55 dark:text-white/55 print:hidden">
          {status === "done" ? "Анализът завършен" : "Анализът продължава…"}
        </span>
      </div>
      <p className="mt-1 text-sm text-black/65 dark:text-white/65">
        В {targetName} спрямо {analyzedCount - 1} други нормативни акта.
      </p>
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <SummaryStat n={counts.high} label="критични" tone="red" />
        <SummaryStat n={counts.mid} label="средни" tone="orange" />
        <SummaryStat n={counts.low} label="ниски" tone="yellow" />
        {(counts.verified > 0 || counts.refuted > 0) && (
          <span className="ml-auto text-xs text-black/55 dark:text-white/55">
            Задълбочен преглед: {counts.verified} потвърдени,{" "}
            {counts.refuted} опровергани
          </span>
        )}
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
  displayIndex,
  targetSlug,
  lawsMap,
  update,
}: {
  issue: Issue;
  displayIndex: number;
  targetSlug: string;
  lawsMap: Record<string, string>;
  update?: IssueUpdate;
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

  const isVerifying = update?.status === "verifying";
  const isVerified = update?.status === "verified";
  const verifiedTrue = isVerified && update.verified === true;
  const verifiedFalse = isVerified && update.verified === false;
  const showRefined = isVerified && Boolean(update.refined_explanation);

  return (
    <li
      id={`issue-${displayIndex}`}
      className={`rounded-lg border px-5 py-4 transition-shadow ${SEVERITY_CARD[issue.severity]} print:break-inside-avoid ${
        verifiedFalse ? "opacity-80" : ""
      }`}
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
        {isVerifying && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-700/60 dark:text-amber-100 print:hidden">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-700 dark:bg-amber-200" />
            Задълбочен преглед…
          </span>
        )}
        {verifiedTrue && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-900 dark:bg-emerald-700/60 dark:text-emerald-100">
            ✓ Потвърден от задълбочен анализ
          </span>
        )}
        {verifiedFalse && (
          <span className="inline-flex items-center gap-1 rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-medium text-stone-800 dark:bg-stone-700/70 dark:text-stone-100">
            ⚠ Опровергано при пълен прочит
          </span>
        )}
        {update?.status === "skipped" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-medium text-stone-800 dark:bg-stone-700/70 dark:text-stone-100 print:hidden">
            Прегледът е пропуснат
          </span>
        )}
        {update?.status === "error" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-200 px-2 py-0.5 text-[11px] font-medium text-red-800 dark:bg-red-800/60 dark:text-red-100 print:hidden">
            Прегледът не успя
          </span>
        )}
        <span className="ml-auto text-[11px] text-black/45 dark:text-white/45 print:hidden">
          #{displayIndex + 1}
        </span>
      </div>

      <p className="mt-3 text-[0.95rem] leading-relaxed text-black/85 dark:text-white/85">
        {showRefined ? update!.refined_explanation : issue.explanation}
      </p>

      {showRefined && (
        <p className="mt-1 text-[11px] uppercase tracking-wide text-black/45 dark:text-white/45 print:hidden">
          Обяснението е допълнено след задълбочен преглед на пълните текстове на
          двата закона.
        </p>
      )}

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
