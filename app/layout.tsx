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

const SITE_URL = "https://lex-web-eta.vercel.app";
const SITE_NAME = "lex.bg";
const SITE_DESC =
  "Българско законодателство, съдебна практика на ВКС/ВАС/КС и приложимото европейско право — на едно място, с AI анализ.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} • Българско законодателство`,
    template: `%s • ${SITE_NAME}`,
  },
  description: SITE_DESC,
  openGraph: {
    type: "website",
    locale: "bg_BG",
    siteName: SITE_NAME,
    title: `${SITE_NAME} • Българско законодателство`,
    description: SITE_DESC,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} • Българско законодателство`,
    description: SITE_DESC,
  },
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
          <div className="mx-auto max-w-5xl px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-4">
            <Link
              href="/"
              className="font-serif text-xl font-semibold tracking-tight"
            >
              lex<span className="text-amber-700 dark:text-amber-400">·</span>
              <span className="font-normal">brain</span>
            </Link>
            <nav className="-mx-1 flex gap-x-4 gap-y-2 overflow-x-auto whitespace-nowrap px-1 text-sm sm:flex-wrap sm:overflow-visible sm:whitespace-normal sm:gap-x-5">
              <Link href="/laws" className="hover:underline underline-offset-4">
                Закони
              </Link>
              <Link href="/courts" className="hover:underline underline-offset-4">
                Съдебна практика
              </Link>
              <Link href="/eu" className="hover:underline underline-offset-4">
                ЕС право
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
              <Link href="/map" className="hover:underline underline-offset-4">
                Правна карта
              </Link>
              <Link href="/intel" className="hover:underline underline-offset-4 text-red-700 dark:text-red-400">
                Разузнавателен център
              </Link>
              <Link href="/audit" className="hover:underline underline-offset-4 text-red-700 dark:text-red-400 font-semibold">
                Правен одит
              </Link>
              <Link href="/alerts" className="hover:underline underline-offset-4">
                Известия
              </Link>
              <Link href="/search" className="hover:underline underline-offset-4">
                Търсене
              </Link>
              <Link href="/about" className="hover:underline underline-offset-4 text-black/65 dark:text-white/65">
                За платформата
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-black/[0.08] dark:border-white/[0.08] mt-16">
          <div className="mx-auto max-w-5xl px-6 py-6 text-xs text-black/60 dark:text-white/60">
            <p>
              Източник на данните: lex.bg, Конституционен съд, ВКС, ВАС,
              EUR-Lex. Този сайт е независим и не е свързан с официалните
              публикатори.
            </p>
            <p className="mt-2">
              <Link href="/about" className="hover:underline">
                За платформата
              </Link>
              {" · "}
              Резултатите са информативни и не заместват професионален
              правен съвет.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
