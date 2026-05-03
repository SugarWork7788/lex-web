import Link from "next/link";
import { notFound } from "next/navigation";
import { buildPills } from "@/lib/analyze-context";
import { AnalysisStream } from "./analysis-stream";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const pills = await buildPills(slug);
  if (!pills) return { title: "Не е намерен закон" };
  return {
    title: `AI анализ • ${pills.target.name_bg}`,
    description: `Кръстосан правен анализ на ${pills.target.name_bg} срещу Конституцията и свързаните закони.`,
  };
}

export default async function AnalyzePage({ params }: Props) {
  const { slug } = await params;
  const pills = await buildPills(slug);
  if (!pills) notFound();

  const totalAnalyzed =
    pills.referenced.length + (pills.constitution ? 1 : 0) + 1;

  return (
    <article className="mx-auto max-w-4xl px-6 py-10">
      <nav className="text-sm print:hidden">
        <Link
          href={`/laws/${slug}`}
          className="text-black/60 dark:text-white/60 hover:underline"
        >
          ← Назад към {pills.target.name_bg}
        </Link>
      </nav>

      <header className="mt-4 border-b border-black/[0.08] dark:border-white/[0.08] pb-6">
        <p className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400 font-medium">
          Анализ с изкуствен интелект
        </p>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
          {pills.target.name_bg}
        </h1>
        <p className="mt-3 text-sm text-black/60 dark:text-white/60">
          Кръстосана проверка срещу {totalAnalyzed - 1} други нормативни акта.
          Резултатите са ориентировъчни и не заместват професионално правно
          мнение.
        </p>
      </header>

      <section className="mt-6 print:hidden">
        <h2 className="text-xs uppercase tracking-wider font-medium text-black/55 dark:text-white/55">
          Анализирани закони ({totalAnalyzed})
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <PillLink
            slug={pills.target.slug}
            label={pills.target.name_bg}
            icon="★"
            tone="target"
          />
          {pills.constitution && (
            <PillLink
              slug={pills.constitution.slug}
              label={pills.constitution.name_bg}
              icon="⚖"
              tone="constitution"
            />
          )}
          {pills.referenced.map((r) => (
            <PillLink key={r.slug} slug={r.slug} label={r.name_bg} tone="ref" />
          ))}
        </div>
      </section>

      <AnalysisStream
        targetSlug={pills.target.slug}
        targetName={pills.target.name_bg}
        initialLawsMap={pills.lawsMap}
        analyzedCount={totalAnalyzed}
      />
    </article>
  );
}

function PillLink({
  slug,
  label,
  icon,
  tone,
}: {
  slug: string;
  label: string;
  icon?: string;
  tone: "target" | "constitution" | "ref";
}) {
  const truncated = label.length > 48 ? label.slice(0, 46) + "…" : label;
  const toneClass =
    tone === "target"
      ? "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-600/60 dark:bg-amber-950/40 dark:text-amber-200"
      : tone === "constitution"
        ? "border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-700/60 dark:bg-indigo-950/40 dark:text-indigo-200"
        : "border-black/10 bg-white text-black/75 hover:bg-black/[0.03] dark:border-white/15 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.06]";
  return (
    <Link
      href={`/laws/${slug}`}
      title={label}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${toneClass}`}
    >
      {icon && <span aria-hidden>{icon}</span>}
      <span>{truncated}</span>
    </Link>
  );
}
