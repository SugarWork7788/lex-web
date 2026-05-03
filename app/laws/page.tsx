import Link from "next/link";
import { CATEGORIES, isCategoryKey } from "@/lib/categories";
import { listLaws } from "@/lib/queries";

export const revalidate = 3600;

type Props = {
  searchParams: Promise<{ category?: string }>;
};

export default async function LawsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const activeCategory =
    sp.category && isCategoryKey(sp.category) ? sp.category : undefined;
  const laws = await listLaws(activeCategory);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="font-serif text-3xl font-semibold tracking-tight">
        Закони
      </h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        {laws.length.toLocaleString("bg-BG")}{" "}
        {laws.length === 1 ? "акт" : "акта"}
        {activeCategory ? " в избраната категория" : " общо"}.
      </p>

      <nav className="mt-6 flex flex-wrap gap-2 text-sm">
        <Link
          href="/laws"
          className={
            "rounded-full px-3 py-1.5 border " +
            (!activeCategory
              ? "bg-amber-700 text-white border-amber-700"
              : "border-black/15 dark:border-white/15 hover:border-amber-700")
          }
        >
          Всички
        </Link>
        {CATEGORIES.map((c) => (
          <Link
            key={c.key}
            href={`/laws?category=${c.key}`}
            className={
              "rounded-full px-3 py-1.5 border " +
              (activeCategory === c.key
                ? "bg-amber-700 text-white border-amber-700"
                : "border-black/15 dark:border-white/15 hover:border-amber-700")
            }
          >
            {c.name_bg}
          </Link>
        ))}
      </nav>

      <ul className="mt-8 divide-y divide-black/[0.08] dark:divide-white/[0.08] border-y border-black/[0.08] dark:border-white/[0.08]">
        {laws.map((law) => (
          <li key={law.slug}>
            <Link
              href={`/laws/${law.slug}`}
              className="flex items-baseline justify-between gap-4 px-2 py-3 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
            >
              <span className="font-serif">{law.name_bg}</span>
              <span className="shrink-0 text-xs tabular-nums text-black/55 dark:text-white/55">
                {law.level_name ?? ""} • {law.article_count} чл.
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {laws.length === 0 && (
        <p className="mt-12 text-center text-black/60 dark:text-white/60">
          Няма намерени актове.
        </p>
      )}
    </div>
  );
}
