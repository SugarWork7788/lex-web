import Link from "next/link";
import { type DvIssueRow } from "@/lib/queries";
import { getActPill } from "../_lib/act-pill";

/**
 * Bulgarian noun pluralization for "акт" (UI-SPEC §Voice — Intl.PluralRules).
 * BG has `one` and `other` categories: 1 акт / 2 акта / 5 акта / 21 акт.
 * Cached per import (`Intl.PluralRules` instances are heavy to construct).
 */
const BG_PLURALS = new Intl.PluralRules("bg-BG");
function pluralizeAkt(n: number): string {
  return BG_PLURALS.select(n) === "one" ? "акт" : "акта";
}

// timeZone pinned to Europe/Sofia so dates render the same in CI and on Vercel
// regardless of the host's local TZ. The publication is a Bulgarian gazette;
// dates are authoritative in BG local time.
const BG_DATE = new Intl.DateTimeFormat("bg-BG", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Sofia",
});

/**
 * Listing-page card for one Държавен вестник issue.
 *
 * Verbatim Phase 2 card primitive (UI-SPEC line 211–218): hover ring +
 * focus-within ring + transition-colors. Contents per UI-SPEC §"Issue card
 * content + ordering": display number (text-2xl serif) + date (xs) +
 * act-count (sm) + top-3 pills + "+N още" overflow.
 */
export function IssueCard({ issue }: { issue: DvIssueRow }) {
  const slug = `${issue.year}-${issue.issue_number}`;
  const dateLabel = issue.date ? BG_DATE.format(new Date(issue.date)) : "—";
  const top3 = issue.top_act_types.slice(0, 3);
  const extra = issue.top_act_types.length - top3.length;

  return (
    <Link
      href={`/dv/${slug}`}
      className="block rounded-lg border border-stone-800 bg-stone-900/40 p-5
                 hover:border-red-500/50 hover:bg-stone-900/60
                 focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500/30
                 transition-colors"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-serif text-2xl font-semibold tabular-nums">
          Бр. {issue.issue_number}
        </span>
        <span className="text-xs text-stone-500 tabular-nums">{dateLabel}</span>
      </div>
      <div className="mt-3 text-sm text-stone-400">
        {issue.act_count.toLocaleString("bg-BG")} {pluralizeAkt(issue.act_count)}
      </div>
      {top3.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {top3.map((t) => {
            const pill = getActPill(t);
            return (
              <span key={t} className={pill.className}>
                {pill.label}
              </span>
            );
          })}
          {extra > 0 && (
            <span className="text-xs text-stone-500">+ {extra} още</span>
          )}
        </div>
      )}
    </Link>
  );
}
