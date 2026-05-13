import Link from "next/link";
import { listKzkDecisions } from "@/lib/queries";

export const revalidate = 600;
export const metadata = { title: "КЗК решения — Разузнавателен център" };

const PAGE_SIZE = 50;

// Bulgarian-language labels for the three decision-type buckets the
// scrape_kzk.py scraper records. Matches the `decision_type` column
// values written by scripts/scrape_kzk.py (DT_TYPES dict there).
const TYPE_LABELS: Record<string, string> = {
  concentration:       "Концентрации",
  antitrust:           "Антитръст",
  public_procurement:  "Обществени поръчки",
};
const TYPES = Object.keys(TYPE_LABELS);

type Props = {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
};

function buildHref(base: Record<string, string | undefined>, override: Record<string, string | undefined>): string {
  const merged = { ...base, ...override };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return `/intel/kzk${qs ? `?${qs}` : ""}`;
}

export default async function KzkPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page) || 0);
  const { items, total } = await listKzkDecisions({
    search: sp.q?.trim() || undefined,
    decision_type: sp.type || undefined,
    page, pageSize: PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="bg-stone-950 text-stone-100 min-h-screen">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
        <nav className="text-xs text-stone-400 mb-3">
          <Link href="/intel" className="hover:underline">← Разузнавателен център</Link>
        </nav>
        <header className="border-b border-stone-800 pb-5">
          <h1 className="font-serif text-3xl font-semibold">КЗК решения</h1>
          <p className="mt-2 text-sm text-stone-400">
            {total.toLocaleString("bg-BG")} решения на Комисия за защита на
            конкуренцията — концентрации, антитръст и обществени поръчки.
            Източник: reg.cpc.bg.
          </p>
        </header>

        {/* Search */}
        <form className="mt-6 flex gap-2" action="/intel/kzk">
          {sp.type && <input type="hidden" name="type" value={sp.type} />}
          <input
            type="text"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Търси по заглавие или номер на дело…"
            className="flex-1 rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm placeholder:text-stone-500 focus:border-red-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium hover:bg-red-600"
          >
            Търси
          </button>
        </form>

        {/* Type filter chips */}
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <Link
            href={buildHref({ q: sp.q }, { type: undefined, page: undefined })}
            className={`rounded-full border px-3 py-1 ${!sp.type ? "border-red-500 bg-red-900/40 text-red-100" : "border-stone-700 hover:border-red-500"}`}
          >
            Всички
          </Link>
          {TYPES.map((t) => (
            <Link
              key={t}
              href={buildHref({ q: sp.q }, { type: t, page: undefined })}
              className={`rounded-full border px-3 py-1 ${sp.type === t ? "border-red-500 bg-red-900/40 text-red-100" : "border-stone-700 hover:border-red-500"}`}
            >
              {TYPE_LABELS[t]}
            </Link>
          ))}
        </div>

        {items.length === 0 ? (
          <p className="mt-10 text-sm text-stone-500">Няма намерени решения.</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {items.map((d) => {
              const typeLabel = d.decision_type ? TYPE_LABELS[d.decision_type] ?? d.decision_type : null;
              return (
                <li key={d.id} className="rounded-lg border border-stone-800 bg-stone-900/60 p-4">
                  <div className="flex flex-wrap items-baseline gap-2 text-xs">
                    {typeLabel && (
                      <span className="rounded bg-red-900/50 px-2 py-0.5 text-red-100">
                        {typeLabel}
                      </span>
                    )}
                    {d.case_number && (
                      <span className="rounded bg-stone-800 px-2 py-0.5 text-stone-300 tabular-nums">
                        {d.case_number}
                      </span>
                    )}
                    {d.date && (
                      <span className="ml-auto text-stone-500 tabular-nums">{d.date}</span>
                    )}
                  </div>
                  <h3 className="mt-2 text-base font-medium leading-snug">{d.title}</h3>
                  {d.source_url && (
                    <a href={d.source_url} target="_blank" rel="noreferrer"
                       className="mt-1 inline-block text-xs text-red-400 hover:underline">
                      Източник на КЗК ↗
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {totalPages > 1 && (
          <nav className="mt-6 flex items-center justify-between text-xs text-stone-400">
            {page > 0 ? (
              <Link
                className="hover:text-stone-100"
                href={buildHref({ q: sp.q, type: sp.type }, { page: String(page - 1) })}
              >
                ← По-нови
              </Link>
            ) : <span />}
            <span>Стр. {page + 1} от {totalPages}</span>
            {page < totalPages - 1 ? (
              <Link
                className="hover:text-stone-100"
                href={buildHref({ q: sp.q, type: sp.type }, { page: String(page + 1) })}
              >
                По-стари →
              </Link>
            ) : <span />}
          </nav>
        )}
      </div>
    </div>
  );
}
