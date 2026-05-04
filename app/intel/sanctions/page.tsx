import Link from "next/link";
import { listSanctionedEntities, getDistinctSanctioningBodies } from "@/lib/queries";

export const revalidate = 600;
export const metadata = { title: "Санкции — Разузнавателен център" };

const PAGE_SIZE = 50;

type Props = {
  searchParams: Promise<{
    q?: string; type?: string; body?: string; page?: string;
  }>;
};

function buildHref(base: Record<string, string | undefined>,
                   patch: Record<string, string | undefined>): string {
  const merged = { ...base, ...patch };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `/intel/sanctions?${qs}` : "/intel/sanctions";
}

export default async function SanctionsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page) || 0);
  const search = sp.q?.trim() || undefined;
  const entity_type = sp.type || undefined;
  const sanctioning_body = sp.body || undefined;

  const [{ items, total }, bodies] = await Promise.all([
    listSanctionedEntities({ search, entity_type, sanctioning_body, page, pageSize: PAGE_SIZE }),
    getDistinctSanctioningBodies(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const base = { q: sp.q, type: sp.type, body: sp.body };

  return (
    <div className="bg-stone-950 text-stone-100 min-h-screen">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
        <nav className="text-xs text-stone-400 mb-3">
          <Link href="/intel" className="hover:underline">← Разузнавателен център</Link>
        </nav>
        <header className="border-b border-stone-800 pb-5">
          <h1 className="font-serif text-3xl font-semibold">Санкционирани лица и организации</h1>
          <p className="mt-2 text-sm text-stone-400">
            {total.toLocaleString("bg-BG")} записа, свързани с България. Източник: OpenSanctions.
          </p>
        </header>

        <form action="/intel/sanctions" method="get" className="mt-6 flex flex-wrap gap-2">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Търсене по име…"
            className="flex-1 min-w-[200px] rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm" />
          <select name="type" defaultValue={sp.type ?? ""}
            className="rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm">
            <option value="">Всички типове</option>
            <option value="Person">Физическо лице</option>
            <option value="Organization">Организация</option>
            <option value="Vessel">Плавателен съд</option>
          </select>
          <select name="body" defaultValue={sp.body ?? ""}
            className="rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm">
            <option value="">Всички органи</option>
            {bodies.slice(0, 40).map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <button className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium hover:bg-red-600">
            Филтрирай
          </button>
          {(search || entity_type || sanctioning_body) && (
            <Link href="/intel/sanctions" className="text-xs text-stone-400 hover:underline self-center">↻ Изчисти</Link>
          )}
        </form>

        {items.length === 0 ? (
          <p className="mt-10 text-sm text-stone-500">Няма намерени резултати.</p>
        ) : (
          <ul className="mt-6 divide-y divide-stone-800 border-y border-stone-800">
            {items.map((e) => (
              <li key={e.id} className="py-3 grid grid-cols-1 sm:grid-cols-12 gap-2 text-sm">
                <div className="sm:col-span-5 font-medium">{e.name || "—"}</div>
                <div className="sm:col-span-2 text-stone-400">{e.entity_type || "—"}</div>
                <div className="sm:col-span-2 text-stone-400">{e.sanction_type || "—"}</div>
                <div className="sm:col-span-3 text-xs text-stone-500">{e.sanctioning_body || "—"}</div>
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
