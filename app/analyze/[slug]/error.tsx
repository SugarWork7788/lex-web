"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useParams } from "next/navigation";

export default function AnalyzeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("AnalyzeError:", error);
  }, [error]);

  const params = useParams<{ slug?: string }>();
  const slug = params?.slug;

  return (
    <div className="mx-auto max-w-2xl px-6 py-20 text-center">
      <p className="text-xs uppercase tracking-wider text-red-700 dark:text-red-400 font-medium">
        Грешка при AI анализ
      </p>
      <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight">
        Анализът прекъсна
      </h1>
      <p className="mt-3 text-black/65 dark:text-white/65">
        Многостъпковият анализ не успя да завърши. Това може да е временен
        проблем с AI услугата или с базата от закони — рестартирането обикновено
        помага.
      </p>
      {error.digest && (
        <p className="mt-2 text-[11px] font-mono text-black/35 dark:text-white/35">
          ID: {error.digest}
        </p>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
        >
          ↻ Стартирай анализа отново
        </button>
        <Link
          href={slug ? `/laws/${slug}` : "/laws"}
          className="inline-flex items-center gap-1.5 rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/[0.04] dark:border-white/15 dark:hover:bg-white/[0.06]"
        >
          ← Върни се назад
        </Link>
      </div>
    </div>
  );
}
