import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { searchTopRanked } from "@/lib/intel-search";
import { IntelSearchSummary } from "./intel-search-summary";
import { BestMatches } from "./best-matches";

export const revalidate = 0;
export const metadata = { title: "AI търсене — Разузнавателен център" };

type Props = { searchParams: Promise<{ q?: string }> };

const LIMIT = 10;

async function searchAll(q: string) {
  const safe = q.replace(/[%]/g, " ");
  const ilike = `%${safe}%`;

  const [sanc, off, olaf, art, pros, nap] = await Promise.all([
    supabase.from("sanctioned_entities")
      .select("id,name,entity_type,sanction_type,sanctioning_body")
      .ilike("name", ilike).limit(LIMIT),
    supabase.from("offshore_entities")
      .select("id,name,jurisdiction,entity_type,icij_id")
      .ilike("name", ilike).limit(LIMIT),
    supabase.from("olaf_cases")
      .select("id,title,date,fraud_type,amount_eur,source_url")
      .ilike("title", ilike).limit(LIMIT),
    supabase.from("investigative_articles")
      .select("id,title,date,source,author,summary,url")
      .ilike("title", ilike).limit(LIMIT),
    supabase.from("prosecution_cases")
      .select("id,title,date,charges,source_url")
      .ilike("title", ilike).limit(LIMIT),
    supabase.from("nap_rulings")
      .select("id,title,date,source_url")
      .ilike("title", ilike).limit(LIMIT),
  ]);
  return {
    sanctioned: (sanc.data ?? []) as { id: string; name: string | null; entity_type: string | null; sanction_type: string | null; sanctioning_body: string | null }[],
    offshore: (off.data ?? []) as { id: string; name: string | null; jurisdiction: string | null; entity_type: string | null; icij_id: string | null }[],
    olaf: (olaf.data ?? []) as { id: string; title: string | null; date: string | null; fraud_type: string | null; amount_eur: number | null; source_url: string | null }[],
    articles: (art.data ?? []) as { id: string; title: string | null; date: string | null; source: string | null; author: string | null; summary: string | null; url: string | null }[],
    prosecution: (pros.data ?? []) as { id: string; title: string | null; date: string | null; charges: string[] | null; source_url: string | null }[],
    nap: (nap.data ?? []) as { id: string; title: string | null; date: string | null; source_url: string | null }[],
  };
}

