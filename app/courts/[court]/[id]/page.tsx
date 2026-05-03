import Link from "next/link";
import { notFound } from "next/navigation";
import { getCourtDecision } from "@/lib/queries";
import { CourtBanner, type CourtKey } from "@/app/components/section-banner";

export const revalidate = 86400;

const COURT_CODE: Record<string, string> = {
  vks: "SC",
  vas: "SA",
  ks: "CC",
};

type Props = {
  params: Promise<{ court: string; id: string }>;
};

export default async function DecisionPage({ params }: Props) {
  const { court, id } = await params;
  if (!COURT_CODE[court]) notFound();

  const decision = await getCourtDecision(id);
  if (!decision) notFound();

  return (
    <div>
      <CourtBanner court={court as CourtKey} />

      <article className="mx-auto max-w-3xl px-6 py-10">
        <nav className="text-sm mb-6">
          <Link
            href={`/courts/${court}`}
            className="text-black/60 dark:text-white/60 hover:underline"
          >
            ← Обратно към {decision.court}
          </Link>
        </nav>

        <header className="border-b border-black/[0.08] dark:border-white/[0.08] pb-6">
          <h1 className="font-serif text-3xl font-semibold tracking-tight leading-tight">
            {decision.title ||
              decision.decision_number ||
              decision.case_number ||
              "Решение"}
          </h1>

          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {decision.decision_date && (
              <div>
                <dt className="text-black/45 dark:text-white/45 text-xs uppercase tracking-wide">
                  Дата
                </dt>
                <dd className="font-medium">{decision.decision_date}</dd>
              </div>
            )}
            {decision.act_type && (
              <div>
                <dt className="text-black/45 dark:text-white/45 text-xs uppercase tracking-wide">
                  Вид
                </dt>
                <dd className="font-medium">{decision.act_type}</dd>
              </div>
            )}
            {decision.college && (
              <div>
                <dt className="text-black/45 dark:text-white/45 text-xs uppercase tracking-wide">
                  Колегия
                </dt>
                <dd className="font-medium">{decision.college}</dd>
              </div>
            )}
            {decision.case_number && (
              <div>
                <dt className="text-black/45 dark:text-white/45 text-xs uppercase tracking-wide">
                  Дело
                </dt>
                <dd className="font-medium">{decision.case_number}</dd>
              </div>
            )}
            {decision.ecli && (
              <div className="w-full">
                <dt className="text-black/45 dark:text-white/45 text-xs uppercase tracking-wide">
                  ECLI
                </dt>
                <dd className="font-mono text-xs">{decision.ecli}</dd>
              </div>
            )}
          </dl>

          {decision.cited_law_slugs.length > 0 && (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wide text-black/45 dark:text-white/45 mb-2">
                Цитирани закони
              </p>
              <div className="flex flex-wrap gap-1.5">
                {decision.cited_law_slugs.map((slug) => (
                  <Link
                    key={slug}
                    href={`/laws/${slug}`}
                    className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs text-amber-900 hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200"
                  >
                    {slug}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <Link
              href={`/analyze/${decision.cited_law_slugs[0] ?? "konstitutsiya-na-republika-balgariya"}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
            >
              ✦ Анализирай свързан закон
            </Link>
            <a
              href={decision.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-black/15 dark:border-white/15 px-3 py-1.5 text-xs hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
            >
              Оригинал ↗
            </a>
          </div>
        </header>

        <div className="mt-8 font-serif text-[1.0625rem] leading-relaxed whitespace-pre-line text-black/85 dark:text-white/85">
          {decision.full_text}
        </div>
      </article>
    </div>
  );
}
