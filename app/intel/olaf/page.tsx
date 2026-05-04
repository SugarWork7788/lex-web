import Link from "next/link";
import { listOlafCases } from "@/lib/queries";

export const revalidate = 600;
export const metadata = { title: "OLAF — Разузнавателен център" };

const PAGE_SIZE = 30;

type Props = { searchParams: Promise<{ fraud?: string; page?: string }> };

const FRAUD_TYPES = ["VAT fraud", "Customs fraud", "Subsidy fraud"];

export default async function OlafPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page) || 0);
  const { items, total } = await listOlafCases({
    fraud_type: sp.fraud || undefined, page, pageSize: PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="bg-stone-950 text-stone-100 min-h-screen">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
        <nav className="text-xs text-stone-400 mb-3">
          <Link href="/intel" className="hover:underline">← Разузнавателен център</Link>
        </nav>
        <header className="border-b border-stone-800 pb-5">
          <h1 className="font-serif text-3xl font-semibold">OLAF разследвания</h1>
          <p className="mt-2 text-sm text-stone-400">
            {total.toLocaleString("bg-BG")} съобщения за измами със средства на ЕС,
            свързани с България. Източник: anti-fraud.ec.europa.eu.
          </p>
        </header>

        <div className="mt-6 flex flex-wrap gap-2 text-xs">
          <Link href="/intel/olaf"
            className={`rounded-full border px-3 py-1 ${!sp.fraud ? "border-red-500 bg-red-900/40 text-red-100" : "border-stone-700 hover:border-red-500"}`}>
            Всички
          </Link>
          {FRAUD_TYPES.map((t) => (
            <Link key={t} href={`/intel/olaf?fraud=${encodeURIComponent(t)}`}
              className={`rounded-full border px-3 py-1 ${sp.fraud === t ? "border-red-500 bg-red-900/40 text-red-100" : "border-stone-700 hover:border-red-500"}`}>
              {t}
            </Link>
          ))}
        </div>

        {items.length === 0 ? (
          <p className="mt-10 text-sm text-stone-500">Няма намерени случаи.</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {items.map((c) => (
              <li key={c.id} className="rounded-lg border border-stone-800 bg-stone-900/60 p-4">
                <div className="flex flex-wrap items-baseline gap-2 text-xs">
                  {c.fraud_type && <span className="rounded bg-red-900/50 px-2 py-0.5 text-red-100">{c.fraud_type}</span>}
                  {c.amount_eur && <span className="text-amber-300 tabular-nums">€{c.amount_eur.toLocaleString("bg-BG")}</span>}
                  {c.date && <span className="ml-auto text-stone-500">{c.date}</span>}
                </div>
                <h3 className="mt-2 text-base font-medium leading-snug">{c.title}</h3>
                {c.source_url && (
                  <a href={c.source_url} target="_blank" rel="noreferrer"
                     className="mt-1 inline-block text-xs text-red-400 hover:underline">
                    Източник на OLAF ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <nav className="mt-6 flex items-center justify-between text-xs text-stone-400">
            {page > 0 ? (
              <Link className="hover:text-stone-100"
                href={`/intel/olaf?${sp.fraud ? `fraud=${encodeURIComponent(sp.fraud)}&` : ""}page=${page - 1}`}>
                ← По-нови
              </Link>
            ) : <span />}
            <span>Стр. {page + 1} от {totalPages}</span>
            {page < totalPages - 1 ? (
              <Link className="hover:text-stone-100"
                href={`/intel/olaf?${sp.fraud ? `fraud=${encodeURIComponent(sp.fraud)}&` : ""}page=${page + 1}`}>
                По-стари →
              </Link>
            ) : <span />}
          </nav>
        )}
      </div>
    </div>
  );
}
