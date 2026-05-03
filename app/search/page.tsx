import Link from "next/link";
import {
  searchArticles,
  searchDecisions,
  searchEuRegulations,
  type CourtDecision,
  type EuRegulation,
} from "@/lib/queries";

type Tab = "laws" | "courts" | "eu";

type Props = {
  searchParams: Promise<{ q?: string; tab?: string }>;
};

export const metadata = {
  title: "Търсене • lex.bg",
};

const COURT_PATH: Record<string, string> = {
  CC: "ks",
  SC: "vks",
  SA: "vas",
};

function isTab(s: string | undefined): s is Tab {
  return s === "laws" || s === "courts" || s === "eu";
}

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const tab: Tab = isTab(sp.tab) ? sp.tab : "laws";

  // Run all three searches in parallel only when there's a query — otherwise
  // skip the network and render the empty state. This also lets us show the
  // hit-count next to each tab even on tabs the user hasn't clicked yet.
  const [lawHits, decisionHits, euHits] = query
    ? await Promise.all([
        searchArticles(query, 50),
        searchDecisions(query, 50),
        searchEuRegulations(query, 50),
      ])
    : [[], [] as CourtDecision[], [] as EuRegulation[]];

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-serif text-3xl font-semibold tracking-tight">
        Търсене
      </h1>

      <form action="/search" method="get" className="mt-6 flex gap-2">
        <input type="hidden" name="tab" value={tab} />
        <input
          type="search"
          name="q"
          defaultValue={query}
          required
          placeholder="Например: договор, наследство, ECLI, регламент"
          className="flex-1 rounded-md border border-black/15 dark:border-white/15 bg-white dark:bg-black/30 px-4 py-2.5 text-base outline-none focus:border-amber-700 dark:focus:border-amber-400"
          aria-label="Заявка"
        />
        <button
          type="submit"
          className="rounded-md bg-amber-700 hover:bg-amber-800 text-white px-4 py-2.5 text-base font-medium"
        >
          Търси
        </button>
      </form>

      {!query && (
        <p className="mt-10 text-black/60 dark:text-white/60">
          Въведете дума или фраза, за да търсите в закони, съдебни решения и
          европейско право.
        </p>
      )}

      {query && (
        <>
          <nav className="mt-8 flex gap-1 border-b border-black/[0.08] dark:border-white/[0.08]">
            <TabButton
              tab="laws"
              activeTab={tab}
              query={query}
              label="Закони"
              count={lawHits.length}
            />
            <TabButton
              tab="courts"
              activeTab={tab}
              query={query}
              label="Съдебна практика"
              count={decisionHits.length}
            />
            <TabButton
              tab="eu"
              activeTab={tab}
              query={query}
              label="ЕС право"
              count={euHits.length}
            />
          </nav>

          <div className="mt-8">
            {tab === "laws" && <LawResults hits={lawHits} query={query} />}
            {tab === "courts" && (
              <DecisionResults hits={decisionHits} query={query} />
            )}
            {tab === "eu" && <EuResults hits={euHits} query={query} />}
          </div>
        </>
      )}
    </div>
  );
}

function TabButton({
  tab,
  activeTab,
  query,
  label,
  count,
}: {
  tab: Tab;
  activeTab: Tab;
  query: string;
  label: string;
  count: number;
}) {
  const active = tab === activeTab;
  const href = `/search?q=${encodeURIComponent(query)}&tab=${tab}`;
  return (
    <Link
      href={href}
      className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "text-amber-800 dark:text-amber-300"
          : "text-black/55 hover:text-black/85 dark:text-white/55 dark:hover:text-white/85"
      }`}
      aria-current={active ? "page" : undefined}
    >
      {label}
      <span
        className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
          active
            ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
            : "bg-black/[0.05] text-black/60 dark:bg-white/[0.06] dark:text-white/60"
        }`}
      >
        {count}
      </span>
      {active && (
        <span className="absolute inset-x-0 -bottom-px h-[2px] bg-amber-600 dark:bg-amber-400" />
      )}
    </Link>
  );
}

// ── Tab content components ──────────────────────────────────────────────────

