import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for lib/intel-search.ts (Phase 02 / INT-02 / plan 02-02 Task 1).
 *
 * Mocks @/lib/supabase so supabase.rpc is a vi.fn(). Tests cover:
 *   - empty / single-char short-circuit (RESEARCH Pitfall 5)
 *   - happy-path RPC shape (RankedRow[] passthrough)
 *   - RPC error fallback returns [] (does NOT throw; warns)
 *   - constants verbatim from db/intel_fts.sql score expression
 *   - scoreBlend math at boundary cases.
 */

const rpcMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

describe("lib/intel-search.ts (INT-02 ranking helper)", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports RECENCY_HALF_LIFE_DAYS=365, LEX_WEIGHT=0.7, RECENCY_WEIGHT=0.3 and the weights sum to 1", async () => {
    const mod = await import("@/lib/intel-search");
    expect(mod.RECENCY_HALF_LIFE_DAYS).toBe(365);
    expect(mod.LEX_WEIGHT).toBe(0.7);
    expect(mod.RECENCY_WEIGHT).toBe(0.3);
    expect(mod.LEX_WEIGHT + mod.RECENCY_WEIGHT).toBeCloseTo(1, 10);
  });

  it("scoreBlend({lex:0.5,rec:0.5}) === 0.5 (round-trip identity)", async () => {
    const { scoreBlend } = await import("@/lib/intel-search");
    expect(scoreBlend({ lex: 0.5, rec: 0.5 })).toBeCloseTo(0.5, 10);
  });

  it("scoreBlend({lex:1,rec:0}) === 0.7 (pure lexical match, ancient row)", async () => {
    const { scoreBlend } = await import("@/lib/intel-search");
    expect(scoreBlend({ lex: 1, rec: 0 })).toBeCloseTo(0.7, 10);
  });

  it("scoreBlend({lex:0,rec:1}) === 0.3 (zero lex, today's row — recency weight bound)", async () => {
    const { scoreBlend } = await import("@/lib/intel-search");
    expect(scoreBlend({ lex: 0, rec: 1 })).toBeCloseTo(0.3, 10);
  });

  it("searchTopRanked('') returns [] without calling supabase.rpc (Pitfall 5 short-circuit)", async () => {
    const { searchTopRanked } = await import("@/lib/intel-search");
    const out = await searchTopRanked("");
    expect(out).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("searchTopRanked('a') returns [] (length<2 minimum guard, no RPC trip)", async () => {
    const { searchTopRanked } = await import("@/lib/intel-search");
    const out = await searchTopRanked("a");
    expect(out).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("searchTopRanked passes a trimmed query to supabase.rpc('intel_search_top', {q})", async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    const { searchTopRanked } = await import("@/lib/intel-search");
    await searchTopRanked("  борисов  ");
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("intel_search_top", { q: "борисов" });
  });

  it("happy-path: returns rows verbatim shaped as RankedRow[]", async () => {
    const fakeRows = [
      { source: "articles", id: "a1", title: "Заглавие 1", summary: "Резюме 1", lex: 0.42, rec: 0.91, score: 0.567 },
      { source: "sanctioned", id: "s9", title: "Иван Иванов", summary: null, lex: 0.30, rec: 0.50, score: 0.36 },
    ];
    rpcMock.mockResolvedValueOnce({ data: fakeRows, error: null });
    const { searchTopRanked } = await import("@/lib/intel-search");
    const out = await searchTopRanked("борисов");
    expect(out).toEqual(fakeRows);
    expect(out[0].source).toBe("articles");
    expect(out[1].source).toBe("sanctioned");
    expect(out[0].score).toBeCloseTo(0.567, 5);
  });

  it("RPC error path returns [] and warns — does NOT throw (pre-migration staging fallback)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "function intel_search_top does not exist" },
    });
    const { searchTopRanked } = await import("@/lib/intel-search");
    const out = await searchTopRanked("борисов");
    expect(out).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/\[intel-search\]/);
    expect(warnSpy.mock.calls[0][0]).toMatch(/intel_search_top/);
  });

  it("RPC throws → returns [] and warns (network/transport-level failure)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    rpcMock.mockRejectedValueOnce(new Error("fetch failed"));
    const { searchTopRanked } = await import("@/lib/intel-search");
    const out = await searchTopRanked("борисов");
    expect(out).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/\[intel-search\]/);
    expect(warnSpy.mock.calls[0][0]).toMatch(/threw/);
  });

  it("clamps result to limit (default 5)", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      source: "articles", id: `a${i}`, title: `t${i}`, summary: `s${i}`, lex: 0.1, rec: 0.1, score: 0.1,
    }));
    rpcMock.mockResolvedValueOnce({ data: many, error: null });
    const { searchTopRanked } = await import("@/lib/intel-search");
    const out = await searchTopRanked("борисов");
    expect(out.length).toBe(5);
    expect(out[0].id).toBe("a0");
    expect(out[4].id).toBe("a4");
  });

  it("respects custom limit", async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      source: "articles", id: `a${i}`, title: `t${i}`, summary: `s${i}`, lex: 0.1, rec: 0.1, score: 0.1,
    }));
    rpcMock.mockResolvedValueOnce({ data: many, error: null });
    const { searchTopRanked } = await import("@/lib/intel-search");
    const out = await searchTopRanked("борисов", 3);
    expect(out.length).toBe(3);
  });
});
