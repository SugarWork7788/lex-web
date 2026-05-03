import Link from "next/link";
import { notFound } from "next/navigation";
import { getLawBySlug } from "@/lib/queries";
import { AnalysisStream } from "./analysis-stream";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const law = await getLawBySlug(slug);
  if (!law) return { title: "Не е намерен закон" };
  return {
    title: `AI анализ • ${law.name_bg}`,
    description: `Многостъпков AI анализ на ${law.name_bg} срещу цялата база от 1240 български закона.`,
  };
}

export default async function AnalyzePage({ params }: Props) {
  const { slug } = await params;
  const law = await getLawBySlug(slug);
  if (!law) notFound();

  return (
    <article className="mx-auto max-w-4xl px-6 py-10">
      <nav className="text-sm print:hidden">
        <Link
          href={`/laws/${slug}`}
          className="text-black/60 dark:text-white/60 hover:underline"
        >
          ← Назад към {law.name_bg}
        </Link>
      </nav>

      <header className="mt-4 border-b border-black/[0.08] dark:border-white/[0.08] pb-6">
        <p className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400 font-medium">
          Многостъпков анализ с изкуствен интелект
        </p>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
          {law.name_bg}
        </h1>
        <p className="mt-3 text-sm text-black/60 dark:text-white/60">
          Анализ срещу Конституцията и цялата база от 1240 български закона.
          Релевантните разпоредби се намират чрез full-text search, а критичните
          конфликти преминават през допълнителен задълбочен преглед.
        </p>
      </header>

      <AnalysisStream targetSlug={slug} targetName={law.name_bg} />
    </article>
  );
}
