import Link from "next/link";
import { listOffshoreEntities } from "@/lib/queries";

export const revalidate = 600;
export const metadata = { title: "Офшорни структури — Разузнавателен център" };

const PAGE_SIZE = 50;

type Props = {
  searchParams: Promise<{
    q?: string; jurisdiction?: string; type?: string; page?: string;
  }>;
};

function buildHref(base: Record<string, string | undefined>,
                   patch: Record<string, string | undefined>): string {
  const merged = { ...base, ...patch };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
  return sp.toString() ? `/intel/offshore?${sp.toString()}` : "/intel/offshore";
}

export default async function OffshorePage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page) || 0);
  const { items, total } = await listOffshoreEntities({
    search: sp.q?.trim() || undefined,
    jurisdiction: sp.jurisdiction || undefined,
    entity_type: sp.type || undefined,
    page, pageSize: PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const base = { q: sp.q, jurisdiction: sp.jurisdiction, type: sp.type };

  return (
    <div className="bg-stone-950 text-stone-100 min-h-screen">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
        <nav className="text-xs text-stone-400 mb-3">
          <Link href="/intel" className="hover:underline">← Разузнавателен център</Link>
        </nav>
        <header className="border-b border-stone-800 pb-5">
          <h1 className="font-serif text-3xl font-semibold">Офшорни структури</h1>
          <p className="mt-2 text-sm text-stone-400">
            {total.toLocaleString("bg-BG")} записа от ICIJ Offshore Leaks (Pandora,
            Paradise, Panama, Bahamas, Offshore, Cyprus Confidential).
          </p>
        </header>

        <form action="/intel/offshore" method="get" className="mt-6 flex flex-wrap gap-2">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Търсене по име…"
            className="flex-1 min-w-[200px] rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm" />
          <input name="jurisdiction" defaultValue={sp.jurisdiction ?? ""} placeholder="Юрисдикция (BGR, BVI, MLT…)"
            className="w-44 rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm" />
          <select name="type" defaultValue={sp.type ?? ""}
            className="rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm">
            <option value="">Всички типове</option>
            <option value="entity">Юр. лице</option>
            <option value="officer">Длъжностно лице</option>
            <option value="intermediary">Посредник</option>
            <option value="address">Адрес</option>
          </select>
          <button className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium hover:bg-red-600">
            Филтрирай
          </button>
          {(sp.q || sp.jurisdiction || sp.type) && (
            <Link href="/intel/offshore" className="text-xs text-stone-400 hover:underline self-center">↻ Изчисти</Link>
          )}
        </form>

        {items.length === 0 ? (
          <p className="mt-10 text-sm text-stone-500">Няма намерени резултати.</p>
        ) : (
          <ul className="mt-6 divide-y divide-stone-800 border-y border-stone-800">
            {items.map((e) => (
              <li key={e.id} className="py-3 grid grid-cols-1 sm:grid-cols-12 gap-2 text-sm">
                <div className="sm:col-span-5 font-medium">{e.name || "(без име)"}</div>
                <div className="sm:col-span-2 text-stone-400">{e.entity_type || "—"}</div>
                <div className="sm:col-span-2 text-stone-400">{e.jurisdiction || "—"}</div>
                <div className="sm:col-span-3 text-xs text-stone-500">
                  {e.icij_id && (
                    <a href={`https://offshoreleaks.icij.org/nodes/${e.icij_id}`}
                       target="_blank" rel="noreferrer"
                       className="hover:text-red-400 hover:underline">
                      ICIJ #{e.icij_id} ↗
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <nav className="mt-6 flex items-center justify-between text-xs text-stone-400">
            {page > 0 ? (
              <Link className="hover:text-stone-100"
                href={buildHref(base, { page: page > 1 ? String(page - 1) : undefined })}>
                ← По-нови
              </Link>
            ) : <span />}
            <span>Стр. {page + 1} от {totalPages}</span>
            {page < totalPages - 1 ? (
              <Link className="hover:text-stone-100"
                href={buildHref(base, { page: String(page + 1) })}>По-стари →</Link>
            ) : <span />}
          </nav>
        )}
      </div>
    </div>
  );
}
