import Link from "next/link";
import { notFound } from "next/navigation";
import { getLawBySlug, getLawArticles, getCrossReferencesFrom } from "@/lib/queries";
import { LawChat } from "./chat";
import { AlertForm } from "./alert-form";

export const revalidate = 3600;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const law = await getLawBySlug(slug);
  if (!law) return { title: "Не е намерен закон" };
  return {
    title: `${law.name_bg} • lex.bg`,
    description: `Пълен текст на ${law.name_bg} (${law.article_count} члена).`,
  };
}

export default async function LawReaderPage({ params }: Props) {
  const { slug } = await params;
  const [law, articles, xrefs] = await Promise.all([
    getLawBySlug(slug),
    getLawArticles(slug),
    getCrossReferencesFrom(slug),
  ]);

  if (!law) notFound();

  // Group articles by chapter → section, preserving ordinal order.
  type Group = {
    chapter: string | null;
    sections: { section: string | null; articles: typeof articles }[];
  };
  const groups: Group[] = [];
  let curChapter: Group | null = null;
  let curSection: Group["sections"][number] | null = null;
  for (const a of articles) {
    if (!curChapter || curChapter.chapter !== a.chapter_title) {
      curChapter = { chapter: a.chapter_title, sections: [] };
      curSection = null;
      groups.push(curChapter);
    }
    if (!curSection || curSection.section !== a.section_title) {
      curSection = { section: a.section_title, articles: [] };
      curChapter.sections.push(curSection);
    }
    curSection.articles.push(a);
  }

  return (
    <article className="mx-auto max-w-3xl px-6 py-10 law-prose">
      <nav className="text-sm">
        <Link
          href={`/laws?category=${law.category}`}
          className="text-black/60 dark:text-white/60 hover:underline"
        >
          ← {law.level_name ?? "Закон"}
        </Link>
      </nav>

      <header className="mt-4 border-b border-black/[0.08] dark:border-white/[0.08] pb-6">
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
          {law.name_bg}
        </h1>
        <p className="mt-3 text-sm text-black/60 dark:text-white/60">
          {law.article_count.toLocaleString("bg-BG")} члена •{" "}
          <a
            href={law.url}
            className="hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            източник на lex.bg ↗
          </a>
        </p>
        {articles.length > 0 && (
          <div className="mt-5">
            <Link
              href={`/analyze/${slug}`}
              className="inline-flex items-center gap-2 rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
            >
              <span aria-hidden>✦</span> Анализирай с AI — проверка за правни
              конфликти
            </Link>
            <p className="mt-2 text-xs text-black/55 dark:text-white/55">
              Многостъпков анализ срещу Конституцията и цялата база от 1240
              български закона
            </p>
          </div>
        )}
      </header>

      {articles.length === 0 ? (
        <p className="mt-12 text-black/60 dark:text-white/60">
          За този акт все още няма заредено съдържание.
        </p>
      ) : (
        <div className="mt-10 space-y-12">
          {groups.map((g, gi) => (
            <section key={gi}>
              {g.chapter && (
                <h2 className="font-serif text-2xl font-semibold tracking-tight">
                  {g.chapter}
                </h2>
              )}
              <div className={g.chapter ? "mt-6 space-y-8" : "space-y-8"}>
                {g.sections.map((s, si) => (
                  <div key={si}>
                    {s.section && (
                      <h3 className="font-serif text-lg font-semibold text-black/80 dark:text-white/80">
                        {s.section}
                      </h3>
                    )}
                    <div className={s.section ? "mt-4 space-y-6" : "space-y-6"}>
                      {s.articles.map((a) => (
                        <div
                          key={a.ordinal}
                          id={`art-${a.article_number}`}
                          className="scroll-mt-16"
                        >
                          <div className="font-serif font-semibold mb-1">
                            Чл. {a.article_number}
                          </div>
                          <div className="font-serif leading-relaxed whitespace-pre-line text-[1.0625rem]">
                            {a.text_content}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {articles.length > 0 && <LawChat slug={slug} />}

      {articles.length > 0 && <AlertForm slug={slug} nameBg={law.name_bg} />}

      {xrefs.length > 0 && (
        <aside className="mt-16 border-t border-black/[0.08] dark:border-white/[0.08] pt-6">
          <h2 className="font-serif text-xl font-semibold mb-4">
            Препратки към други актове
          </h2>
          <ul className="text-sm space-y-1">
            {xrefs.slice(0, 50).map((x, i) => (
              <li key={i} className="text-black/75 dark:text-white/75">
                {x.from_article && (
                  <span className="text-black/55 dark:text-white/55">
                    Чл. {x.from_article} →{" "}
                  </span>
                )}
                {x.to_slug ? (
                  <Link
                    href={`/laws/${x.to_slug}`}
                    className="hover:underline"
                  >
                    {x.raw_text}
                  </Link>
                ) : (
                  <span>{x.raw_text}</span>
                )}
              </li>
            ))}
          </ul>
          {xrefs.length > 50 && (
            <p className="mt-2 text-xs text-black/55 dark:text-white/55">
              … и още {xrefs.length - 50}.
            </p>
          )}
        </aside>
      )}
    </article>
  );
}
