import Link from "next/link";
import { notFound } from "next/navigation";
import { getEuRegulation } from "@/lib/queries";
import { EuBanner } from "@/app/components/section-banner";

export const revalidate = 86400;

type Props = { params: Promise<{ celex: string }> };

export default async function EuRegulationPage({ params }: Props) {
  const { celex } = await params;
  const reg = await getEuRegulation(decodeURIComponent(celex));
  if (!reg) notFound();

  const eurLexUrl = `https://eur-lex.europa.eu/legal-content/BG/TXT/?uri=CELEX:${reg.celex}`;

  return (
    <div>
      <EuBanner />

      <article className="mx-auto max-w-3xl px-6 py-10">
        <nav className="text-sm mb-6">
          <Link
            href="/eu"
            className="text-black/60 dark:text-white/60 hover:underline"
          >
            ← Обратно към ЕС право
          </Link>
        </nav>

        <header className="border-b border-black/[0.08] dark:border-white/[0.08] pb-6">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="font-mono text-sm font-semibold text-yellow-800 dark:text-yellow-300">
              {reg.celex}
            </span>
            {reg.in_force && (
              <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 px-2.5 py-0.5 text-xs font-semibold">
                В сила
              </span>
            )}
          </div>

          <h1 className="font-serif text-3xl font-semibold tracking-tight leading-tight">
            {reg.title_bg || reg.title_en || reg.celex}
          </h1>
          {reg.title_bg && reg.title_en && reg.title_bg !== reg.title_en && (
            <p className="mt-2 text-sm text-black/55 dark:text-white/55 italic">
              {reg.title_en}
            </p>
          )}

          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {reg.date_document && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-black/40 dark:text-white/40">
                  Дата
                </dt>
                <dd className="font-medium">{reg.date_document.slice(0, 10)}</dd>
              </div>
            )}
            {reg.doc_type && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-black/40 dark:text-white/40">
                  Вид
                </dt>
                <dd className="font-medium capitalize">{reg.doc_type}</dd>
              </div>
            )}
            {reg.year && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-black/40 dark:text-white/40">
                  Година
                </dt>
                <dd className="font-medium">{reg.year}</dd>
              </div>
            )}
          </dl>

          <div className="mt-4">
            <a
              href={eurLexUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-1.5 text-xs font-medium text-yellow-900 hover:bg-yellow-100 dark:border-yellow-700/60 dark:bg-yellow-950/30 dark:text-yellow-200"
            >
              Пълен текст на EUR-Lex ↗
            </a>
          </div>
        </header>

        <div className="mt-8 font-serif text-[1.0625rem] leading-relaxed whitespace-pre-line text-black/85 dark:text-white/85">
          {reg.full_text_bg || reg.full_text_en || (
            <p className="text-black/50 dark:text-white/50 italic">
              Пълният текст не е наличен локално.{" "}
              <a
                href={eurLexUrl}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Виж на EUR-Lex ↗
              </a>
            </p>
          )}
        </div>
      </article>
    </div>
  );
}
