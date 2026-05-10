import { supabase } from "@/lib/supabase";

/**
 * Ranking blend constants for the dv_search_top RPC.
 *
 * The SQL formula is:  score = LEX_WEIGHT * ts_rank + RECENCY_WEIGHT * exp(-age_days / RECENCY_HALF_LIFE_DAYS)
 *
 * Mirroring those numbers here lets unit tests recompute the JS score and
 * cross-check it against the SQL output for any (lex, age_days) pair.
 */
export const LEX_WEIGHT = 0.7;
export const RECENCY_WEIGHT = 0.3;
export const RECENCY_HALF_LIFE_DAYS = 365;

export type DvSearchFilters = {
  year?: number;
  act_type?: string;
  from_date?: string; // ISO YYYY-MM-DD
  to_date?: string;
  from_issue?: number;
  to_issue?: number;
  limit?: number; // default 50
};

export type DvSearchResult = {
  id: string;
  issue_id: string;
  issue_number: number;
  year: number;
  date: string | null;
  title: string;
  act_type: string | null;
  source_url: string | null;
  lex: number;
  rec: number;
  score: number;
};

/**
 * Pure-TS recomputation of the SQL ranking blend.
 *   SQL: 0.7 * ts_rank + 0.3 * exp(-age_days / 365)
 * Useful for unit tests that mock the RPC and verify the blend invariants.
 */
export function computeScore(lex: number, ageDays: number): number {
  return (
    LEX_WEIGHT * lex +
    RECENCY_WEIGHT * Math.exp(-ageDays / RECENCY_HALF_LIFE_DAYS)
  );
}

/**
 * Search dv_acts via the dv_search_top RPC.
 *
 * Returns ranked results blending lexical match (tsvector) + recency decay.
 * Falls back to [] on RPC error so the caller (the /dv listing page or any
 * client-side search box) still renders rather than throwing.
 *
 * Belt-and-braces guard (RESEARCH §Pitfalls #4): trimmed query of length
 * < 2 short-circuits before touching the RPC. tsvector matching at length
 * 1 produces noise; we treat sub-2-char queries as empty.
 */
export async function searchDvActs(
  query: string,
  filters: DvSearchFilters = {},
): Promise<DvSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const { data, error } = await supabase.rpc("dv_search_top", {
    q: trimmed,
    filter_year: filters.year ?? null,
    filter_act_type: filters.act_type ?? null,
    filter_from_date: filters.from_date ?? null,
    filter_to_date: filters.to_date ?? null,
    filter_from_issue: filters.from_issue ?? null,
    filter_to_issue: filters.to_issue ?? null,
    limit_n: filters.limit ?? 50,
  });

  if (error) {
    console.error("[dv-search] RPC error", error);
    return [];
  }

  return (data ?? []) as DvSearchResult[];
}
