/**
 * Per-act-type pill colors for the Държавен вестник browser.
 *
 * Mirrors the Phase 2 source-pill triplet pattern (Phase 2 isn't merged to
 * this branch yet — palette reproduced from 08-UI-SPEC.md §Color).
 *
 * Each entry: bg-{HUE}-950/40 text-{HUE}-300 ring-1 ring-{HUE}-800/40
 * Geometry  : px-1.5 py-0.5 text-xs uppercase tracking-wider rounded-[2px]
 *
 * All combinations WCAG-AA verified for Bulgarian Cyrillic body weight at
 * 12-14px (UI-SPEC §Color & Contrast).
 *
 * Decision (UI-SPEC Q1): five cool tones + stone fallback. Red is reserved
 * for "Закон" (the weightiest gazette item) so it piggy-backs the existing
 * brand accent without expanding the 10% accent token.
 */
export const DV_ACT_PILL: Record<
  string,
  { className: string; label: string }
> = {
  Закон: {
    className:
      "bg-red-950/40 text-red-300 ring-1 ring-red-800/40 px-1.5 py-0.5 text-xs uppercase tracking-wider rounded-[2px]",
    label: "Закон",
  },
  Указ: {
    className:
      "bg-amber-950/40 text-amber-300 ring-1 ring-amber-800/40 px-1.5 py-0.5 text-xs uppercase tracking-wider rounded-[2px]",
    label: "Указ",
  },
  Постановление: {
    className:
      "bg-sky-950/40 text-sky-300 ring-1 ring-sky-800/40 px-1.5 py-0.5 text-xs uppercase tracking-wider rounded-[2px]",
    label: "Постановление",
  },
  Наредба: {
    className:
      "bg-indigo-950/40 text-indigo-300 ring-1 ring-indigo-800/40 px-1.5 py-0.5 text-xs uppercase tracking-wider rounded-[2px]",
    label: "Наредба",
  },
  Решение: {
    className:
      "bg-teal-950/40 text-teal-300 ring-1 ring-teal-800/40 px-1.5 py-0.5 text-xs uppercase tracking-wider rounded-[2px]",
    label: "Решение",
  },
  Обявление: {
    className:
      "bg-stone-800/60 text-stone-300 ring-1 ring-stone-700/40 px-1.5 py-0.5 text-xs uppercase tracking-wider rounded-[2px]",
    label: "Обявление",
  },
};

/** Fallback pill for unknown / null act_type (e.g. scraper "Other" bucket). */
export const DV_ACT_PILL_FALLBACK = {
  className:
    "bg-stone-800/60 text-stone-300 ring-1 ring-stone-700/40 px-1.5 py-0.5 text-xs uppercase tracking-wider rounded-[2px]",
  label: "Друг",
};

/** Get the pill for a given act_type, with fallback for unknown / null. */
export function getActPill(
  act_type: string | null,
): { className: string; label: string } {
  if (!act_type) return DV_ACT_PILL_FALLBACK;
  return DV_ACT_PILL[act_type] ?? DV_ACT_PILL_FALLBACK;
}

/**
 * Section render order for /dv/[slug] grouped layout (CONTEXT D-09).
 * "Other" is the documented bucket for unmapped act_types (e.g. Определение,
 * Споразумение per Wave 1 SUMMARY).
 */
export const DV_ACT_TYPE_ORDER: readonly string[] = [
  "Закон",
  "Наредба",
  "Постановление",
  "Указ",
  "Решение",
  "Обявление",
  "Other",
];
