import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

import { supabase } from "@/lib/supabase";
import {
  searchDvActs,
  computeScore,
  LEX_WEIGHT,
  RECENCY_WEIGHT,
  RECENCY_HALF_LIFE_DAYS,
  type DvSearchResult,
} from "@/lib/dv-search";

const mockRpc = vi.mocked(supabase.rpc);

describe("dv-search constants", () => {
  it("LEX_WEIGHT is 0.7 (mirrors SQL formula)", () => {
    expect(LEX_WEIGHT).toBe(0.7);
  });

  it("RECENCY_WEIGHT is 0.3 (mirrors SQL formula)", () => {
    expect(RECENCY_WEIGHT).toBe(0.3);
  });

  it("RECENCY_HALF_LIFE_DAYS is 365 (1-year half-life)", () => {
    expect(RECENCY_HALF_LIFE_DAYS).toBe(365);
  });

  it("LEX_WEIGHT + RECENCY_WEIGHT = 1.0 (canonical blend)", () => {
    expect(LEX_WEIGHT + RECENCY_WEIGHT).toBeCloseTo(1.0, 10);
  });
});

describe("computeScore", () => {
  it("returns lex * 0.7 + 1.0 * 0.3 when age_days = 0 (newest)", () => {
    expect(computeScore(1.0, 0)).toBeCloseTo(1.0, 4);
    expect(computeScore(0.5, 0)).toBeCloseTo(0.5 * 0.7 + 0.3, 4);
  });

  it("recency decays to 1/e at 365 days", () => {
    // At age = HALF_LIFE_DAYS: rec = exp(-1) ≈ 0.368
    const score = computeScore(0.0, 365);
    expect(score).toBeCloseTo(0.3 * Math.exp(-1), 4);
  });

  it("matches SQL formula for representative inputs", () => {
    // Cross-check: lex=0.607927, age=10 days → JS blend ≈ SQL blend
    const score = computeScore(0.607927, 10);
    expect(score).toBeCloseTo(
      0.7 * 0.607927 + 0.3 * Math.exp(-10 / 365),
      4,
    );
  });
});

describe("searchDvActs", () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it("returns empty array for short queries (length < 2)", async () => {
    const result = await searchDvActs("a");
    expect(result).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns empty array for whitespace-only queries", async () => {
    const result = await searchDvActs("   ");
    expect(result).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("calls RPC with trimmed query + null filter defaults", async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null } as never);
    await searchDvActs("  пране на пари  ");
    expect(mockRpc).toHaveBeenCalledWith("dv_search_top", {
      q: "пране на пари",
      filter_year: null,
      filter_act_type: null,
      filter_from_date: null,
      filter_to_date: null,
      filter_from_issue: null,
      filter_to_issue: null,
      limit_n: 50,
    });
  });

  it("forwards filters to RPC", async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null } as never);
    await searchDvActs("корупция", {
      year: 2025,
      act_type: "Закон",
      from_date: "2025-01-01",
      to_date: "2025-12-31",
      from_issue: 1,
      to_issue: 50,
      limit: 25,
    });
    expect(mockRpc).toHaveBeenCalledWith("dv_search_top", {
      q: "корупция",
      filter_year: 2025,
      filter_act_type: "Закон",
      filter_from_date: "2025-01-01",
      filter_to_date: "2025-12-31",
      filter_from_issue: 1,
      filter_to_issue: 50,
      limit_n: 25,
    });
  });

  it("returns RPC data on success", async () => {
    const fixture: DvSearchResult[] = [
      {
        id: "uuid-1",
        issue_id: "uuid-i1",
        issue_number: 42,
        year: 2026,
        date: "2026-05-08",
        title: "Указ № 150",
        act_type: "Указ",
        source_url: "https://example.com/?idMat=1",
        lex: 0.5,
        rec: 0.9,
        score: 0.62,
      },
    ];
    mockRpc.mockResolvedValueOnce({ data: fixture, error: null } as never);
    const result = await searchDvActs("Указ");
    expect(result).toEqual(fixture);
  });

  it("returns empty array on RPC error (fallback)", async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "function dv_search_top does not exist" },
    } as never);
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const result = await searchDvActs("test");
    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[dv-search] RPC error",
      expect.any(Object),
    );
    consoleSpy.mockRestore();
  });

  it("returns empty array when RPC returns null data", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null } as never);
    const result = await searchDvActs("test");
    expect(result).toEqual([]);
  });

  it("uses default limit 50 when filters.limit omitted", async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null } as never);
    await searchDvActs("test");
    expect(mockRpc).toHaveBeenCalledWith(
      "dv_search_top",
      expect.objectContaining({ limit_n: 50 }),
    );
  });
});
