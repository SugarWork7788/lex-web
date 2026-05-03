import Link from "next/link";
import { notFound } from "next/navigation";
import { getLawBySlug } from "@/lib/queries";
import { CompareStream } from "./compare-stream";

type Props = {
  params: Promise<{ slug1: string; slug2: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { slug1, slug2 } = await params;
  const [l1, l2] = await Promise.all([getLawBySlug(slug1), getLawBySlug(slug2)]);
  if (!l1 || !l2) return { title: "Сравнение не е намерено" };
  return {
    title: `${l1.name_bg} ⟺ ${l2.name_bg} • Сравнение`,
    description: `AI сравнение на ${l1.name_bg} и ${l2.name_bg}.`,
  };
}

export default async function ComparisonPage({ params }: Props) {
  const { slug1, slug2 } = await params;
  if (slug1 === slug2) notFound();
  const [law1, law2] = await Promise.all([
    getLawBySlug(slug1),
    getLawBySlug(slug2),
  ]);
  if (!law1 || !law2) notFound();

  return (
    <article className="mx-auto max-w-5xl px-6 py-10">
      <nav className="text-sm">
        <Link
          href="/compare"
          className="text-black/60 dark:text-white/60 hover:underline"
        >
          ← Друго сравнение
        </Link>
      </nav>

      <header className="mt-4 border-b border-black/[0.08] dark:border-white/[0.08] pb-6">
        <p className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400 font-medium">
          Сравнение с изкуствен интелект
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <Link
            href={`/laws/${law1.slug}`}
            className="block rounded-lg border border-black/[0.08] bg-white px-4 py-3 hover:bg-black/[0.02] dark:border-white/[0.1] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
          >
            <h1 className="font-serif text-lg font-semibold leading-snug">
              {law1.name_bg}
            </h1>
            <p className="mt-1 text-xs text-black/55 dark:text-white/55">
              {law1.article_count.toLocaleString("bg-BG")} члена · {law1.category}
            </p>
          </Link>
          <div className="text-center text-3xl font-light text-amber-700 dark:text-amber-400">
            ⟺
          </div>
          <Link
            href={`/laws/${law2.slug}`}
            className="block rounded-lg border border-black/[0.08] bg-white px-4 py-3 hover:bg-black/[0.02] dark:border-white/[0.1] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
          >
            <h1 className="font-serif text-lg font-semibold leading-snug">
              {law2.name_bg}
            </h1>
            <p className="mt-1 text-xs text-black/55 dark:text-white/55">
              {law2.article_count.toLocaleString("bg-BG")} члена · {law2.category}
            </p>
          </Link>
        </div>
      </header>

      <CompareStream
        slug1={law1.slug}
        name1={law1.name_bg}
        slug2={law2.slug}
        name2={law2.name_bg}
      />
    </article>
  );
}
