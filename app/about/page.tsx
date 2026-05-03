import Link from "next/link";
import {
  getCategoryCounts,
  getCourtCounts,
  getEuCounts,
} from "@/lib/queries";

export const revalidate = 3600;

export const metadata = {
  title: "За платформата • lex.bg",
  description:
    "Какво представлява lex.bg, откъде идват данните и какви са ограниченията.",
};

export default async function AboutPage() {
  const [lawCounts, courtCounts, euCounts] = await Promise.all([
    getCategoryCounts(),
    getCourtCounts(),
    getEuCounts(),
  ]);
  const totalLaws = Object.values(lawCounts).reduce((a, b) => a + b, 0);
  const totalDecisions = Object.values(courtCounts).reduce((a, b) => a + b, 0);
  const totalEu = Object.values(euCounts).reduce((a, b) => a + b, 0);

  return (
    <article className="mx-auto max-w-3xl px-6 py-10">
      <nav className="text-sm">
        <Link
          href="/"
          className="text-black/60 dark:text-white/60 hover:underline"
        >
          ← Начало
        </Link>
      </nav>

      <header className="mt-4 border-b border-black/[0.08] dark:border-white/[0.08] pb-6">
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight">
          За платформата
        </h1>
        <p className="mt-3 text-base text-black/70 dark:text-white/70">
          lex.bg обединява българското законодателство, съдебната практика на
          върховните съдилища и приложимото европейско право в едно търсимо,
          AI-обогатено пространство.
        </p>
      </header>

      <section className="mt-10">
        <h2 className="font-serif text-2xl font-semibold">Какво прави</h2>
        <ul className="mt-4 space-y-3 text-[0.975rem] leading-relaxed text-black/85 dark:text-white/85">
          <li className="flex gap-3">
            <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600 dark:bg-amber-400" />
            <span>
              <strong className="font-semibold">Чете и обобщава.</strong>{" "}
              Всеки закон, съдебно решение или ЕС акт може да получи AI
              резюме и Q&A чат, обоснован върху собствения му текст.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600 dark:bg-amber-400" />
            <span>
              <strong className="font-semibold">Анализира за конфликти.</strong>{" "}
              Многостъпков AI анализ на всеки закон срещу Конституцията и
              целия корпус — открива противоречия, дублирания, надхвърляне на
              правомощия и празнини.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600 dark:bg-amber-400" />
            <span>
              <strong className="font-semibold">Свързва източниците.</strong>{" "}
              Всяко съдебно решение посочва кои закони цитира; всеки закон
              показва свързаната съдебна практика; кръстосаните препратки между
              законите са обходими с един клик.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600 dark:bg-amber-400" />
            <span>
              <strong className="font-semibold">Сравнява и търси.</strong>{" "}
              Сравнение на два закона един до друг с AI коментар; пълнотекстово
              търсене в закони, решения и ЕС актове.
            </span>
          </li>
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-2xl font-semibold">Източници на данни</h2>
        <ul className="mt-4 space-y-4">
          <SourceCard
            name="lex.bg"
            url="https://www.lex.bg"
            description="Пълен текст на 1240 нормативни акта — конституция, кодекси, закони, наредби и правилници. Структурирани като глава → раздел → член → алинея → точка."
            count={`${totalLaws.toLocaleString("bg-BG")} закона`}
          />
          <SourceCard
            name="Конституционен съд (КС)"
            url="https://constcourt.bg"
            description="Решения и определения на Конституционния съд на Република България — пълен исторически архив."
            count={`${(courtCounts.CC ?? 0).toLocaleString("bg-BG")} акта`}
          />
          <SourceCard
            name="Върховен касационен съд (ВКС)"
            url="https://www.vks.bg"
            description="Тълкувателни решения на ОСНК, ОСГК, ОСГТК и ОСНГТК — задължителната практика на ВКС."
            count={`${(courtCounts.SC ?? 0).toLocaleString("bg-BG")} акта`}
          />
          <SourceCard
            name="Върховен административен съд (ВАС)"
            url="https://sac.justice.bg"
            description="Решения и определения, публикувани в ЕДИС портала на административните съдилища."
            count={`${(courtCounts.SA ?? 0).toLocaleString("bg-BG")} акта`}
          />
          <SourceCard
            name="EUR-Lex"
            url="https://eur-lex.europa.eu"
            description="Регламенти и директиви на Европейския съюз, приложими в България — пълен текст на български."
            count={`${totalEu.toLocaleString("bg-BG")} акта`}
          />
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-2xl font-semibold">Технологии</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          <TechCard
            name="Next.js 16"
            url="https://nextjs.org"
            description="Сървърни компоненти, App Router, стрийминг отговори от AI крайни точки."
          />
          <TechCard
            name="Supabase (Postgres)"
            url="https://supabase.com"
            description="Хранилище за закони, съдебни решения и ЕС актове, с пълнотекстово търсене (tsvector)."
          />
          <TechCard
            name="Claude AI"
            url="https://www.anthropic.com"
            description="Резюмета, чат и многостъпков правен анализ — задвижвани от Claude Sonnet 4.6 на Anthropic."
          />
          <TechCard
            name="Vercel"
            url="https://vercel.com"
            description="Хостинг и доставка на края на мрежата, с автоматично обновяване при всеки git push."
          />
        </ul>
      </section>

      <section className="mt-12 rounded-lg border border-amber-300 bg-amber-50 p-5 dark:border-amber-800/60 dark:bg-amber-950/30">
        <h2 className="font-serif text-xl font-semibold text-amber-900 dark:text-amber-200">
          Важно — отказ от отговорност
        </h2>
        <div className="mt-3 space-y-2 text-sm text-amber-900/90 dark:text-amber-100/90">
          <p>
            Резултатите тук са{" "}
            <strong className="font-semibold">информативни</strong> и не
            представляват правен съвет. AI резюметата и анализите могат да
            бъдат непълни или неточни — задължително проверявайте срещу
            официалните публикатори преди да действате.
          </p>
          <p>
            Този сайт е независим и не е свързан с „Сиела Норма&rdquo;,
            Конституционния съд, ВКС, ВАС или Европейския съюз. Данните се
            обновяват периодично; за актуални редакции на нормативните актове
            винаги използвайте оригиналния източник.
          </p>
          <p>
            За правни въпроси по конкретен случай се консултирайте с
            адвокат.
          </p>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-2xl font-semibold">
          Обратна връзка
        </h2>
        <p className="mt-3 text-[0.975rem] leading-relaxed text-black/85 dark:text-white/85">
          Намерили сте грешка, искате нов източник или функционалност, или
          имате идея за подобрение? Кодът е отворен — отворете issue или PR в{" "}
          <a
            href="https://github.com/SugarWork7788/lex-web"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-amber-700 hover:underline dark:text-amber-400"
          >
            GitHub репото
          </a>
          .
        </p>
        <p className="mt-3 text-[0.975rem] leading-relaxed text-black/85 dark:text-white/85">
          За да получавате известия при промени в конкретен закон —{" "}
          <Link
            href="/alerts"
            className="font-medium text-amber-700 hover:underline dark:text-amber-400"
          >
            настройте email известия
          </Link>
          .
        </p>
      </section>

      <footer className="mt-12 border-t border-black/[0.08] pt-6 text-xs text-black/55 dark:border-white/[0.08] dark:text-white/55">
        <p>
          Корпус към момента на изграждането: {totalLaws.toLocaleString("bg-BG")}{" "}
          закона · {totalDecisions.toLocaleString("bg-BG")} съдебни акта ·{" "}
          {totalEu.toLocaleString("bg-BG")} ЕС акта.
        </p>
      </footer>
    </article>
  );
}

function SourceCard({
  name,
  url,
  description,
  count,
}: {
  name: string;
  url: string;
  description: string;
  count: string;
}) {
  return (
    <li className="rounded-lg border border-black/[0.08] bg-white p-4 dark:border-white/[0.1] dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="font-serif text-lg font-semibold hover:underline"
        >
          {name} ↗
        </a>
        <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-medium tabular-nums text-black/70 dark:bg-white/[0.08] dark:text-white/75">
          {count}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-black/70 dark:text-white/70">
        {description}
      </p>
    </li>
  );
}

function TechCard({
  name,
  url,
  description,
}: {
  name: string;
  url: string;
  description: string;
}) {
  return (
    <li className="rounded-lg border border-black/[0.08] bg-white p-4 dark:border-white/[0.1] dark:bg-white/[0.03]">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="font-serif text-base font-semibold hover:underline"
      >
        {name} ↗
      </a>
      <p className="mt-1.5 text-sm leading-relaxed text-black/70 dark:text-white/70">
        {description}
      </p>
    </li>
  );
}
