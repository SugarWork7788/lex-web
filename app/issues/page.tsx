import Link from "next/link";
import {
  listStoredIssues,
  getIssuesSummary,
  getProblematicLawsLeaderboard,
  getDistinctIssueTypes,
  type IssueListFilters,
  type IssueListItem,
} from "@/lib/queries";
import type { Severity } from "@/lib/supabase";
import { IssueChatButton } from "./issue-chat-button";

export const revalidate = 300;

const PAGE_SIZE = 50;

const SEVERITY_LABEL: Record<Severity, string> = {
  висок: "Висок",
  среден: "Среден",
  нисък: "Нисък",
};

const SEVERITY_BADGE: Record<Severity, string> = {
  висок: "bg-red-700 text-white dark:bg-red-500/90",
  среден: "bg-orange-600 text-white dark:bg-orange-500/90",
  нисък: "bg-yellow-500 text-yellow-950 dark:bg-yellow-400/90",
};

const SEVERITY_CARD: Record<Severity, string> = {
  висок: "border-red-300 bg-red-50/60 dark:border-red-800/60 dark:bg-red-950/20",
  среден:
    "border-orange-300 bg-orange-50/60 dark:border-orange-800/60 dark:bg-orange-950/20",
  нисък:
    "border-yellow-300 bg-yellow-50/60 dark:border-yellow-800/60 dark:bg-yellow-950/20",
};

type Props = {
  searchParams: Promise<{
    severity?: string;
    type?: string;
    law?: string;
    verified?: string;
    page?: string;
    sort?: string;
  }>;
};

