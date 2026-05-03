import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const serif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "lex.bg • Българско законодателство",
  description:
    "Търсене и преглед на българското законодателство — конституция, кодекси, закони, наредби и правилници.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="bg"
      className={`${inter.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-black/[0.08] dark:border-white/[0.08]">
          <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
            <Link
              href="/"
              className="font-serif text-xl font-semibold tracking-tight"
            >
              lex<span className="text-amber-700 dark:text-amber-400">·</span>
              <span className="font-normal">brain</span>
            </Link>
            <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <Link href="/laws" className="hover:underline underline-offset-4">
                Закони
              </Link>
              <Link
                href="/laws"
                className="hover:underline underline-offset-4"
                title="Изберете закон, за да стартирате AI анализ"
              >
                Правен анализ
              </Link>
              <Link href="/issues" className="hover:underline underline-offset-4">
                Проблеми
              </Link>
              <Link href="/compare" className="hover:underline underline-offset-4">
                Сравни
              </Link>
              <Link href="/alerts" className="hover:underline underline-offset-4">
                Известия
              </Link>
              <Link href="/search" className="hover:underline underline-offset-4">
                Търсене
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-black/[0.08] dark:border-white/[0.08] mt-16">
          <div className="mx-auto max-w-5xl px-6 py-6 text-xs text-black/60 dark:text-white/60">
            Източник на данните: lex.bg. Този сайт е независим и не е свързан с
            официалните публикатори.
          </div>
        </footer>
      </body>
    </html>
  );
}
