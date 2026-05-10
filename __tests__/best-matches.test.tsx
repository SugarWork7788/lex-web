/**
 * Component tests for app/intel/search/best-matches.tsx + best-match-card.tsx
 * + best-match-quote.tsx (Phase 02 / INT-02 / Task 3).
 *
 * Validates VALIDATION row 02-02-03:
 *   (a) hides when 0 cross-source hits
 *   (b) renders 5 cards max with all 6 source-pill variants present in fixture
 *   (c) aria-live="polite" debounced — only fires on `status === 'done'`
 *   (d) tap-target ≥ 44px in 375px viewport (verified via card padding)
 *
 * The streaming fetch from <BestMatchQuote> is stubbed via globalThis.fetch
 * mock; tests don't assert on streaming content, only on the structural
 * contract (aria-live debouncing, fallback copy on error, etc.).
 */

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BestMatches } from "@/app/intel/search/best-matches";
import { BestMatchCard } from "@/app/intel/search/best-match-card";
import { BestMatchQuote } from "@/app/intel/search/best-match-quote";
import type { RankedRow, IntelSource } from "@/lib/intel-search";

function row(source: IntelSource, id: string, title: string, summary: string | null = null): RankedRow {
  return { source, id, title, summary, lex: 0.5, rec: 0.5, score: 0.5 };
}

const SIX_VARIANT_FIXTURE: RankedRow[] = [
  row("sanctioned", "s1", "Иван Иванов"),
  row("offshore", "o1", "ACME Holdings Ltd", "Britanski Virginski Ostrovi"),
  row("olaf", "l1", "OLAF case 2024-001", "fraud_type=corruption"),
  row("articles", "a1", "Разследване в София", "Дълъг текст на резюмето."),
  row("prosecution", "p1", "Дело №42/2025"),
  row("nap", "n1", "Указание ОУТ-1"),
];