export default async function IntelSearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  // Parallel: existing 6-source ILIKE fan-out + new ranking RPC. Both are
  // independent queries against the same Supabase project so Promise.all
  // keeps the page render budget tight (CONTEXT.md success-criterion <3s).
  const [r, topRanked] = query
    ? await Promise.all([searchAll(query), searchTopRanked(query)])
    : [null, [] as Awaited<ReturnType<typeof searchTopRanked>>];

  const counts = r ? {
    sanctioned: r.sanctioned.length, offshore: r.offshore.length, olaf: r.olaf.length,
    articles: r.articles.length, prosecution: r.prosecution.length, nap: r.nap.length,
  } : null;
  const samples = r ? {
    sanctioned: r.sanctioned.map((x) => x.name || "").filter(Boolean),
    offshore:   r.offshore.map((x) => x.name || "").filter(Boolean),
    olaf:       r.olaf.map((x) => x.title || "").filter(Boolean),
    articles:   r.articles.map((x) => x.title || "").filter(Boolean),
    prosecution: r.prosecution.map((x) => x.title || "").filter(Boolean),
    nap:        r.nap.map((x) => x.title || "").filter(Boolean),
  } : null;

  return (
    <div className="bg-stone-950 text-stone-100 min-h-screen">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
        <nav className="text-xs text-stone-400 mb-3">
          <Link href="/intel" className="hover:underline">← Разузнавателен център</Link>
        </nav>
        <header className="border-b border-stone-800 pb-5">
          <h1 className="font-serif text-3xl font-semibold">AI търсене в Intel базите</h1>
          <p className="mt-2 text-sm text-stone-400">
            Едновременно търсене в 6 интел бази + AI анализ на намереното.
          </p>
        </header>

        <form action="/intel/search" method="get" className="mt-6 flex gap-2">
          <input name="q" defaultValue={query} required
            placeholder={'Име, фирма или тема — напр. „Бойко Борисов" или „кокаин Варна"…'}
            className="flex-1 rounded-md border border-stone-700 bg-stone-900 px-3 py-2.5 text-sm focus:border-red-500 outline-none" />
          <button className="rounded-md bg-red-700 px-5 py-2.5 text-sm font-medium hover:bg-red-600">
            Търси
          </button>
        </form>

        {!query && (
          <p className="mt-10 text-sm text-stone-400">
            Въведете заявка, за да започне едновременно търсене в санкции,
            офшорни структури, OLAF, разследваща журналистика, прокуратура и НАП.
          </p>
        )}

        {query && r && counts && samples && (
          <div className="mt-8 space-y-6">
            <IntelSearchSummary query={query} counts={counts} samples={samples} />

            <BestMatches items={topRanked} query={query} />

            <ResultGroup
              title={`Санкции (${r.sanctioned.length})`}
              empty="—"
              href="/intel/sanctions"
              items={r.sanctioned.map((x) => ({
                key: x.id,
                primary: x.name || "—",
                secondary: [x.entity_type, x.sanctioning_body].filter(Boolean).join(" · "),
              }))}
            />
            <ResultGroup
              title={`Офшор (${r.offshore.length})`}
              href="/intel/offshore"
              items={r.offshore.map((x) => ({
                key: x.id,
                primary: x.name || "—",
                secondary: [x.entity_type, x.jurisdiction].filter(Boolean).join(" · "),
                external: x.icij_id ? `https://offshoreleaks.icij.org/nodes/${x.icij_id}` : null,
              }))}
            />
            <ResultGroup
              title={`OLAF (${r.olaf.length})`}
              href="/intel/olaf"
              items={r.olaf.map((x) => ({
                key: x.id,
                primary: x.title || "—",
                secondary: [x.fraud_type, x.date, x.amount_eur ? `€${x.amount_eur.toLocaleString("bg-BG")}` : null].filter(Boolean).join(" · "),
                external: x.source_url,
              }))}
            />
            <ResultGroup
              title={`Разследваща журналистика (${r.articles.length})`}
              href="/intel/articles"
              items={r.articles.map((x) => ({
                key: x.id,
                primary: x.title || "—",
                secondary: [x.source, x.author, x.date].filter(Boolean).join(" · "),
                external: x.url,
              }))}
            />
            <ResultGroup
              title={`Прокуратура (${r.prosecution.length})`}
              href="/intel/prosecution"
              items={r.prosecution.map((x) => ({
                key: x.id,
                primary: x.title || "—",
                secondary: [x.date, ...(x.charges ?? [])].filter(Boolean).join(" · "),
                external: x.source_url,
              }))}
            />
            <ResultGroup
              title={`НАП (${r.nap.length})`}
              href="/issues"
              items={r.nap.map((x) => ({
                key: x.id,
                primary: x.title || "—",
                secondary: x.date ?? "",
                external: x.source_url,
              }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ResultGroup({
  title, items, href, empty,
}: {
  title: string;
  items: { key: string; primary: string; secondary?: string; external?: string | null }[];
  href: string;
  empty?: string;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">{title}</h2>
        <Link href={href} className="text-xs text-red-400 hover:underline">отвори раздела →</Link>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-stone-500">{empty || "Няма попадения."}</p>
      ) : (
        <ul className="mt-2 divide-y divide-stone-800 border-y border-stone-800">
          {items.map((it) => (
            <li key={it.key} className="py-2.5 text-sm">
              <div className="font-medium">
                {it.external ? (
                  <a href={it.external} target="_blank" rel="noreferrer"
                     className="hover:text-red-300 hover:underline">
                    {it.primary} ↗
                  </a>
                ) : it.primary}
              </div>
              {it.secondary && <div className="text-xs text-stone-500">{it.secondary}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
