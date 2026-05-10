import Link from "next/link";
import { listDvIssues } from "@/lib/queries";
import { IssueCard } from "./_components/issue-card";
import { DV_ACT_PILL } from "./_lib/act-pill";

export const revalidate = 60;
export const metadata = {
  title: "Държавен вестник — lex.bg",
  description:
    "Браузър за издадените броеве на Държавен вестник на Република България.",
};

const PAGE_SIZE = 20;

type SearchParams = {
  q?: string;
  year?: string;
  act_type?: string;
  from_date?: string;
  to_date?: string;
  from_issue?: string;
  to_issue?: string;
  page?: string;
};

type Props = { searchParams: Promise<SearchParams> };

/** Build a /dv?... href that preserves all current filters and patches a few. */
function buildHref(
  base: SearchParams,
  patch: Partial<SearchParams>,
): string {
  const merged = { ...base, ...patch };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (typeof v === "string" && v.length > 0) sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `/dv?${qs}` : "/dv";
}

export default async function DvListingPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page) || 0);
  const year = sp.year && sp.year !== "all" ? Number(sp.year) : undefined;
  const from_date = sp.from_date || undefined;
  const to_date = sp.to_date || undefined;
  const from_issue = sp.from_issue ? Number(sp.from_issue) : undefined;
  const to_issue = sp.to_issue ? Number(sp.to_issue) : undefined;

  const { items, total } = await listDvIssues({
    page,
    pageSize: PAGE_SIZE,
    year,
    from_date,
    to_date,
    from_issue,
    to_issue,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilter = Boolean(
    sp.year || sp.act_type || sp.from_date || sp.to_date || sp.from_issue || sp.to_issue,
  );

  return (
    <div className="bg-stone-950 text-stone-100 min-h-screen">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
        <nav className="text-xs text-stone-400 mb-3">
          <Link href="/" className="hover:underline">
            ← Начало
          </Link>
        </nav>
        <header className="border-b border-stone-800 pb-5">
          <p className="text-xs uppercase tracking-[0.18em] text-red-400 font-medium">
            Държавен вестник
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold">
            Издадени броеве
          </h1>
          <p className="mt-3 text-sm text-stone-400">
            {total.toLocaleString("bg-BG")} броя · източник:{" "}
            <a
              href="https://dv.parliament.bg/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-stone-200 hover:underline"
            >
              dv.parliament.bg
            </a>
          </p>
        </header>

        {/* Filter form: Row 1 act-type chips, Row 2 year/dates/issue-range */}
        <form
          action="/dv"
          method="get"
          className="mt-6 space-y-3 print:hidden"
          aria-label="Филтриране на броевете"
        >
          <div className="flex flex-wrap gap-2">
            {Object.keys(DV_ACT_PILL).map((t) => {
              const active = sp.act_type === t;
              return (
                <label
                  key={t}
                  className={`cursor-pointer px-3 py-2 sm:py-3 text-sm rounded-md border transition-colors ${
                    active
                      ? "border-red-500 bg-red-950/30 text-red-200"
                      : "border-stone-700 bg-stone-900 text-stone-300 hover:border-stone-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="act_type"
                    value={t}
                    defaultChecked={active}
                    className="sr-only"
                  />
                  {t}
                </label>
              );
            })}
            {sp.act_type && (
              <Link
                href={buildHref(sp, { act_type: undefined, page: undefined })}
                className="px-3 py-2 sm:py-3 text-sm text-stone-400 hover:text-stone-200 hover:underline"
              >
                Изчисти
              </Link>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <select
              name="year"
              defaultValue={sp.year ?? "all"}
              aria-label="Година"
              className="rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm"
            >
              <option value="all">Всички години</option>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
            </select>
            <input
              name="from_date"
              type="date"
              defaultValue={sp.from_date ?? ""}
              aria-label="От дата"
              className="rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm"
            />
            <input
              name="to_date"
              type="date"
              defaultValue={sp.to_date ?? ""}
              aria-label="До дата"
              className="rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm"
            />
            <input
              name="from_issue"
              type="number"
              min={1}
              defaultValue={sp.from_issue ?? ""}
              placeholder="От брой"
              aria-label="От брой"
              className="rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm"
            />
            <input
              name="to_issue"
              type="number"
              min={1}
              defaultValue={sp.to_issue ?? ""}
              placeholder="До брой"
              aria-label="До брой"
              className="rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
            >
              Филтрирай
            </button>
            {hasFilter && (
              <Link
                href="/dv"
                className="text-xs text-stone-400 hover:text-stone-200 hover:underline"
              >
                ↻ Изчисти
              </Link>
            )}
          </div>
        </form>

        {items.length === 0 ? (
          <p className="mt-10 text-sm text-stone-400">
            Няма броеве, отговарящи на филтрите. Изчистете филтрите за пълния
            списък.
          </p>
        ) : (
          <ul className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-3">
            {items.map((issue) => (
              <li key={issue.id}>
                <IssueCard issue={issue} />
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <nav className="mt-8 flex items-center justify-between text-sm text-stone-400 print:hidden">
            {page > 0 ? (
              <Link
                href={buildHref(sp, { page: String(page - 1) })}
                className="hover:underline"
              >
                « Предишна
              </Link>
            ) : (
              <span />
            )}
            <span>
              Страница {page + 1} от {totalPages}
            </span>
            {page + 1 < totalPages ? (
              <Link
                href={buildHref(sp, { page: String(page + 1) })}
                className="hover:underline"
              >
                Следваща »
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}

        <div className="mt-12 pt-6 border-t border-stone-800/50 text-xs text-stone-500">
          Източник:{" "}
          <a
            href="https://dv.parliament.bg/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-stone-300 hover:underline"
          >
            dv.parliament.bg ↗
          </a>{" "}
          · Държавен вестник на Народното събрание на Република България
        </div>
      </div>
    </div>
  );
}
