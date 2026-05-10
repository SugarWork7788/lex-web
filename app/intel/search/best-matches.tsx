import type { RankedRow } from "@/lib/intel-search";
import { BestMatchCard } from "./best-match-card";

/**
 * <BestMatches> — Phase 02 INT-02 (D-01) — top-5 cross-source ranked card list.
 *
 * Hides entirely when items.length === 0 (CONTEXT.md D-01 / UI-SPEC §"Empty
 * / Edge States" — silent hide, no empty-state copy). When ≥1 item is present
 * the section renders an eyebrow ("✦ AI класиране"), a serif heading
 * ("Най-добри съвпадения"), a sub-label, and a vertical card stack.
 *
 * Pure server component — no streaming happens here; per-card AI streaming is
 * scoped to <BestMatchQuote> which is mounted only for the article variant.
 */
export function BestMatches({
  items,
  query,
}: {
  items: RankedRow[];
  query: string;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="best-matches-heading">
      <p className="text-xs uppercase tracking-wider text-red-400 font-medium mb-1">
        ✦ AI класиране
      </p>
      <h2
        id="best-matches-heading"
        className="font-serif text-lg font-semibold"
      >
        Най-добри съвпадения
      </h2>
      <p className="text-xs text-stone-500 mt-1">
        Подредени по релевантност и актуалност · max 5
      </p>
      <ul className="mt-3 space-y-3">
        {items.map((row) => (
          <li key={`${row.source}-${row.id}`}>
            <BestMatchCard row={row} query={query} />
          </li>
        ))}
      </ul>
    </section>
  );
}
