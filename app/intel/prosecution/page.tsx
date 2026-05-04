import Link from "next/link";
import { listProsecutionCases } from "@/lib/queries";

export const revalidate = 600;
export const metadata = { title: "Прокурорски случаи — Разузнавателен център" };

const PAGE_SIZE = 30;

type Props = { searchParams: Promise<{ page?: string }> };

export default async function ProsecutionPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page) || 0);
  const { items, total } = await listProsecutionCases({ page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="bg-stone-950 text-stone-100 min-h-screen">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
        <nav className="text-xs text-stone-400 mb-3">
          <Link href="/intel" className="hover:underline">← Разузнавателен център</Link>
        </nav>
        <header className="border-b border-stone-800 pb-5">
          <h1 className="font-serif text-3xl font-semibold">Прокурорски случаи</h1>
          <p className="mt-2 text-sm text-stone-400">
            {total.toLocaleString("bg-BG")} съобщения от Прокуратура на Република България.
          </p>
        </header>

        {items.length === 0 ? (
          <p className="mt-10 text-sm text-stone-500">Няма намерени случаи.</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {items.map((c) => (
              <li key={c.id} className="rounded-lg border border-stone-800 bg-stone-900/60 p-4">
                <div className="flex flex-wrap items-baseline gap-2 text-xs">
                  {c.charges?.slice(0, 3).map((ch) => (
                    <span key={ch} className="rounded bg-red-900/50 px-2 py-0.5 text-red-100">{ch}</span>
                  ))}
                  {c.amount_bgn && <span className="text-amber-300 tabular-nums">{c.amount_bgn.toLocaleString("bg-BG")} лв.</span>}
                  {c.date && <span className="ml-auto text-stone-500">{c.date}</span>}
                </div>
                <h3 className="mt-2 text-[15px] font-medium leading-snug">
                  {c.source_url ? (
                    <a href={c.source_url} target="_blank" rel="noreferrer" className="hover:text-red-300 hover:underline">
                      {c.title} ↗
                    </a>
                  ) : c.title}
                </h3>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <nav className="mt-6 flex items-center justify-between text-xs text-stone-400">
            {page > 0 ? <Link className="hover:text-stone-100" href={`/intel/prosecution?page=${page - 1}`}>← По-нови</Link> : <span />}
            <span>Стр. {page + 1} от {totalPages}</span>
            {page < totalPages - 1 ? <Link className="hover:text-stone-100" href={`/intel/prosecution?page=${page + 1}`}>По-стари →</Link> : <span />}
          </nav>
        )}
      </div>
    </div>
  );
}
