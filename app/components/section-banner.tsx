"use client";

const COURT_CONFIG = {
  vks: {
    label: "Върховен касационен съд",
    short: "ВКС",
    code: "SC",
    desc: "Граждански, наказателни и търговски дела",
    strip: "bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800/60",
    text: "text-indigo-900 dark:text-indigo-200",
    badge: "bg-indigo-600 text-white",
    dot: "bg-indigo-500",
  },
  vas: {
    label: "Върховен административен съд",
    short: "ВАС",
    code: "SA",
    desc: "Административни дела и актове на изпълнителната власт",
    strip: "bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800/60",
    text: "text-teal-900 dark:text-teal-200",
    badge: "bg-teal-600 text-white",
    dot: "bg-teal-500",
  },
  ks: {
    label: "Конституционен съд",
    short: "КС",
    code: "CC",
    desc: "Решения за съответствие на закони с Конституцията",
    strip: "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60",
    text: "text-rose-900 dark:text-rose-200",
    badge: "bg-rose-600 text-white",
    dot: "bg-rose-500",
  },
} as const;

export type CourtKey = keyof typeof COURT_CONFIG;

export function CourtBanner({ court }: { court: CourtKey }) {
  const c = COURT_CONFIG[court];
  return (
    <div className={`border-b px-6 py-3 ${c.strip}`}>
      <div className="mx-auto max-w-5xl flex items-center gap-3">
        <span className={`h-2 w-2 rounded-full ${c.dot}`} />
        <span className={`text-xs font-semibold uppercase tracking-widest ${c.text}`}>
          Съдебна практика
        </span>
        <span className="text-black/30 dark:text-white/30">›</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${c.badge}`}>
          {c.short}
        </span>
        <span className={`text-sm ${c.text}`}>{c.label}</span>
        <span className="ml-auto text-xs text-black/40 dark:text-white/40 hidden md:block">
          {c.desc}
        </span>
      </div>
    </div>
  );
}

export function EuBanner() {
  return (
    <div className="border-b border-yellow-200 dark:border-yellow-800/60 bg-yellow-50/60 dark:bg-yellow-950/20 px-6 py-3">
      <div className="mx-auto max-w-5xl flex items-center gap-3">
        <span className="h-2 w-2 rounded-full bg-yellow-500" />
        <span className="text-xs font-semibold uppercase tracking-widest text-yellow-900 dark:text-yellow-300">
          Европейско право
        </span>
        <span className="text-black/30 dark:text-white/30">›</span>
        <span className="text-sm text-yellow-900 dark:text-yellow-200">
          Регламенти и директиви на ЕС в сила за България
        </span>
      </div>
    </div>
  );
}