export const metadata = {
  title: "Открити правни проблеми • lex.bg",
  description:
    "Всички правни проблеми, открити от AI анализа на 1240 български закона.",
};

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function buildHref(
  base: { severity?: string; type?: string; law?: string; verified?: string; sort?: string; page?: string },
  patch: Record<string, string | undefined>,
): string {
  const merged = { ...base, ...patch };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v != null && v !== "") params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/issues?${qs}` : "/issues";
}

export default async function IssuesPage({ searchParams }: Props) {
  const sp = await searchParams;

  const sevParam = (sp.severity as Severity) ?? undefined;
  const validSev: Severity | undefined =
    sevParam === "висок" || sevParam === "среден" || sevParam === "нисък"
      ? sevParam
      : undefined;

  const filters: IssueListFilters = {
    severity: validSev,
    type: sp.type || undefined,
    law: sp.law || undefined,
    verified: sp.verified === "true" ? true : undefined,
  };
  const sort = sp.sort === "date" ? "date" : sp.sort === "type" ? "type" : "severity";
  const page = Math.max(0, Number(sp.page) || 0);

  const [list, summary, leaderboard, types] = await Promise.all([
    listStoredIssues(filters, page, PAGE_SIZE, sort),
    getIssuesSummary(),
    getProblematicLawsLeaderboard(10),
    getDistinctIssueTypes(),
  ]);

  const totalPages = Math.max(1, Math.ceil(list.totalCount / PAGE_SIZE));
  const baseParams = {
    severity: sp.severity,
    type: sp.type,
    law: sp.law,
    verified: sp.verified,
    sort: sp.sort,
  };
  const filterCount =
    (filters.severity ? 1 : 0) +
    (filters.type ? 1 : 0) +
    (filters.law ? 1 : 0) +
    (filters.verified ? 1 : 0);

  return (
    <article className="mx-auto max-w-6xl px-6 py-10">
      <header className="border-b border-black/[0.08] dark:border-white/[0.08] pb-6">
        <p className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400 font-medium">
          AI анализ
        </p>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-semibold tracking-tight">
          Открити правни проблеми
        </h1>
        <p className="mt-3 text-sm text-black/60 dark:text-white/60">
          Всички проблеми, намерени от AI анализа на 1240 български закона.
          Резултатите са ориентировъчни.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <SummaryStat n={summary.totalIssues} label="общо проблеми" />
          <SummaryStat n={summary.totalAnalyses} label="изпълнени анализа" />
          <SummaryStat n={summary.lawsAnalyzed} label="анализирани закона" />
        </div>
      </header>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_280px]">
        <section>
          <FilterBar
            filters={filters}
            sort={sort}
            types={types}
            base={baseParams}
            filterCount={filterCount}
          />

          {list.items.length === 0 ? (
            <EmptyState filterCount={filterCount} />
          ) : (
            <ul className="mt-6 space-y-4">
              {list.items.map((issue) => (
                <IssueRow key={issue.id} issue={issue} />
              ))}
            </ul>
          )}

          {list.totalCount > PAGE_SIZE && (
            <Pagination
              page={page}
              totalPages={totalPages}
              base={{ ...baseParams }}
            />
          )}
        </section>

        <aside>
          <Leaderboard items={leaderboard} />
        </aside>
      </div>
    </article>
  );
}

function SummaryStat({ n, label }: { n: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <strong className="font-semibold tabular-nums">{n.toLocaleString("bg-BG")}</strong>
      <span className="text-black/60 dark:text-white/60">{label}</span>
    </span>
  );
}

function FilterBar({
  filters,
  sort,
  types,
  base,
  filterCount,
}: {
  filters: IssueListFilters;
  sort: string;
  types: string[];
  base: Record<string, string | undefined>;
  filterCount: number;
}) {
  const Sev = ({ v, label }: { v: "висок" | "среден" | "нисък"; label: string }) => {
    const active = filters.severity === v;
    return (
      <Link
        href={buildHref(base, { severity: active ? undefined : v, page: undefined })}
        className={`rounded-full border px-3 py-1 text-xs ${
          active
            ? "border-amber-500 bg-amber-100 text-amber-900 dark:border-amber-500 dark:bg-amber-900/40 dark:text-amber-100"
            : "border-black/15 bg-white text-black/70 hover:bg-black/[0.04] dark:border-white/15 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide font-medium text-black/55 dark:text-white/55">
          Сериозност:
        </span>
        <Sev v="висок" label="Висок" />
        <Sev v="среден" label="Среден" />
        <Sev v="нисък" label="Нисък" />
      </div>

      {types.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide font-medium text-black/55 dark:text-white/55">
            Тип:
          </span>
          {types.map((t) => {
            const active = filters.type === t;
            return (
              <Link
                key={t}
                href={buildHref(base, { type: active ? undefined : t, page: undefined })}
                className={`rounded-full border px-3 py-1 text-[11px] ${
                  active
                    ? "border-amber-500 bg-amber-100 text-amber-900 dark:border-amber-500 dark:bg-amber-900/40 dark:text-amber-100"
                    : "border-black/15 bg-white text-black/70 hover:bg-black/[0.04] dark:border-white/15 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]"
                }`}
              >
                {t}
              </Link>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide font-medium text-black/55 dark:text-white/55">
          Подредба:
        </span>
        {(["severity", "date", "type"] as const).map((s) => {
          const labels: Record<typeof s, string> = {
            severity: "По сериозност",
            date: "По дата",
            type: "По тип",
          };
          const active = sort === s;
          return (
            <Link
              key={s}
              href={buildHref(base, {
                sort: s === "severity" ? undefined : s,
                page: undefined,
              })}
              className={`rounded-full border px-3 py-1 text-xs ${
                active
                  ? "border-black/30 bg-black/[0.05] text-black/85 dark:border-white/30 dark:bg-white/[0.08] dark:text-white/85"
                  : "border-black/15 bg-white text-black/70 hover:bg-black/[0.04] dark:border-white/15 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]"
              }`}
            >
              {labels[s]}
            </Link>
          );
        })}
        <Link
          href={buildHref(base, {
            verified: filters.verified ? undefined : "true",
            page: undefined,
          })}
          className={`rounded-full border px-3 py-1 text-xs ${
            filters.verified
              ? "border-emerald-500 bg-emerald-100 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-900/40 dark:text-emerald-100"
              : "border-black/15 bg-white text-black/70 hover:bg-black/[0.04] dark:border-white/15 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]"
          }`}
        >
          ✓ Само потвърдени
        </Link>
        {filterCount > 0 && (
          <Link
            href="/issues"
            className="ml-2 text-xs text-black/55 hover:underline dark:text-white/55"
          >
            ↻ Изчисти филтрите
          </Link>
        )}
      </div>

      {filters.law && (
        <div className="text-xs text-black/65 dark:text-white/65">
          Филтриране по закон:{" "}
          <Link href={`/laws/${filters.law}`} className="font-medium hover:underline">
            {filters.law}
          </Link>
        </div>
      )}
    </div>
  );
}

function IssueRow({ issue }: { issue: IssueListItem }) {
  const exp = issue.refined_explanation || issue.explanation;
  const date = new Date(issue.analyzed_at).toLocaleDateString("bg-BG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <li
      className={`rounded-lg border px-5 py-4 ${SEVERITY_CARD[issue.severity]}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${SEVERITY_BADGE[issue.severity]}`}
        >
          {SEVERITY_LABEL[issue.severity]}
        </span>
        <span className="inline-flex items-center rounded-full bg-black/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-black/75 dark:bg-white/[0.08] dark:text-white/75">
          {issue.type}
        </span>
        {issue.verified === true && (
          <span className="inline-flex items-center rounded-full bg-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-900 dark:bg-emerald-700/60 dark:text-emerald-100">
            ✓ Потвърден
          </span>
        )}
        {issue.verified === false && (
          <span className="inline-flex items-center rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-medium text-stone-800 dark:bg-stone-700/70 dark:text-stone-100">
            ⚠ Опровергано
          </span>
        )}
        <span className="ml-auto text-[11px] text-black/45 dark:text-white/45">
          {date}
        </span>
      </div>

      <h3 className="mt-2 font-serif text-base">
        <Link
          href={`/laws/${issue.law_slug}`}
          className="font-semibold hover:underline"
        >
          {issue.law_name_bg}
        </Link>
      </h3>

      <p className="mt-1 text-sm text-black/80 dark:text-white/80">
        {truncate(exp, 280)}
      </p>

      {issue.primary_articles.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="uppercase tracking-wide text-black/55 dark:text-white/55">
            Засегнати:
          </span>
          {issue.primary_articles.slice(0, 8).map((a) => (
            <a
              key={a}
              href={`/laws/${issue.primary_law_slug}#art-${a}`}
              className="rounded border border-current/20 bg-white/70 px-1.5 py-0.5 font-medium hover:bg-white dark:bg-white/[0.06] dark:hover:bg-white/[0.12]"
            >
              Чл. {a}
            </a>
          ))}
        </div>
      )}

      {issue.conflicting_law_slug && issue.conflicting_articles.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="uppercase tracking-wide text-black/55 dark:text-white/55">
            Конфликт с:
          </span>
          <Link
            href={`/laws/${issue.conflicting_law_slug}`}
            className="font-medium hover:underline"
          >
            {issue.conflicting_law_slug}
          </Link>
          <span className="text-black/40 dark:text-white/40">→</span>
          {issue.conflicting_articles.slice(0, 8).map((a) => (
            <a
              key={a}
              href={`/laws/${issue.conflicting_law_slug}#art-${a}`}
              className="rounded border border-current/20 bg-white/70 px-1.5 py-0.5 font-medium hover:bg-white dark:bg-white/[0.06] dark:hover:bg-white/[0.12]"
            >
              Чл. {a}
            </a>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <IssueChatButton issueId={issue.id} />
        <Link
          href={`/analyze/${issue.law_slug}`}
          className="text-amber-700 hover:underline dark:text-amber-400"
        >
          Виж пълния анализ →
        </Link>
      </div>
    </li>
  );
}

function Leaderboard({
  items,
}: {
  items: { law_slug: string; law_name_bg: string; issue_count: number }[];
}) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.issue_count), 1);
  return (
    <div className="rounded-lg border border-black/[0.08] bg-white p-5 dark:border-white/[0.1] dark:bg-white/[0.03]">
      <h2 className="font-serif text-lg font-semibold">
        Най-проблематични закони
      </h2>
      <p className="mt-1 text-xs text-black/55 dark:text-white/55">
        Топ {items.length} закона с най-много открити проблеми.
      </p>
      <ol className="mt-4 space-y-2.5">
        {items.map((item, i) => {
          const widthPct = Math.max(6, (item.issue_count / max) * 100);
          return (
            <li key={item.law_slug} className="text-sm">
              <Link
                href={`/issues?law=${encodeURIComponent(item.law_slug)}`}
                className="block hover:underline"
                title={item.law_name_bg}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium tabular-nums text-black/55 dark:text-white/55">
                    {i + 1}.
                  </span>
                  <span className="flex-1 truncate">{item.law_name_bg}</span>
                  <span className="text-xs tabular-nums font-semibold">
                    {item.issue_count}
                  </span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                  <div
                    className="h-1 rounded-full bg-amber-500 dark:bg-amber-400"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function EmptyState({ filterCount }: { filterCount: number }) {
  return (
    <div className="mt-8 rounded-lg border border-black/[0.08] bg-white px-5 py-8 text-center text-sm text-black/65 dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-white/65">
      {filterCount > 0 ? (
        <>
          Няма проблеми, които отговарят на избраните филтри.{" "}
          <Link href="/issues" className="text-amber-700 hover:underline dark:text-amber-400">
            Изчистете филтрите
          </Link>
          .
        </>
      ) : (
        <>
          Все още няма запазени анализи. Отворете който и да е закон в{" "}
          <Link href="/laws" className="text-amber-700 hover:underline dark:text-amber-400">
            раздела със закони
          </Link>{" "}
          и стартирайте AI анализ.
        </>
      )}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  base,
}: {
  page: number;
  totalPages: number;
  base: Record<string, string | undefined>;
}) {
  const prev = Math.max(0, page - 1);
  const next = Math.min(totalPages - 1, page + 1);
  return (
    <nav className="mt-6 flex items-center justify-between text-sm">
      {page > 0 ? (
        <Link
          href={buildHref(base, { page: prev > 0 ? String(prev) : undefined })}
          className="text-black/70 hover:underline dark:text-white/70"
        >
          ← По-нови
        </Link>
      ) : (
        <span />
      )}
      <span className="text-black/55 dark:text-white/55">
        Страница {page + 1} от {totalPages}
      </span>
      {page < totalPages - 1 ? (
        <Link
          href={buildHref(base, { page: String(next) })}
          className="text-black/70 hover:underline dark:text-white/70"
        >
          По-стари →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
