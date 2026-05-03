import Link from "next/link";
import { LegalMap } from "./legal-map";

const MAP_DESC =
  "Интерактивна карта на българската правна система — Конституция, четирите основни области на правото, върховните съдилища и приложимото ЕС право. Кликнете върху възел, за да го отворите.";

export const metadata = {
  title: "Правна карта",
  description: MAP_DESC,
  openGraph: {
    title: "Правна карта • lex.bg",
    description: MAP_DESC,
  },
};

export default function MapPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400 font-medium">
          Визуализация
        </p>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-semibold tracking-tight">
          Правна карта на България
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-black/65 dark:text-white/65">
          От Конституцията надолу — четирите основни области на правото, ключовите
          закони и кодекси, върховните съдилища, и наслоеното отгоре европейско
          право. Кликнете върху възел, за да го отворите. На мобилен — влачете
          с пръст и щипка за zoom.
        </p>
      </header>

      <LegalMap />

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <Tip
          title="Кликнете на закон"
          body="Отваря пълния текст с AI чат за този закон."
        />
        <Tip
          title="Кликнете на съд"
          body="Преглед на решенията на този съд с AI резюме."
        />
        <Tip
          title="Кликнете на „Конституция"
          body="Чете се като всеки друг закон, с пълен AI чат."
        />
        <Tip
          title="ЕС право"
          body="Регламенти и директиви — пряко приложими в България."
        />
      </section>

      <p className="mt-8 text-xs text-black/55 dark:text-white/55">
        Картата е опростено представяне. Реалните връзки между нормативните
        актове са много по-плътни — за конкретен закон вижте{" "}
        <Link href="/laws" className="hover:underline">каталога</Link> или{" "}
        <Link href="/issues" className="hover:underline">страницата с открити проблеми</Link>.
      </p>
    </div>
  );
}

function Tip({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-black/[0.08] bg-white px-4 py-3 dark:border-white/[0.1] dark:bg-white/[0.03]">
      <div className="font-serif text-[0.95rem] font-semibold">{title}</div>
      <p className="mt-1 text-xs text-black/65 dark:text-white/65 leading-relaxed">
        {body}
      </p>
    </div>
  );
}
