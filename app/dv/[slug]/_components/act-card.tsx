import { type ReactNode } from "react";
import { type DvActRow } from "@/lib/queries";
import { getActPill } from "../../_lib/act-pill";

/**
 * Detail-page act card for /dv/[slug] — server-rendered shell that delegates
 * the AI-summary expansion to a client `summary` slot supplied by the parent
 * page-client component.
 *
 * Card primitive verbatim Phase 2 (UI-SPEC line 211–218): hover ring +
 * focus-within ring + transition-colors. Source link uses
 * rel="noopener noreferrer" per UI-SPEC §"`↗ Оригинал` link" with the
 * arrow glyph AFTER the text, matching `/intel/articles` convention.
 */
export function ActCard({
  act,
  summary,
}: {
  act: DvActRow;
  summary?: ReactNode;
}) {
  const pill = getActPill(act.act_type);
  return (
    <article
      id={`act-${act.id}`}
      className="rounded-lg border border-stone-800 bg-stone-900/40 p-5
                 hover:border-red-500/50 hover:bg-stone-900/60
                 focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500/30
                 transition-colors"
      data-act-id={act.id}
      data-act-type={act.act_type ?? "Other"}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={pill.className}>{pill.label}</span>
        {act.source_url && (
          <a
            href={act.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-stone-400 hover:text-red-400 hover:underline print:hidden"
            aria-label={`Виж оригинала на ${act.title} в dv.parliament.bg`}
          >
            ↗ Оригинал
          </a>
        )}
      </div>
      <h3 className="mt-3 font-serif text-base font-semibold leading-snug text-stone-100">
        {act.title}
      </h3>
      {summary}
    </article>
  );
}
