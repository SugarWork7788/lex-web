import Link from "next/link";
import { CATEGORIES } from "@/lib/categories";
import {
  getCategoryCounts,
  getCourtCounts,
  getEuCounts,
} from "@/lib/queries";

export const revalidate = 3600;

const HOME_DESC =
  "Цялото българско законодателство, съдебна практика на върховните съдилища и приложимото европейско право, обогатени с AI резюмета, чат и многостъпков правен анализ.";

export const metadata = {
  title: "Българско законодателство и съдебна практика",
  description: HOME_DESC,
  openGraph: {
    title: "lex.bg • Българско законодателство",
    description: HOME_DESC,
  },
  twitter: {
    title: "lex.bg • Българско законодателство",
    description: HOME_DESC,
  },
};

export default async function HomePage() {
  const [lawCounts, courtCounts, euCounts] = await Promise.all([
    getCategoryCounts(),
    getCourtCounts(),
    getEuCounts(),
  ]);

  const totalLaws = Object.values(lawCounts).reduce((a, b) => a + b, 0);
  const totalDecisions = Object.values(courtCounts).reduce((a, b) => a + b, 0);
  const totalEu = Object.values(euCounts).reduce((a, b) => a + b, 0);

  const stats = [
    {
      n: totalLaws,
      label: totalLaws === 1 ? "закон" : "закона",
      href: "/laws",
    },
    {
      n: totalDecisions,
      label: totalDecisions === 1 ? "решение" : "решения",
      href: "/courts",
    },
    {
      n: totalEu,
      label: totalEu === 1 ? "EU акт" : "EU акта",
      href: "/eu",
    },
  ];

  const quickLinks = [
    {
      href: "/laws",
      title: "Закони",
      description: "Конституция, кодекси, закони, наредби, правилници",
    },
    {
      href: "/courts",
      title: "Съдебна практика",
      description: "Решения на КС, ВКС и ВАС с AI резюме и чат",
    },
    {
      href: "/analyze",
      title: "AI анализ",
      description: "Открива конфликти, неясноти и проблеми в закон",
    },
    {
      href: "/compare",
      title: "Сравнение",
      description: "Двата закона един до друг с AI коментар",
    },
    {
      href: "/eu",
      title: "ЕС право",
      description: "Регламенти и директиви на ЕС, приложими в България",
    },
    {
      href: "/issues",
      title: "Открити проблеми",
      description: "AI-открити правни конфликти из целия корпус",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <section className="text-center">
        <h1 className="font-serif text-4xl sm:text-5xl font-semibold tracking-tight">
          Българско законодателство
        </h1>
        <p className="mt-4 text-base sm:text-lg text-black/70 dark:text-white/70 max-w-2xl mx-auto">
          Търсене и анализ на цялото българско право, съдебна практика на
          върховните съдилища и приложимото европейско право — на едно място.
        </p>

        <ul className="mt-7 flex flex-wrap justify-center gap-x-2 gap-y-2 text-sm">
          {stats.map((s, i) => (
            <li key={s.href} className="flex items-center gap-2">
              <Link
                href={s.href}
                className="rounded-full border border-black/10 bg-white px-3 py-1 hover:border-amber-700 hover:bg-amber-50 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-amber-400 dark:hover:bg-amber-950/30"
              >
                <strong className="font-semibold tabular-nums">
                  {s.n.toLocaleString("bg-BG")}
                </strong>{" "}
                <span className="text-black/65 dark:text-white/65">
                  {s.label}
                </span>
              </Link>
              {i < stats.length - 1 && (
                <span className="text-black/25 dark:text-white/25">•</span>
              )}
            </li>
          ))}
        </ul>

        <form
          action="/search"
          method="get"
          className="mt-10 flex gap-2 max-w-2xl mx-auto"
        >
          <input
            type="search"
            name="q"
            required
            placeholder="Търсене в закони, съдебни решения и ЕС право"
            className="flex-1 rounded-md border border-black/15 dark:border-white/15 bg-white dark:bg-black/30 px-4 py-3 text-base outline-none focus:border-amber-700 dark:focus:border-amber-400"
            aria-label="Търсене"
          />
          <button
            type="submit"
            className="rounded-md bg-amber-700 hover:bg-amber-800 text-white px-5 py-3 text-base font-medium"
          >
            Търси
          </button>
        </form>
      </section>

      <section className="mt-16">
        <h2 className="font-serif text-2xl font-semibold mb-6">Бързи връзки</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((q) => (
            <li key={q.href}>
              <Link
                href={q.href}
                className="block h-full rounded-lg border border-black/10 dark:border-white/10 px-5 py-4 hover:border-amber-700 dark:hover:border-amber-400 hover:bg-white dark:hover:bg-white/5 transition-colors"
              >
                <div className="font-serif text-lg font-semibold">
                  {q.title}
                </div>
                <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                  {q.description}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-16">
        <h2 className="font-serif text-2xl font-semibold mb-6">
          Разглеждане по категория
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {CATEGORIES.map((c) => (
            <li key={c.key}>
              <Link
                href={`/laws?category=${c.key}`}
                className="block rounded-lg border border-black/10 dark:border-white/10 px-5 py-4 hover:border-amber-700 dark:hover:border-amber-400 hover:bg-white dark:hover:bg-white/5 transition-colors"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-serif text-lg">{c.name_bg}</span>
                  <span className="text-sm tabular-nums text-black/60 dark:text-white/60">
                    {(lawCounts[c.key] ?? 0).toLocaleString("bg-BG")}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
