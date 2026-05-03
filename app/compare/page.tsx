import { listLaws } from "@/lib/queries";
import { LawPicker } from "./law-picker";

export const revalidate = 3600;

export const metadata = {
  title: "Сравни закони • lex.bg",
  description:
    "Сравнете два български нормативни акта — застъпвания, противоречия, празнини, йерархични конфликти.",
};

export default async function ComparePage() {
  const laws = await listLaws();
  const pickerLaws = laws.map((l) => ({
    slug: l.slug,
    name_bg: l.name_bg,
    category: l.category,
  }));

  return (
    <article className="mx-auto max-w-4xl px-6 py-10">
      <header className="border-b border-black/[0.08] dark:border-white/[0.08] pb-6">
        <p className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400 font-medium">
          Сравнение
        </p>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-semibold tracking-tight">
          Сравни два закона
        </h1>
        <p className="mt-3 text-sm text-black/60 dark:text-white/60">
          Изберете два нормативни акта. AI ще намери областите на застъпване,
          директни противоречия, правни празнини и йерархични конфликти между
          тях.
        </p>
      </header>

      <section className="mt-8">
        <LawPicker laws={pickerLaws} />
      </section>
    </article>
  );
}
