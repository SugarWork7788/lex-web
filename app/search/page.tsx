import Link from "next/link";
import { searchArticles } from "@/lib/queries";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export const metadata = {
  title: "Търсене • lex.bg",
};

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const hits = query ? await searchArticles(query, 50) : [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-serif text-3xl font-semibold tracking-tight">
        Търсене
      </h1>

      <form action="/search" method="get" className="mt-6 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          required
          placeholder="Например: договор, наследство"
          className="flex-1 rounded-md border border-black/15 dark:border-white/15 bg-white dark:bg-black/30 px-4 py-2.5 text-base outline-none focus:border-amber-700 dark:focus:border-amber-400"
          aria-label="Заявка"
        />
        <button
          type="submit"
          className="rounded-md bg-amber-700 hover:bg-amber-800 text-white px-4 py-2.5 text-base font-medium"
        >
          Търси
        </button>
      </form>

      {!query && (
        <p className="mt-10 text-black/60 dark:text-white/60">
          Въведете дума или фраза, за да започнете търсенето в пълния корпус
          закони.
        </p>
      )}

      {query && (
        <p className="mt-6 text-sm text-black/60 dark:text-white/60">
          {hits.length === 0
            ? `Няма намерени резултати за „${query}".`
            : `${hits.length.toLocaleString("bg-BG")} ${
                hits.length === 1 ? "резултат" : "резултата"
              } за „${query}".`}
        </p>
      )}

      <ul className="mt-8 space-y-6">
        {hits.map((h, i) => (
          <li
            key={`${h.law_slug}-${h.article_number}-${i}`}
            className="border-b border-black/[0.08] dark:border-white/[0.08] pb-6"
          >
            <Link
              href={`/laws/${h.law_slug}#art-${encodeURIComponent(
                h.article_number,
              )}`}
              className="block group"
            >
              <div className="text-xs uppercase tracking-wide text-black/55 dark:text-white/55">
                {h.law_name_bg}
              </div>
              <div className="font-serif text-lg font-semibold mt-0.5 group-hover:underline">
                Чл. {h.article_number}
                {h.chapter_title && (
                  <span className="font-normal text-black/60 dark:text-white/60">
                    {" "}
                    — {h.chapter_title}
                  </span>
                )}
              </div>
              <p
                className="mt-2 text-[0.95rem] leading-relaxed text-black/80 dark:text-white/80 law-prose"
                dangerouslySetInnerHTML={{ __html: h.snippet }}
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
