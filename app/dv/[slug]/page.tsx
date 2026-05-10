import Link from "next/link";
import { notFound } from "next/navigation";
import { getDvIssue, listDvActs } from "@/lib/queries";
import { DvIssuePageClient } from "./dv-issue-page-client";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

// timeZone pinned to Europe/Sofia — the gazette is a Bulgarian publication;
// dates are authoritative in BG local time, not in CI/Vercel host TZ.
const BG_DATE = new Intl.DateTimeFormat("bg-BG", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Sofia",
});

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const m = /^(\d{4})-(\d+)$/.exec(slug);
  if (!m) return { title: "Държавен вестник" };
  const [, year, issueNum] = m;
  return {
    title: `Държавен вестник, брой ${issueNum} от ${year} г. — lex.bg`,
  };
}

export default async function DvIssuePage({ params }: Props) {
  const { slug } = await params;
  const m = /^(\d{4})-(\d+)$/.exec(slug);
  if (!m) notFound();
  const year = Number(m[1]);
  const issue_number = Number(m[2]);

  const issue = await getDvIssue(year, issue_number);
  if (!issue) notFound();

  const acts = await listDvActs({ issue_id: issue.id });
  const dateLabel = issue.date ? BG_DATE.format(new Date(issue.date)) : "—";

  return (
    <div className="bg-stone-950 text-stone-100 min-h-screen">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
        <nav className="text-xs text-stone-400 mb-3 print:hidden">
          <Link href="/dv" className="hover:underline">
            ← Държавен вестник
          </Link>
        </nav>
        <header className="border-b border-stone-800 pb-5">
          <p className="text-xs uppercase tracking-[0.18em] text-red-400 font-medium">
            Държавен вестник
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tabular-nums">
            Брой {issue.issue_number} — {dateLabel}
          </h1>
          <p className="mt-3 text-sm text-stone-400">
            {acts.length.toLocaleString("bg-BG")} акта в този брой
            {issue.source_url && (
              <>
                {" · "}
                <a
                  href={issue.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-stone-200 hover:underline"
                >
                  ↗ Виж в dv.parliament.bg
                </a>
              </>
            )}
          </p>
        </header>

        <DvIssuePageClient acts={acts} />

        <div className="mt-12 pt-6 border-t border-stone-800/50 text-xs text-stone-500">
          Източник:{" "}
          <a
            href="https://dv.parliament.bg/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-stone-300 hover:underline"
          >
            dv.parliament.bg ↗
          </a>{" "}
          · Държавен вестник на Народното събрание на Република България
        </div>
      </div>
    </div>
  );
}
