import type { IntelSource, RankedRow } from "@/lib/intel-search";
import { BestMatchQuote } from "./best-match-quote";

/**
 * <BestMatchCard> — Phase 02 INT-02 — variant-driven card for a single ranked
 * row. The card itself stays neutral; the source pill at the top carries the
 * tint (UI-SPEC §"Source-type tint per best-match card").
 *
 * D-03 split:
 *   - source === "articles" → mount <BestMatchQuote> (Haiku 4.5 streaming)
 *   - any other source       → render row.summary verbatim at first paint
 *                              (no AI call; "Източник: запис" eyebrow)
 *
 * Accent budget: only the "✦ AI цитат" eyebrow uses red-400. The record-type
 * eyebrow uses stone-400 (UI-SPEC line 130 — accent reserved for AI surfaces).
 *
 * Card primitive class is the same `rounded-lg border border-stone-800
 * bg-stone-900/40 p-5` as the audit page FindingCard so visual rhythm is
 * consistent between the two surfaces.
 */

const SOURCE_PILL: Record<IntelSource, { className: string; label: string }> = {
  sanctioned: {
    className: "bg-red-950/40 text-red-300 ring-1 ring-red-800/40",
    label: "Санкции",
  },
  offshore: {
    className: "bg-amber-950/40 text-amber-300 ring-1 ring-amber-800/40",
    label: "Офшор",
  },
  olaf: {
    className: "bg-blue-950/40 text-blue-300 ring-1 ring-blue-800/40",
    label: "OLAF",
  },
  articles: {
    className: "bg-stone-800 text-stone-300 ring-1 ring-stone-700",
    label: "Журналистика",
  },
  prosecution: {
    className: "bg-purple-950/40 text-purple-300 ring-1 ring-purple-800/40",
    label: "Прокуратура",
  },
  nap: {
    className: "bg-emerald-950/40 text-emerald-300 ring-1 ring-emerald-800/40",
    label: "НАП",
  },
};

const HREF_BY_SOURCE: Record<IntelSource, string> = {
  sanctioned: "/intel/sanctions",
  offshore: "/intel/offshore",
  olaf: "/intel/olaf",
  articles: "/intel/articles",
  prosecution: "/intel/prosecution",
  // existing /intel/search/page.tsx routes "nap" to /issues; preserve.
  nap: "/issues",
};

export function BestMatchCard({
  row,
  query,
}: {
  row: RankedRow;
  query: string;
}) {
  const pill = SOURCE_PILL[row.source];
  const href = HREF_BY_SOURCE[row.source];
  const isArticle = row.source === "articles";

  return (
    <article
      className="rounded-lg border border-stone-800 bg-stone-900/40 p-5
                 hover:border-red-500/50 hover:bg-stone-900/60
                 focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500/30
                 transition-colors"
    >
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`rounded-full px-2.5 py-0.5 font-medium ${pill.className}`}
        >
          {pill.label}
        </span>
      </div>
      <h3 className="mt-2 font-serif text-base font-semibold leading-snug">
        {row.title || "—"}
      </h3>
      {isArticle ? (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-wider text-red-400 font-medium mb-1">
            ✦ AI цитат
          </p>
          <BestMatchQuote query={query} summary={row.summary || ""} />
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-wider text-stone-400 font-medium mb-1">
            Източник: запис
          </p>
          <p className="text-sm leading-relaxed text-stone-200">
            {row.summary || "—"}
          </p>
        </div>
      )}
      <div className="mt-3 text-xs">
        <a href={href} className="text-red-400 hover:underline">
          Виж в раздела →
        </a>
      </div>
    </article>
  );
}
