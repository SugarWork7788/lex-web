import Link from "next/link";
import { CATEGORIES } from "@/lib/categories";
import { getCategoryCounts } from "@/lib/queries";

export const revalidate = 3600;

export default async function HomePage() {
  const counts = await getCategoryCounts();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <section className="text-center">
        <h1 className="font-serif text-4xl sm:text-5xl font-semibold tracking-tight">
          Българско законодателство
        </h1>
        <p className="mt-4 text-base sm:text-lg text-black/70 dark:text-white/70 max-w-2xl mx-auto">
          Търсене и преглед на {total.toLocaleString("bg-BG")} нормативни акта —
          конституция, кодекси, закони, наредби и правилници.
        </p>

        <form
          action="/search"
          method="get"
          className="mt-10 flex gap-2 max-w-2xl mx-auto"
        >
          <input
            type="search"
            name="q"
            required
            placeholder="Например: договор, наследство, чл. 26"
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

      <section className="mt-20">
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
                    {(counts[c.key] ?? 0).toLocaleString("bg-BG")}
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
