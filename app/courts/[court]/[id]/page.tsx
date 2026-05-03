import Link from "next/link";
import { notFound } from "next/navigation";
import { getCourtDecision } from "@/lib/queries";
import { CourtBanner, type CourtKey } from "@/app/components/section-banner";
import { DecisionAI } from "./decision-ai";

export const revalidate = 86400;

const COURT_CODE: Record<string, string> = {
  vks: "SC",
  vas: "SA",
  ks: "CC",
};

const COURT_LABEL: Record<string, string> = {
  vks: "ВКС",
  vas: "ВАС",
  ks: "Конституционен съд",
};

type Props = {
  params: Promise<{ court: string; id: string }>;
};

function slugToLabel(slug: string, max = 40): string {
  const display = slug.replace(/-/g, " ");
  return display.length > max ? display.slice(0, max - 1) + "…" : display;
}

export default async function DecisionPage({ params }: Props) {
  const { court, id } = await params;
  if (!COURT_CODE[court]) notFound();

  const decision = await getCourtDecision(id);
  if (!decision) notFound();

  const titleText =
    decision.title ||
    decision.decision_number ||
    decision.case_number ||
    "Решение";
  const firstCited = decision.cited_law_slugs?.[0];

  return (
    <div className="flex flex-col md:flex-row md:items-start">
      {/* LEFT COLUMN — decision content */}
      <article className="w-full px-6 py-10 md:w-[55%]">
        <div className="mx-auto max-w-3xl">
          <nav className="text-xs text-black/55 dark:text-white/55 mb-3 print:hidden">
            <Link href="/courts" className="hover:underline">
              Съдебна практика
            </Link>
            <span className="mx-1.5 text-black/30 dark:text-white/30">/</span>
            <Link href={`/courts/${court}`} className="hover:underline">
              {COURT_LABEL[court]}
            </Link>
            <span className="mx-1.5 text-black/30 dark:text-white/30">/</span>
            <span className="text-black/70 dark:text-white/70">
              {titleText.length > 60 ? titleText.slice(0, 59) + "…" : titleText}
            </span>
          </nav>

          <CourtBanner court={court as CourtKey} />

          <header className="mt-5 border-b border-black/[0.08] dark:border-white/[0.08] pb-6">
            <h1 className="font-serif text-3xl font-semibold tracking-tight leading-tight">
              {titleText}
            </h1>

            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              {decision.act_type && (
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-black/45 dark:text-white/45">
                    Вид акт
                  </dt>
                  <dd className="font-medium">{decision.act_type}</dd>
                </div>
              )}
              {decision.decision_date && (
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-black/45 dark:text-white/45">
                    Дата
                  </dt>
                  <dd className="font-medium">{decision.decision_date}</dd>
                </div>
              )}
              {decision.case_number && (
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-black/45 dark:text-white/45">
                    Дело
                  </dt>
                  <dd className="font-medium">{decision.case_number}</dd>
                </div>
              )}
              {decision.decision_number && (
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-black/45 dark:text-white/45">
                    Решение №
                  </dt>
                  <dd className="font-medium">{decision.decision_number}</dd>
                </div>
              )}
              {decision.college && (
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-black/45 dark:text-white/45">
                    Отделение
                  </dt>
                  <dd className="font-medium">{decision.college}</dd>
                </div>
              )}
              {decision.ecli && (
                <div className="col-span-2 sm:col-span-3">
                  <dt className="text-[11px] uppercase tracking-wide text-black/45 dark:text-white/45">
                    ECLI
                  </dt>
                  <dd className="font-mono text-xs">{decision.ecli}</dd>
                </div>
              )}
            </dl>

            {decision.cited_law_slugs && decision.cited_law_slugs.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] uppercase tracking-wide text-black/45 dark:text-white/45 mb-2">
                  Цитирани закони
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {decision.cited_law_slugs.map((s) => (
                    <Link
                      key={s}
                      href={`/laws/${s}`}
                      title={s}
                      className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs text-amber-900 hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200"
                    >
                      {slugToLabel(s)}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href={decision.source_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-black/15 px-3 py-1.5 text-xs hover:bg-black/[0.03] dark:border-white/15 dark:hover:bg-white/[0.04]"
              >
                Оригинал ↗
              </a>
              {firstCited && (
                <Link
                  href={`/analyze/${firstCited}`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
                >
                  ✦ Анализирай свързания закон
                </Link>
              )}
            </div>
          </header>

          <div className="mt-8 font-serif text-[1.0625rem] leading-relaxed whitespace-pre-line text-black/85 dark:text-white/85">
            {decision.full_text}
          </div>
        </div>
      </article>

      {/* RIGHT COLUMN — sticky AI panel (md+); stacked below on mobile */}
      <aside className="w-full border-t border-black/[0.08] dark:border-white/[0.08] md:sticky md:top-0 md:h-screen md:w-[45%] md:border-l md:border-t-0">
        <DecisionAI court={court} id={id} />
      </aside>
    </div>
  );
}