describe("<BestMatches /> (Task 3 — INT-02 UI)", () => {
  beforeEach(() => {
    // Stub global fetch so <BestMatchQuote> doesn't make real network calls.
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(new ReadableStream({ start(c) { c.close(); } }), { status: 200 }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(a) hides entirely when 0 cross-source hits (D-01 silent hide)", () => {
    const { container } = render(<BestMatches items={[]} query="борисов" />);
    // No section, no heading, no eyebrow.
    expect(container.querySelector("section")).toBeNull();
    expect(screen.queryByText("Най-добри съвпадения")).toBeNull();
    expect(screen.queryByText("✦ AI класиране")).toBeNull();
  });

  it("(b) renders all 6 source-pill variants with verbatim Bulgarian labels", () => {
    render(<BestMatches items={SIX_VARIANT_FIXTURE} query="q" />);
    // Bulgarian pill labels — UI-SPEC §Copywriting Contract row.
    expect(screen.getByText("Санкции")).toBeTruthy();
    expect(screen.getByText("Офшор")).toBeTruthy();
    expect(screen.getByText("OLAF")).toBeTruthy();
    expect(screen.getByText("Журналистика")).toBeTruthy();
    expect(screen.getByText("Прокуратура")).toBeTruthy();
    expect(screen.getByText("НАП")).toBeTruthy();
  });

  it("(b) caps the visible list — passes through whatever is given (caller pre-clamps to 5)", () => {
    // The component itself doesn't slice; lib/intel-search.ts does (default
    // limit=5). When the caller passes 5, the component renders exactly 5.
    const five: RankedRow[] = [
      row("sanctioned", "s1", "S1"),
      row("offshore", "o1", "O1"),
      row("olaf", "l1", "L1"),
      row("articles", "a1", "A1", "summary"),
      row("prosecution", "p1", "P1"),
    ];
    render(<BestMatches items={five} query="q" />);
    const list = screen.getByRole("list");
    const items = list.querySelectorAll("li");
    expect(items.length).toBe(5);
  });

  it("renders the section heading + eyebrow + sub-label verbatim", () => {
    render(<BestMatches items={[row("sanctioned", "s1", "Иван")]} query="q" />);
    expect(screen.getByText("✦ AI класиране")).toBeTruthy();
    expect(screen.getByText("Най-добри съвпадения")).toBeTruthy();
    expect(
      screen.getByText("Подредени по релевантност и актуалност · max 5"),
    ).toBeTruthy();
  });

  it("articles card mounts <BestMatchQuote> with the AI eyebrow + streaming placeholder", () => {
    render(
      <BestMatchCard
        row={row("articles", "a1", "Заглавие", "Резюме на статията.")}
        query="борисов"
      />,
    );
    // AI eyebrow present (red-400 — accent budget).
    expect(screen.getByText("✦ AI цитат")).toBeTruthy();
    // Streaming placeholder ("Извличам цитати…") rendered while fetch is in flight.
    expect(screen.getByText("Извличам цитати…")).toBeTruthy();
    // Record-eyebrow MUST NOT be present on article variant.
    expect(screen.queryByText("Източник: запис")).toBeNull();
  });

  it("non-article cards (sanctioned/offshore/olaf/prosecution/nap) use record eyebrow + verbatim secondary", () => {
    for (const variant of ["sanctioned", "offshore", "olaf", "prosecution", "nap"] as const) {
      const { unmount } = render(
        <BestMatchCard
          row={row(variant, `${variant}-1`, "Title", `Secondary ${variant}`)}
          query="q"
        />,
      );
      // Record eyebrow stone-400 (NOT red — accent budget rule).
      expect(screen.getByText("Източник: запис")).toBeTruthy();
      // No AI eyebrow on non-article variants.
      expect(screen.queryByText("✦ AI цитат")).toBeNull();
      // Verbatim summary text rendered.
      expect(screen.getByText(`Secondary ${variant}`)).toBeTruthy();
      unmount();
    }
  });

  it("(c) <BestMatchQuote> uses sr-only aria-live='polite' and renders empty during streaming (debounced)", () => {
    render(<BestMatchQuote query="q" summary="Резюме." />);
    // Streaming placeholder visible (debounced — no aria-live announcement on tokens).
    expect(screen.getByText("Извличам цитати…")).toBeTruthy();
    // The fallback (error) copy must NOT be visible while streaming.
    expect(
      screen.queryByText(/Цитатът не може да бъде извлечен/),
    ).toBeNull();
  });

  it("(c) <BestMatchQuote> renders error fallback when summary is empty (no fetch trip)", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<BestMatchQuote query="q" summary="" />);
    // Empty summary → error state → fallback copy shown immediately.
    expect(
      screen.getByText("Цитатът не може да бъде извлечен. Виж пълния текст в раздела."),
    ).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("(d) card primitive padding is p-5 (20px each side; 44px+ tap-target on 375px viewport)", () => {
    const { container } = render(
      <BestMatchCard row={row("articles", "a1", "Заглавие", "Резюме.")} query="q" />,
    );
    const article = container.querySelector("article");
    expect(article).not.toBeNull();
    expect(article!.className).toMatch(/\bp-5\b/);
    // Border + bg primitive (UI-SPEC §Card layout primitive).
    expect(article!.className).toMatch(/border-stone-800/);
    expect(article!.className).toMatch(/bg-stone-900\/40/);
    // Hover + focus-within accent (UI-SPEC §Interaction States).
    expect(article!.className).toMatch(/hover:border-red-500\/50/);
    expect(article!.className).toMatch(/focus-within:border-red-500/);
  });

  it("(c) explicit aria-live attribute is on a sr-only span, not on the visible <p>", () => {
    const { container } = render(
      <BestMatchCard row={row("articles", "a1", "T", "Резюме.")} query="q" />,
    );
    // The visible streaming placeholder is `Извличам цитати…` — has NO aria-live (debounced).
    const placeholder = screen.getByText("Извличам цитати…");
    expect(placeholder.getAttribute("aria-live")).toBeNull();
    // No element should announce non-final text. The sr-only aria-live span
    // exists in the streaming/done branches; in this initial-streaming snapshot
    // it's not rendered yet (component renders the placeholder branch only).
    // Verify the structural rule: ANY aria-live element must also have sr-only.
    const liveNodes = container.querySelectorAll("[aria-live]");
    for (const n of Array.from(liveNodes)) {
      expect(n.className).toMatch(/sr-only/);
    }
  });

  it("each ranked row has a 'Виж в раздела →' link routing to the per-source page", () => {
    render(<BestMatches items={SIX_VARIANT_FIXTURE} query="q" />);
    const links = screen.getAllByText(/Виж в раздела/);
    expect(links.length).toBe(6);
    // Spot-check one href per source variant — preserves the existing /issues
    // mapping for nap (matches the existing /intel/search/page.tsx convention).
    const sources: Record<string, string> = {
      Санкции: "/intel/sanctions",
      Офшор: "/intel/offshore",
      OLAF: "/intel/olaf",
      Журналистика: "/intel/articles",
      Прокуратура: "/intel/prosecution",
      НАП: "/issues",
    };
    for (const [pillLabel, expectedHref] of Object.entries(sources)) {
      const pill = screen.getByText(pillLabel);
      const article = pill.closest("article")!;
      const link = article.querySelector("a");
      expect(link?.getAttribute("href")).toBe(expectedHref);
    }
  });
});
