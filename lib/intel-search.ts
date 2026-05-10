/**
 * Helper for INT-02 (Phase 02 — Intel search v2).
 *
 * Calls the Postgres function `intel_search_top(q text)` created by
 * `db/intel_fts.sql` (plan 02-01). Constants used by the SQL function are
 * duplicated here for unit testing — keep both in sync if the SQL is retuned.
 *
 * On RPC failure (e.g. function not yet migrated to a staging DB) the helper
 * returns `[]` and logs to `console.warn` so the page can still render the
 * existing per-source breakdown (CONTEXT.md D-01 graceful degradation).
 *
 * No structured-log emit here — CONTEXT.md D-07 promises only that we REUSE
 * the Phase-1 pattern; this helper is pure data-fetch. Throttle events come
 * from the routes that call this helper, not from the helper itself.
 */

import { supabase } from "@/lib/supabase";

/** Recency-decay characteristic time. Mirrors `db/intel_fts.sql` (`/ 86400.0 / 365.0`). */
export const RECENCY_HALF_LIFE_DAYS = 365;

/** Score-blend weight on lexical relevance. Mirrors `0.7 * ts_rank` in the SQL. */
export const LEX_WEIGHT = 0.7;

/** Score-blend weight on recency decay. Mirrors `0.3 * exp(...)` in the SQL. */
export const RECENCY_WEIGHT = 0.3;

/** The 6 intel sources, matching the `source` enum returned by `intel_search_top`. */
export type IntelSource =
  | "sanctioned"
  | "offshore"
  | "olaf"
  | "articles"
  | "prosecution"
  | "nap";

export type RankedRow = {
  source: IntelSource;
  id: string;
  title: string | null;
  summary: string | null;
  lex: number;
  rec: number;
  score: number;
};

/**
 * Pure helper: blends lex+rec the same way the SQL `score` column does.
 * Exported for unit testing. Not used in production code paths — the SQL
 * function returns the blended score directly in `RankedRow.score`.
 */
export function scoreBlend({ lex, rec }: { lex: number; rec: number }): number {
  return LEX_WEIGHT * lex + RECENCY_WEIGHT * rec;
}

/**
 * Returns up to `limit` cross-source ranked rows for a query string.
 *
 * RPC contract (from `db/intel_fts.sql`, plan 02-01):
 *   intel_search_top(q text) RETURNS TABLE(
 *     source text, id text, title text, summary text,
 *     lex real, rec real, score real
 *   ) ORDER BY score DESC LIMIT 5
 *
 * Behaviour:
 *   - `q.trim().length < 2` → return `[]` immediately (no RPC trip).
 *     This is belt-and-braces against the SQL's own `length(trim(q)) > 0`
 *     guard; we also avoid wasted network on single-char input.
 *   - RPC error → log `console.warn` with `[intel-search]` prefix, return `[]`.
 *   - RPC throws → log `console.warn`, return `[]` (do NOT propagate).
 *
 * @param q     User-supplied query string (untrimmed OK).
 * @param limit Maximum rows to return (default 5; the SQL also caps at 5).
 */
export async function searchTopRanked(q: string, limit = 5): Promise<RankedRow[]> {
  const trimmed = q.trim();
  // RESEARCH Pitfall 5 — belt-and-braces. The SQL also has a length guard;
  // this short-circuit avoids a network round trip for empty/single-char inputs.
  if (trimmed.length < 2) return [];

  try {
    const { data, error } = await supabase.rpc("intel_search_top", { q: trimmed });
    if (error) {
      console.warn(
        `[intel-search] intel_search_top RPC failed: ${error.message} — returning [] (run db:intel-fts to apply migration)`,
      );
      return [];
    }
    const rows = (data ?? []) as RankedRow[];
    return rows.slice(0, limit);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[intel-search] intel_search_top RPC threw: ${msg} — returning []`);
    return [];
  }
}
