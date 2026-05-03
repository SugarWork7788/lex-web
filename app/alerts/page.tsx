import Link from "next/link";

export const revalidate = 3600;

export const metadata = {
  title: "Известия при промени • lex.bg",
  description:
    "Получавайте имейл при промени в избрания български закон. Безплатно, без регистрация.",
};

export default function AlertsPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-10">
      <header className="border-b border-black/[0.08] dark:border-white/[0.08] pb-6">
        <p className="text-xs uppercase tracking-wider text-indigo-700 dark:text-indigo-400 font-medium">
          Известия
        </p>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-semibold tracking-tight">
          🔔 Известия при промяна на закон
        </h1>
        <p className="mt-3 text-sm text-black/65 dark:text-white/65">
          Абонирайте се за безплатни известия, когато бъдат внесени значими
          изменения в избран от вас закон. Без регистрация — само имейл.
        </p>
      </header>

      <section className="mt-8 space-y-6">
        <div>
          <h2 className="font-serif text-xl font-semibold">Как работи</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-black/80 dark:text-white/80">
            <li>
              Отворете който и да е закон от{" "}
              <Link
                href="/laws"
                className="text-indigo-700 hover:underline dark:text-indigo-400"
              >
                каталога
              </Link>
              .
            </li>
            <li>
              Намерете секцията <strong>"🔔 Известия при промяна"</strong> в
              долната част на страницата.
            </li>
            <li>Въведете имейл адрес и натиснете "Абонирай се".</li>
            <li>
              Ще получите имейл за потвърждение. Кликнете върху линка, за да
              активирате абонамента.
            </li>
            <li>
              Когато законът бъде променен, ще получите имейл с обобщение на
              разликите.
            </li>
          </ol>
        </div>

        <div>
          <h2 className="font-serif text-xl font-semibold">Поверителност</h2>
          <p className="mt-2 text-sm text-black/80 dark:text-white/80">
            Имейл адресите се пазят само за изпращане на известия и могат да
            бъдат изтрити по всяко време чрез линка за отписване във всеки имейл.
            Не споделяме данни с трети страни.
          </p>
        </div>

        <div className="rounded-lg border border-amber-300 bg-amber-50/60 px-4 py-3 text-sm dark:border-amber-700/60 dark:bg-amber-950/30">
          <p className="text-amber-900 dark:text-amber-200">
            <strong>Бележка:</strong> Седмичните проверки за промени и
            изпращането на известия в момента са в подготовка. Абонаментната
            инфраструктура е активна и записва вашата заявка.
          </p>
        </div>

        <div className="pt-2">
          <Link
            href="/laws"
            className="inline-flex items-center gap-2 rounded-md bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-800 dark:bg-indigo-600 dark:hover:bg-indigo-500"
          >
            Изберете закон за абонамент →
          </Link>
        </div>
      </section>
    </article>
  );
}
