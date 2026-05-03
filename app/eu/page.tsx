import Link from "next/link";
import { listEuRegulations, getEuCounts } from "@/lib/queries";
import { EuBanner } from "@/app/components/section-banner";

export const revalidate = 3600;
export const metadata = {
  title: "ЕС право • lex.bg",
  description:
    "Регламенти и директиви на Европейския съюз, приложими в България",
};

type Props = {
  searchParams: Promise<{ type?: string; page?: string }>;
};

const PAGE_SIZE = 25;

const DOC_TYPE_LABELS: Record<string, string> = {
  regulation: "Регламент",
  directive: "Директива",
  decision: "Решение",
};

export default async function EuPage({ searchParams }: Props) {
  const sp = await searchParams;
  const doc_type = sp.type;
  const page = sp.page ? Math.max(0, parseInt(sp.page) - 1) : 0;

  const [{ items, total }, counts] = await Promise.all([
    listEuRegulations({ doc_type, page, pageSize: PAGE_SIZE }),
    getEuCounts(),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = page + 1;

  return (
    <div>
      <EuBanner />

      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8">
          <h1 className="font-serif text-4xl font-semibold tracking-tight">
            Европейско право
          </h1>
          <p className="mt-2 text-black/60 dark:text-white/60">
            Регламенти и директиви на ЕС — пряко приложими в България
          </p>
        </header>

        <div className="mb-6 flex flex-wrap gap-2">
          <Link
            href="/eu"
            className={`rounded-full px-4 py-1.5 text-sm border transition-colors ${
              !doc_type
                ? "border-yellow-500 bg-yellow-100 text-yellow-900 font-medium dark:border-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-200"
                : "border-black/10 hover:bg-black/[0.03] dark:border-white/10"
            }`}
          >
            Всички ({Object.values(counts).reduce((a, b) => a + b, 0).toLocaleString("bg-BG")})
          </Link>
          {Object.entries(DOC_TYPE_LABELS).map(([type, label]) => (
            <Link
              key={type}
              href={`/eu?type=${type}`}
              className={`rounded-full px-4 py-1.5 text-sm border transition-colors ${
                doc_type === type
                  ? "border-yellow-500 bg-yellow-100 text-yellow-900 font-medium dark:border-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-200"
                  : "border-black/10 hover:bg-black/[0.03] dark:border-white/10"
              }`}
            >
              {label} ({(counts[type] ?? 0).toLocaleString("bg-BG")})
            </Link>
          ))}
        </div>

        {items.length === 0 ? (
          <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.08] px-8 py-16 text-center">
            <p className="font-serif text-lg text-black/60 dark:text-white/60">
              Данните се зареждат…
            </p>
            <p className="mt-2 text-sm text-black/45 dark:text-white/45">
              EUR-Lex скрейпването е в процес. Провери след малко.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.06] dark:divide-white/[0.06]">
            {items.map((reg) => (
              <Link
                key={reg.id}
                href={`/eu/${encodeURIComponent(reg.celex)}`}
                className="flex items-start gap-4 py-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] -mx-2 px-2 rounded-lg transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="rounded border border-yellow-300 bg-yellow-50 px-2 py-0.5 text-[11px] font-mono font-semibold text-yellow-900 dark:border-yellow-700/60 dark:bg-yellow-950/30 dark:text-yellow-200">
                      {reg.celex}
                    </span>
                    {reg.doc_type && (
                      <span className="text-xs text-black/50 dark:text-white/50">
                        {DOC_TYPE_LABELS[reg.doc_type] ?? reg.doc_type}
                      </span>
                    )}
                    {reg.in_force && (
                      <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-semibold">
                        В сила
                      </span>
                    )}
                    <span className="ml-auto text-xs text-black/40 dark:text-white/40">
                      {reg.date_document?.slice(0, 10) ?? ""}
                    </span>
                  </div>
                  <p className="text-sm font-medium leading-snug">
                    {reg.title_bg || reg.title_en || reg.celex}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-8 flex flex-wrap items-center gap-2">
            {currentPage > 1 && (
              <Link
                href={`/eu?${doc_type ? `type=${doc_type}&` : ""}page=${currentPage - 1}`}
                className="rounded-md border border-black/15 dark:border-white/15 px-4 py-2 text-sm hover:bg-black/[0.03]"
              >
                ← Предишна
              </Link>
            )}
            <span className="text-sm text-black/55 dark:text-white/55">
              {currentPage} / {totalPages}
            </span>
            {currentPage < totalPages && (
              <Link
                href={`/eu?${doc_type ? `type=${doc_type}&` : ""}page=${currentPage + 1}`}
                className="rounded-md border border-black/15 dark:border-white/15 px-4 py-2 text-sm hover:bg-black/[0.03]"
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
