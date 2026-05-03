import Link from "next/link";
import { getCourtCounts } from "@/lib/queries";

export const revalidate = 3600;
export const metadata = {
  title: "Съдебна практика • lex.bg",
  description: "Решения на ВКС, ВАС и Конституционния съд на България",
};

const COURTS = [
  {
    slug: "vks",
    code: "SC",
    short: "ВКС",
    full: "Върховен касационен съд",
    desc: "Върховна инстанция по граждански, наказателни и търговски дела. Тълкувателните решения на ВКС са задължителни за всички съдилища.",
    icon: "⚖",
    colors: {
      card: "bg-indigo-50 hover:bg-indigo-100/80 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800/60",
      badge: "bg-indigo-600 text-white",
      btn: "bg-indigo-600 hover:bg-indigo-700 text-white",
    },
  },
  {
    slug: "vas",
    code: "SA",
    short: "ВАС",
    full: "Върховен административен съд",
    desc: "Упражнява върховен съдебен надзор върху актовете на изпълнителната власт. Отменя наредби и заповеди, противоречащи на закона.",
    icon: "🏛",
    colors: {
      card: "bg-teal-50 hover:bg-teal-100/80 dark:bg-teal-950/30 dark:hover:bg-teal-950/50 border-teal-200 dark:border-teal-800/60",
      badge: "bg-teal-600 text-white",
      btn: "bg-teal-600 hover:bg-teal-700 text-white",
    },
  },
  {
    slug: "ks",
    code: "CC",
    short: "КС",
    full: "Конституционен съд",
    desc: "Решава дали законите съответстват на Конституцията. Решенията на КС са задължителни за всички държавни органи и граждани.",
    icon: "📜",
    colors: {
      card: "bg-rose-50 hover:bg-rose-100/80 dark:bg-rose-950/30 dark:hover:bg-rose-950/50 border-rose-200 dark:border-rose-800/60",
      badge: "bg-rose-600 text-white",
      btn: "bg-rose-600 hover:bg-rose-700 text-white",
    },
  },
];

export default async function CourtsPage() {
  const counts = await getCourtCounts().catch(
    (): Record<string, number> => ({}),
  );

  return (
    <div className="min-h-screen">
      <div className="border-b border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] px-6 py-3">
        <div className="mx-auto max-w-5xl flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-indigo-500" />
          <span className="text-xs font-semibold uppercase tracking-widest text-black/60 dark:text-white/60">
            Съдебна практика
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-10">
          <h1 className="font-serif text-4xl font-semibold tracking-tight">
            Съдебна практика
          </h1>
          <p className="mt-3 text-black/60 dark:text-white/60 max-w-2xl">
            Решения на върховните съдилища на България.
            Тълкувателните решения са задължителни за всички съдилища и органи.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-3">
          {COURTS.map((court) => {
            const count = counts[court.code] ?? 0;
            return (
              <Link
                key={court.slug}
                href={`/courts/${court.slug}`}
                className={`group rounded-xl border p-6 transition-all ${court.colors.card}`}
              >
                <div className="flex items-start justify-between">
                  <span className="text-3xl">{court.icon}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${court.colors.badge}`}
                  >
                    {court.short}
                  </span>
                </div>
                <h2 className="mt-4 font-serif text-xl font-semibold leading-snug">
                  {court.full}
                </h2>
                <p className="mt-2 text-sm text-black/65 dark:text-white/65 leading-relaxed">
                  {court.desc}
                </p>
                <div className="mt-6 flex items-center justify-between">
                  <span className="text-sm text-black/45 dark:text-white/45">
                    {count > 0
                      ? `${count.toLocaleString("bg-BG")} решения`
                      : "Зарежда се…"}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-transform group-hover:translate-x-0.5 ${court.colors.btn}`}
                  >
                    Виж →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        <Link
          href="/eu"
          className="mt-8 flex items-center gap-4 rounded-xl border border-yellow-200 dark:border-yellow-800/60 bg-yellow-50/60 dark:bg-yellow-950/20 px-6 py-5 hover:bg-yellow-100/60 dark:hover:bg-yellow-950/30 transition-colors"
        >
          <span className="text-2xl">★</span>
          <div className="flex-1">
            <h3 className="font-semibold text-yellow-900 dark:text-yellow-200">
              Европейско право
            </h3>
            <p className="mt-0.5 text-sm text-yellow-800/80 dark:text-yellow-300/80">
              Регламенти и директиви на ЕС — пряко приложими в България
            </p>
          </div>
          <span className="shrink-0 rounded-md bg-yellow-500 px-4 py-2 text-sm font-medium text-yellow-950 hover:bg-yellow-400">
            Разгледай →
          </span>
        </Link>
      </div>
    </div>
  );
}
