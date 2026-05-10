import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActCard } from "@/app/dv/[slug]/_components/act-card";
import { DvIssuePageClient } from "@/app/dv/[slug]/dv-issue-page-client";
import { type DvActRow } from "@/lib/queries";

// Mock useRateLimitedFetch — DvActSummary destructures only `submit`.
// The mock resolves to an error so the streaming branch is never entered.
vi.mock("@/lib/use-rate-limited-fetch", () => ({
  useRateLimitedFetch: () => ({
    submit: vi.fn().mockResolvedValue({ ok: false, error: "test" }),
  }),
}));

const mockAct = (over: Partial<DvActRow> = {}): DvActRow => ({
  id: "uuid-1",
  issue_id: "uuid-i1",
  issue_number: 42,
  year: 2026,
  act_number: null,
  title: "Указ № 150 за освобождаване",
  act_type: "Указ",
  full_text: "...",
  source_url:
    "https://dv.parliament.bg/DVWeb/showMaterialDV.jsp?idMat=243295",
  razdel: 1,
  summary_ai: null,
  summary_ai_generated_at: null,
  ...over,
});

describe("ActCard", () => {
  it("renders title + act-type pill + source link", () => {
    render(<ActCard act={mockAct()} />);
    expect(
      screen.getByText("Указ № 150 за освобождаване"),
    ).toBeInTheDocument();
    expect(screen.getByText("Указ")).toBeInTheDocument();
    const sourceLink = screen.getByRole("link", { name: /Виж оригинала/ });
    expect(sourceLink).toHaveAttribute(
      "href",
      "https://dv.parliament.bg/DVWeb/showMaterialDV.jsp?idMat=243295",
    );
    expect(sourceLink).toHaveAttribute("target", "_blank");
    expect(sourceLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("source link is absent when source_url is null", () => {
    render(<ActCard act={mockAct({ source_url: null })} />);
    expect(screen.queryByText(/Оригинал/)).not.toBeInTheDocument();
  });

  it("renders pill fallback for unknown act_type", () => {
    render(<ActCard act={mockAct({ act_type: "UnknownType" })} />);
    expect(screen.getByText("Друг")).toBeInTheDocument();
  });
});

describe("DvIssuePageClient", () => {
  it("renders grouped sections in DV_ACT_TYPE_ORDER", () => {
    const acts = [
      mockAct({ id: "a1", act_type: "Решение", title: "Решение № 1" }),
      mockAct({ id: "a2", act_type: "Указ", title: "Указ № 150" }),
      mockAct({ id: "a3", act_type: "Закон", title: "Закон за нещо" }),
    ];
    const { container } = render(<DvIssuePageClient acts={acts} />);
    const sections = container.querySelectorAll("section");
    expect(sections.length).toBe(3);
    // Закон comes first, then Указ, then Решение per DV_ACT_TYPE_ORDER
    expect(sections[0].textContent).toContain("Закон");
    expect(sections[1].textContent).toContain("Указ");
    expect(sections[2].textContent).toContain("Решение");
  });

  it("renders empty state when no acts", () => {
    render(<DvIssuePageClient acts={[]} />);
    expect(
      screen.getByText(/Няма актове в този брой/),
    ).toBeInTheDocument();
  });

  it("collapses an expanded card when another is expanded (single-expand contract)", () => {
    const acts = [
      mockAct({ id: "a1", title: "Act 1" }),
      mockAct({ id: "a2", title: "Act 2" }),
    ];
    render(<DvIssuePageClient acts={acts} />);
    const triggers = screen.getAllByRole("button", {
      name: /✦ AI обобщение/,
    });
    expect(triggers.length).toBe(2);

    // Initially no "Скрий" anywhere
    expect(screen.queryByText("Скрий")).not.toBeInTheDocument();

    // Expand the first card
    fireEvent.click(triggers[0]);
    expect(screen.getAllByText("Скрий").length).toBe(1);

    // Expand the second — first should collapse, only one "Скрий" remains
    const triggersAfterFirst = screen.getAllByRole("button", {
      name: /✦ AI обобщение/,
    });
    fireEvent.click(triggersAfterFirst[triggersAfterFirst.length - 1]);
    expect(screen.getAllByText("Скрий").length).toBe(1);
  });

  it("buckets unmapped act_types into the Other section", () => {
    const acts = [
      mockAct({ id: "x1", act_type: "Other", title: "Определение" }),
      mockAct({ id: "x2", act_type: "Споразумение", title: "Споразумение #1" }),
    ];
    const { container } = render(<DvIssuePageClient acts={acts} />);
    // Both acts collapse into one "Other" section because Споразумение is
    // not in DV_ACT_TYPE_ORDER and falls back to "Other".
    const sections = container.querySelectorAll("section");
    expect(sections.length).toBe(1);
    expect(screen.getByText("Определение")).toBeInTheDocument();
    expect(screen.getByText("Споразумение #1")).toBeInTheDocument();
  });

  it("shows section count in the H2 heading", () => {
    const acts = [
      mockAct({ id: "z1", act_type: "Закон", title: "Закон A" }),
      mockAct({ id: "z2", act_type: "Закон", title: "Закон B" }),
      mockAct({ id: "z3", act_type: "Закон", title: "Закон C" }),
    ];
    render(<DvIssuePageClient acts={acts} />);
    expect(screen.getByText(/\(3\)/)).toBeInTheDocument();
  });
});