function LawResults({
  hits,
  query,
}: {
  hits: Awaited<ReturnType<typeof searchArticles>>;
  query: string;
}) {
  if (hits.length === 0) {
    return (
      <p className="text-sm text-black/60 dark:text-white/60">
        Няма намерени членове, които да отговарят на „{query}".
      </p>
    );
  }
  return (
    <ul className="space-y-6">
      {hits.map((h, i) => (
        <li
          key={`${h.law_slug}-${h.article_number}-${i}`}
          className="border-b border-black/[0.08] dark:border-white/[0.08] pb-6 last:border-b-0"
        >
          <Link
            href={`/laws/${h.law_slug}#art-${encodeURIComponent(
              h.article_number,
            )}`}
            className="block group"
          >
            <div className="text-xs uppercase tracking-wide text-black/55 dark:text-white/55">
              {h.law_name_bg}
            </div>
            <div className="font-serif text-lg font-semibold mt-0.5 group-hover:underline">
              Чл. {h.article_number}
              {h.chapter_title && (
                <span className="font-normal text-black/60 dark:text-white/60">
                  {" "}
                  — {h.chapter_title}
                </span>
              )}
            </div>
            <p
              className="mt-2 text-[0.95rem] leading-relaxed text-black/80 dark:text-white/80 law-prose"
              dangerouslySetInnerHTML={{ __html: h.snippet }}
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function DecisionResults({
  hits,
  query,
}: {
  hits: CourtDecision[];
  query: string;
}) {
  if (hits.length === 0) {
    return (
      <p className="text-sm text-black/60 dark:text-white/60">
        Няма намерени съдебни решения за „{query}".
      </p>
    );
  }
  return (
    <ul className="space-y-4">
      {hits.map((d) => {
        const courtSlug = COURT_PATH[d.court_code] ?? "ks";
        const title =
          d.title || d.decision_number || d.case_number || "Решение";
        return (
          <li
            key={d.id}
            className="rounded-lg border border-black/[0.08] dark:border-white/[0.08] p-4 hover:border-amber-500 dark:hover:border-amber-400/60 transition-colors"
          >
            <Link
              href={`/courts/${courtSlug}/${d.id}`}
              className="block group"
            >
              <div className="flex items-baseline gap-2 text-xs">
                <span className="font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  {d.court}
                </span>
                {d.act_type && (
                  <span className="text-black/55 dark:text-white/55">
                    {d.act_type}
                  </span>
                )}
                {d.decision_date && (
                  <span className="ml-auto text-black/45 dark:text-white/45">
                    {d.decision_date.slice(0, 10)}
                  </span>
                )}
              </div>
              <h3 className="mt-1 font-serif text-base group-hover:underline">
                {title.length > 140 ? title.slice(0, 139) + "…" : title}
              </h3>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-black/55 dark:text-white/55">
                {d.case_number && <span>{d.case_number}</span>}
                {d.decision_number && <span>{d.decision_number}</span>}
                {d.ecli && <span className="font-mono">{d.ecli}</span>}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function EuResults({ hits, query }: { hits: EuRegulation[]; query: string }) {
  if (hits.length === 0) {
    return (
      <p className="text-sm text-black/60 dark:text-white/60">
        Няма намерени европейски актове за „{query}".
      </p>
    );
  }
  return (
    <ul className="space-y-4">
      {hits.map((r) => {
        const title = r.title_bg || r.title_en || r.celex;
        return (
          <li
            key={r.id}
            className="rounded-lg border border-yellow-300/60 bg-yellow-50/40 dark:border-yellow-700/40 dark:bg-yellow-950/15 p-4 hover:border-yellow-500 dark:hover:border-yellow-500/70 transition-colors"
          >
            <Link
              href={`/eu/${encodeURIComponent(r.celex)}`}
              className="block group"
            >
              <div className="flex items-baseline gap-2 text-xs">
                <span className="font-mono font-semibold text-yellow-800 dark:text-yellow-300">
                  {r.celex}
                </span>
                {r.doc_type && (
                  <span className="capitalize text-black/55 dark:text-white/55">
                    {r.doc_type}
                  </span>
                )}
                {r.in_force && (
                  <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    В сила
                  </span>
                )}
                {r.date_document && (
                  <span className="ml-auto text-black/45 dark:text-white/45">
                    {r.date_document.slice(0, 10)}
                  </span>
                )}
              </div>
              <h3 className="mt-1 font-serif text-base group-hover:underline">
                {title.length > 200 ? title.slice(0, 199) + "…" : title}
              </h3>
              {r.title_bg && r.title_en && r.title_bg !== r.title_en && (
                <p className="mt-0.5 text-xs italic text-black/50 dark:text-white/50">
                  {r.title_en.length > 160
                    ? r.title_en.slice(0, 159) + "…"
                    : r.title_en}
                </p>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
