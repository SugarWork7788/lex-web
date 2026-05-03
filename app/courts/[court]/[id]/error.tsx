"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useParams } from "next/navigation";

export default function DecisionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("DecisionError:", error);
  }, [error]);

  const params = useParams<{ court?: string; id?: string }>();
  const courtSlug =
    params?.court === "vks" || params?.court === "vas" || params?.court === "ks"
      ? params.court
      : null;

  return (
    <div className="mx-auto max-w-2xl px-6 py-20 text-center">
      <p className="text-xs uppercase tracking-wider text-red-700 dark:text-red-400 font-medium">
        Грешка при зареждане на решението
      </p>
      <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight">
        Не успяхме да отворим това решение
      </h1>
      <p className="mt-3 text-black/65 dark:text-white/65">
        Текстът на решението може да не е наличен или връзката с базата данни е
        прекъсната за момент. Опитайте отново след секунда.
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
          ↻ Опитай отново
        </button>
        <Link
          href={courtSlug ? `/courts/${courtSlug}` : "/courts"}
          className="inline-flex items-center gap-1.5 rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/[0.04] dark:border-white/15 dark:hover:bg-white/[0.06]"
        >
          ← Върни се назад
        </Link>
      </div>
    </div>
  );
}
