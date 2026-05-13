import Link from "next/link";
import { getIntelCounts } from "@/lib/queries";

export const revalidate = 600;

const DESC =
  "Разузнавателен център: санкционирани лица, офшорни структури, ЕС антикорупционни производства, разследваща журналистика и прокурорски казуси.";

export const metadata = {
  title: "Разузнавателен център",
  description: DESC,
  openGraph: { title: "Intel Center • lex.bg", description: DESC },
};

export default async function IntelPage() {
  const c = await getIntelCounts();

  const stats = [
    { n: c.sanctioned, label: "Санкционирани лица и организации", href: "/intel/sanctions" },
    { n: c.offshore,   label: "Офшорни структури",                href: "/intel/offshore" },
    { n: c.olaf,       label: "OLAF разследвания",                href: "/intel/olaf" },
    { n: c.kzk,        label: "КЗК решения",                      href: "/intel/kzk" },
    { n: c.bnb,        label: "БНБ актове",                       href: "/intel/bnb" },
    { n: c.articles,   label: "Разследващи статии",               href: "/intel/articles" },
    { n: c.prosecution,label: "Прокурорски случаи",               href: "/intel/prosecution" },
    { n: c.nap,        label: "НАП указания",                     href: "/issues" },
  ];

  return (
    <div className="bg-stone-950 text-stone-100">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
        <header className="border-b border-stone-800 pb-6">
          <p className="text-xs uppercase tracking-[0.18em] text-red-400 font-medium">
            Разузнавателен център · Intel Center
          </p>
          <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-semibold tracking-tight">
            Сигнали, разследвания и санкции
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-stone-300">
            Обединява публични източници — OpenSanctions, ICIJ Offshore Leaks,
            OLAF, EPPO, Прокуратура на РБ, разследваща журналистика — около
            български лица и компании.
          </p>
        </header>

        <Link
          href="/intel/search"
          className="mt-8 group flex items-center gap-4 rounded-lg border border-red-700/60 bg-gradient-to-r from-red-950/40 to-stone-900/60 p-5 hover:border-red-500 transition"
        >
          <span className="text-3xl">✦</span>
          <div className="flex-1">
            <div className="font-serif text-lg font-semibold">Търси в Intel</div>
            <p className="mt-0.5 text-xs text-stone-400">
              Едновременно търсене във всички 6 бази + AI обобщение на намереното
            </p>
          </div>
          <span className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white group-hover:bg-red-600">
            Отвори →
          </span>
        </Link>

        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="group flex h-full flex-col justify-between rounded-lg border border-stone-800 bg-stone-900/60 p-5 hover:border-red-500/60 hover:bg-stone-900 transition"
              >
                <div className="text-3xl font-semibold tabular-nums text-red-300">
                  {s.n.toLocaleString("bg-BG")}
                </div>
                <div className="mt-1 text-sm text-stone-300 group-hover:text-stone-100">
                  {s.label}
                </div>
                <div className="mt-3 text-[11px] uppercase tracking-wider text-stone-500 group-hover:text-red-400">
                  Отвори →
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-10 rounded-md border border-amber-700/40 bg-amber-950/20 p-4 text-xs text-amber-200/80">
          <strong className="font-semibold">Важно.</strong> Информацията е
          компилирана от публични източници и е ориентировъчна. Името в санкционен
          списък или ICIJ leak не предполага наказателна отговорност. Винаги
          сверявайте с първоизточника.
        </div>
      </div>
    </div>
  );
}
