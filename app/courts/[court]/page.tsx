import Link from "next/link";
import { notFound } from "next/navigation";
import { listCourtDecisions, getAvailableYears } from "@/lib/queries";
import { CourtBanner, type CourtKey } from "@/app/components/section-banner";

export const revalidate = 1800;

const COURT_CODE: Record<string, string> = {
  vks: "SC",
  vas: "SA",
  ks: "CC",
};

const COURT_LABEL: Record<string, string> = {
  vks: "ВКС",
  vas: "ВАС",
  ks: "КС",
};

const COURT_FULL_NAME: Record<string, string> = {
  vks: "Върховния касационен съд",
  vas: "Върховния административен съд",
  ks: "Конституционния съд",
};

const BADGE_COLORS: Record<string, string> = {
  SC: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200",
  SA: "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200",
  CC: "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200",
};

type Props = {
  params: Promise<{ court: string }>;
  searchParams: Promise<{ year?: string; page?: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ court: string }>;
}) {
  const { court } = await params;
  const label = COURT_LABEL[court];
  if (!label) return { title: "Не е намерен съд" };
  return { title: `${label} решения • lex.bg` };
}

const PAGE_SIZE = 20;

export default async function CourtPage({ params, searchParams }: Props) {
  const { court } = await params;
  const sp = await searchParams;
  const court_code = COURT_CODE[court];
  if (!court_code) notFound();

  const year = sp.year ? parseInt(sp.year) : undefined;
  const page = sp.page ? Math.max(0, parseInt(sp.page) - 1) : 0;

  const [{ items, total }, availableYears] = await Promise.all([
    listCourtDecisions({ court_code, year, page, pageSize: PAGE_SIZE }),
    getAvailableYears(court_code),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = page + 1;
  const badgeClass = BADGE_COLORS[court_code] ?? "";

  return (
    <div>
      <CourtBanner court={court as CourtKey} />

      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-serif text-3xl font-semibold">
              {COURT_LABEL[court]} — решения
            </h1>
            <p className="mt-1 text-sm text-black/55 dark:text-white/55">
              {total.toLocaleString("bg-BG")} решения
              {year ? ` за ${year} г.` : ""}
            </p>
          </div>

          {availableYears.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/courts/${court}`}
                className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                  !year
                    ? "border-black/30 bg-black/[0.06] font-medium dark:border-white/30 dark:bg-white/[0.06]"
                    : "border-black/10 hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/[0.04]"
                }`}
              >
                Всички
              </Link>
              {availableYears.slice(0, 12).map((y) => (
                <Link
                  key={y}
                  href={`/courts/${court}?year=${y}`}
                  className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                    year === y
                      ? "border-black/30 bg-black/[0.06] font-medium dark:border-white/30 dark:bg-white/[0.06]"
                      : "border-black/10 hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/[0.04]"
                  }`}
                >
                  {y}
                </Link>
              ))}
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.08] px-8 py-16 text-center">
            <p className="font-serif text-lg text-black/60 dark:text-white/60">
              Все още няма решения от {COURT_FULL_NAME[court] ?? COURT_LABEL[court]}
            </p>
            <p className="mt-2 text-sm text-black/45 dark:text-white/45">
              Базата данни се попълва. Провери отново скоро.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/courts/${court}/${d.id}`}
                  className="block rounded-lg border border-black/[0.08] dark:border-white/[0.08] px-5 py-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {d.act_type && (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badgeClass}`}
                      >
                        {d.act_type}
                      </span>
                    )}
                    {d.college && (
                      <span className="text-xs text-black/50 dark:text-white/50">
                        {d.college} колегия
                      </span>
                    )}
                    <span className="ml-auto text-xs text-black/40 dark:text-white/40">
                      {d.decision_date?.slice(0, 10) ?? ""}
                    </span>
                  </div>
                  <p className="font-medium text-sm leading-snug">
                    {d.title || d.case_number || d.decision_number || d.ecli}
                  </p>
                  {d.cited_law_slugs.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {d.cited_law_slugs.slice(0, 4).map((slug) => (
                        <span
                          key={slug}
                          className="rounded border border-black/10 dark:border-white/10 px-1.5 py-0.5 text-[10px] text-black/55 dark:text-white/55"
                        >
                          {slug}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <div className="mt-8 flex flex-wrap items-center gap-2">
            {currentPage > 1 && (
              <Link
                href={`/courts/${court}?${year ? `year=${year}&` : ""}page=${currentPage - 1}`}
                className="rounded-md border border-black/15 dark:border-white/15 px-4 py-2 text-sm hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
              >
                ← Предишна
              </Link>
            )}
            <span className="text-sm text-black/55 dark:text-white/55">
              Страница {currentPage} от {totalPages}
            </span>
            {currentPage < totalPages && (
              <Link
                href={`/courts/${court}?${year ? `year=${year}&` : ""}page=${currentPage + 1}`}
                className="rounded-md border border-black/15 dark:border-white/15 px-4 py-2 text-sm hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
              >
                Следваща →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
