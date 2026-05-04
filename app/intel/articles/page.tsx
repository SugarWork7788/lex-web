import Link from "next/link";
import { listInvestigativeArticles } from "@/lib/queries";

export const revalidate = 600;
export const metadata = { title: "Разследващи статии — Разузнавателен център" };

const PAGE_SIZE = 30;

type Props = { searchParams: Promise<{ q?: string; tag?: string; page?: string }> };

export default async function ArticlesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page) || 0);
  const { items, total } = await listInvestigativeArticles({
    search: sp.q?.trim() || undefined,
    tag: sp.tag || undefined,
    page, pageSize: PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="bg-stone-950 text-stone-100 min-h-screen">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
        <nav className="text-xs text-stone-400 mb-3">
          <Link href="/intel" className="hover:underline">← Разузнавателен център</Link>
        </nav>
        <header className="border-b border-stone-800 pb-5">
          <h1 className="font-serif text-3xl font-semibold">Разследваща журналистика</h1>
          <p className="mt-2 text-sm text-stone-400">
            {total.toLocaleString("bg-BG")} статии (само индекс). Кликнете заглавието,
            за да отворите оригинала. Източник: Биволъ и др.
          </p>
        </header>

        <form action="/intel/articles" method="get" className="mt-6 flex flex-wrap gap-2">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Търсене по заглавие…"
            className="flex-1 min-w-[200px] rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm" />
          <input name="tag" defaultValue={sp.tag ?? ""} placeholder="Таг"
            className="w-32 rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm" />
          <button className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium hover:bg-red-600">
            Филтрирай
          </button>
          {(sp.q || sp.tag) && (
            <Link href="/intel/articles" className="text-xs text-stone-400 hover:underline self-center">↻ Изчисти</Link>
          )}
        </form>

        {items.length === 0 ? (
          <p className="mt-10 text-sm text-stone-500">Няма намерени статии.</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {items.map((a) => (
              <li key={a.id} className="rounded-lg border border-stone-800 bg-stone-900/60 p-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
                  {a.source && <span className="rounded bg-stone-800 px-2 py-0.5 text-stone-300">{a.source}</span>}
                  {a.author && <span>{a.author}</span>}
                  {a.date && <span className="ml-auto">{a.date}</span>}
                </div>
                <h3 className="mt-1.5 text-[15px] font-medium leading-snug">
                  {a.url ? (
                    <a href={a.url} target="_blank" rel="noreferrer" className="hover:text-red-300 hover:underline">
                      {a.title} ↗
                    </a>
                  ) : a.title}
                </h3>
                {a.summary && (
                  <p className="mt-1.5 text-xs text-stone-400 leading-relaxed">{a.summary}</p>
                )}
                {a.tags && a.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {a.tags.slice(0, 8).map((t) => (
                      <Link key={t} href={`/intel/articles?tag=${encodeURIComponent(t)}`}
                        className="rounded bg-stone-800 px-1.5 py-0.5 text-[10px] text-stone-400 hover:bg-stone-700 hover:text-stone-100">
                        #{t}
                      </Link>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <nav className="mt-6 flex items-center justify-between text-xs text-stone-400">
            {page > 0 ? (
              <Link className="hover:text-stone-100"
                href={`/intel/articles?${sp.q ? `q=${encodeURIComponent(sp.q)}&` : ""}${sp.tag ? `tag=${encodeURIComponent(sp.tag)}&` : ""}page=${page - 1}`}>
                ← По-нови
              </Link>
            ) : <span />}
            <span>Стр. {page + 1} от {totalPages}</span>
            {page < totalPages - 1 ? (
              <Link className="hover:text-stone-100"
                href={`/intel/articles?${sp.q ? `q=${encodeURIComponent(sp.q)}&` : ""}${sp.tag ? `tag=${encodeURIComponent(sp.tag)}&` : ""}page=${page + 1}`}>
                По-стари →
              </Link>
            ) : <span />}
          </nav>
        )}
      </div>
    </div>
  );
}
