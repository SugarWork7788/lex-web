import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IssueCard } from "@/app/dv/_components/issue-card";
import {
  DV_ACT_PILL,
  DV_ACT_PILL_FALLBACK,
  getActPill,
  DV_ACT_TYPE_ORDER,
} from "@/app/dv/_lib/act-pill";

describe("DV_ACT_PILL", () => {
  it("has 6 known act-type entries", () => {
    const keys = Object.keys(DV_ACT_PILL);
    expect(keys).toEqual(
      expect.arrayContaining([
        "Закон",
        "Наредба",
        "Постановление",
        "Указ",
        "Решение",
        "Обявление",
      ]),
    );
    expect(keys.length).toBe(6);
  });

  it("every entry uses the canonical triplet pattern (5 cool tones + stone fallback)", () => {
    for (const [key, value] of Object.entries(DV_ACT_PILL)) {
      // Обявление uses stone-800/60 + stone-300 + stone-700/40 per UI-SPEC §Color
      if (key === "Обявление") {
        expect(value.className).toMatch(
          /bg-stone-800\/60.*text-stone-300.*ring-stone-700\/40/,
        );
      } else {
        expect(value.className).toMatch(
          /bg-\w+-950\/40.*text-\w+-300.*ring-\w+-800\/40/,
        );
      }
    }
  });

  it("only uses hues from UI-SPEC's locked palette (red/amber/sky/indigo/teal/stone)", () => {
    const allowedHues = ["red", "amber", "sky", "indigo", "teal", "stone"];
    const huePattern = new RegExp(`bg-(${allowedHues.join("|")})-`);
    for (const [, value] of Object.entries(DV_ACT_PILL)) {
      expect(value.className).toMatch(huePattern);
    }
  });

  it("section render order matches CONTEXT D-09", () => {
    expect(DV_ACT_TYPE_ORDER).toEqual([
      "Закон",
      "Наредба",
      "Постановление",
      "Указ",
      "Решение",
      "Обявление",
      "Other",
    ]);
  });

  it("each pill carries the canonical geometry classes", () => {
    for (const [, value] of Object.entries(DV_ACT_PILL)) {
      expect(value.className).toContain("px-1.5");
      expect(value.className).toContain("py-0.5");
      expect(value.className).toContain("text-xs");
      expect(value.className).toContain("uppercase");
      expect(value.className).toContain("tracking-wider");
      expect(value.className).toContain("rounded-[2px]");
    }
  });
});

describe("getActPill", () => {
  it("returns the pill for a known act_type", () => {
    expect(getActPill("Закон")).toBe(DV_ACT_PILL["Закон"]);
  });
  it("returns fallback for unknown act_type", () => {
    expect(getActPill("UnknownType")).toBe(DV_ACT_PILL_FALLBACK);
  });
  it("returns fallback for null", () => {
    expect(getActPill(null)).toBe(DV_ACT_PILL_FALLBACK);
  });
});

describe("IssueCard", () => {
  it("renders issue number + date + act count", () => {
    render(
      <IssueCard
        issue={{
          id: "uuid-1",
          issue_number: 42,
          year: 2026,
          issue_supplement: 0,
          date: "2026-05-08",
          title: null,
          source_url: null,
          act_count: 10,
          top_act_types: ["Указ", "Постановление", "Наредба"],
        }}
      />,
    );
    expect(screen.getByText("Бр. 42")).toBeInTheDocument();
    expect(screen.getByText(/08\.05\.2026/)).toBeInTheDocument();
    expect(screen.getByText(/10 акта/)).toBeInTheDocument();
    expect(screen.getByText("Указ")).toBeInTheDocument();
    expect(screen.getByText("Постановление")).toBeInTheDocument();
    expect(screen.getByText("Наредба")).toBeInTheDocument();
  });

  it("links to /dv/[year-issue]", () => {
    render(
      <IssueCard
        issue={{
          id: "uuid-1",
          issue_number: 42,
          year: 2026,
          issue_supplement: 0,
          date: "2026-05-08",
          title: null,
          source_url: null,
          act_count: 0,
          top_act_types: [],
        }}
      />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/dv/2026-42");
  });

  it("hides act-type pills section when top_act_types is empty", () => {
    const { container } = render(
      <IssueCard
        issue={{
          id: "uuid-1",
          issue_number: 42,
          year: 2026,
          issue_supplement: 0,
          date: "2026-05-08",
          title: null,
          source_url: null,
          act_count: 0,
          top_act_types: [],
        }}
      />,
    );
    // No pill elements rendered — query for the rounded-[2px] geometry token
    const pills = container.querySelectorAll(
      '[class*="rounded-[2px]"]',
    );
    expect(pills.length).toBe(0);
  });

  it('renders "+ N още" overflow when more than 3 top_act_types are present', () => {
    render(
      <IssueCard
        issue={{
          id: "uuid-1",
          issue_number: 42,
          year: 2026,
          issue_supplement: 0,
          date: "2026-05-08",
          title: null,
          source_url: null,
          act_count: 12,
          top_act_types: ["Закон", "Указ", "Наредба", "Решение", "Постановление"],
        }}
      />,
    );
    // Only top-3 pills render
    expect(screen.getByText("Закон")).toBeInTheDocument();
    expect(screen.getByText("Указ")).toBeInTheDocument();
    expect(screen.getByText("Наредба")).toBeInTheDocument();
    // +2 overflow counter
    expect(screen.getByText(/\+ 2 още/)).toBeInTheDocument();
  });

  it('uses singular "акт" form for count 1 (BG pluralization)', () => {
    render(
      <IssueCard
        issue={{
          id: "uuid-x",
          issue_number: 1,
          year: 2026,
          issue_supplement: 0,
          date: "2026-01-03",
          title: null,
          source_url: null,
          act_count: 1,
          top_act_types: [],
        }}
      />,
    );
    expect(screen.getByText("1 акт")).toBeInTheDocument();
  });
});
