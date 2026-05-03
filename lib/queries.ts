import {
  supabase,
  type Law,
  type LawArticle,
  type CrossReference,
  type Severity,
  type StoredIssue,
} from "./supabase";

export async function getCategoryCounts(): Promise<Record<string, number>> {
  // PostgREST caps rows at db-max-rows (1000), so we paginate the category
  // column in 1000-row chunks until a short page comes back.
  const PAGE = 1000;
  const counts: Record<string, number> = {};
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .from("laws")
      .select("category")
      .range(start, start + PAGE - 1);
    if (error) throw new Error(`getCategoryCounts: ${error.message}`);
    const chunk = data ?? [];
    for (const row of chunk) {
      counts[row.category] = (counts[row.category] ?? 0) + 1;
    }
    if (chunk.length < PAGE) break;
  }
  return counts;
}

export async function listLaws(category?: string): Promise<Law[]> {
  // Supabase / PostgREST caps responses at db-max-rows (1000 by default).
  // The corpus has ~1,240 laws, so the unfiltered list paginates in chunks
  // until the page comes back short. Per-category lists fit in one request.
  const PAGE = 1000;
  const out: Law[] = [];
  for (let start = 0; ; start += PAGE) {
    let q = supabase
      .from("laws")
      .select("slug, name_bg, category, level, level_name, article_count, url")
      .order("name_bg", { ascending: true })
      .range(start, start + PAGE - 1);
    if (category) q = q.eq("category", category);
    const { data, error } = await q;
    if (error) throw new Error(`listLaws: ${error.message}`);
    const chunk = (data ?? []) as Law[];
    out.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return out;
}

export async function getLawBySlug(slug: string): Promise<Law | null> {
  const { data, error } = await supabase
    .from("laws")
    .select("slug, name_bg, category, level, level_name, article_count, url")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`getLawBySlug: ${error.message}`);
  return (data as Law | null) ?? null;
}

export async function getLawArticles(slug: string): Promise<LawArticle[]> {
  const { data, error } = await supabase
    .from("law_articles")
    .select("law_slug, ordinal, chapter_title, section_title, article_number, text_content")
    .eq("law_slug", slug)
    .order("ordinal", { ascending: true });
  if (error) throw new Error(`getLawArticles: ${error.message}`);
  return (data ?? []) as LawArticle[];
}

export async function getCrossReferencesFrom(slug: string): Promise<CrossReference[]> {
  const { data, error } = await supabase
    .from("cross_references")
    .select("from_slug, from_article, to_slug, raw_text, matched")
    .eq("from_slug", slug)
    .eq("matched", true)
    .limit(200);
  if (error) throw new Error(`getCrossReferencesFrom: ${error.message}`);
  return (data ?? []) as CrossReference[];
}

export type SearchHit = {
  law_slug: string;
  article_number: string;
  chapter_title: string | null;
  snippet: string;
  rank: number;
  law_name_bg: string;
  category: string;
};

export async function searchArticles(query: string, limit = 50): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  // Defined as a Postgres function in db/schema.sql or via inline RPC.
  // Use Supabase's `rpc` to call a function `search_articles(q text, lim int)`.
  const { data, error } = await supabase.rpc("search_articles", {
    q: trimmed,
    lim: limit,
  });
  if (error) throw new Error(`searchArticles: ${error.message}`);
  return (data ?? []) as SearchHit[];
}

// ============================================================
// Stored analyses & issues
// ============================================================

export type IssueListFilters = {
  severity?: Severity;
  type?: string;
  law?: string;
  verified?: boolean;
};

export type IssueListItem = StoredIssue & {
  law_name_bg: string;
  analyzed_at: string;
};

export type IssueListResult = {
  items: IssueListItem[];
  totalCount: number;
};

export async function listStoredIssues(
  filters: IssueListFilters,
  page: number,
  pageSize: number,
  sort: "severity" | "date" | "type" = "severity",
): Promise<IssueListResult> {
  let q = supabase
    .from("law_issues")
    .select(
      `id, analysis_id, law_slug, type, severity, explanation,
       primary_law_slug, primary_articles, conflicting_law_slug,
       conflicting_articles, quote_primary, quote_conflicting,
       verified, refined_explanation, created_at,
       law_analyses!inner(law_name_bg, analyzed_at)`,
      { count: "exact" },
    );

  if (filters.severity) q = q.eq("severity", filters.severity);
  if (filters.type) q = q.eq("type", filters.type);
  if (filters.law) q = q.eq("law_slug", filters.law);
  if (filters.verified === true) q = q.eq("verified", true);

  if (sort === "date") {
    q = q.order("created_at", { ascending: false });
  } else if (sort === "type") {
    q = q.order("type", { ascending: true }).order("created_at", { ascending: false });
  } else {
    // severity (default): висок < среден < нисък alphabetic doesn't help; rely on a
    // computed mapping via two ordered fetches won't be clean. Use a CASE via PostgREST
    // is awkward — fall back to client-side severity sort applied to the page slice.
    q = q.order("created_at", { ascending: false });
  }

  const from = page * pageSize;
  const to = from + pageSize - 1;
  q = q.range(from, to);

  const { data, error, count } = await q;
  if (error) throw new Error(`listStoredIssues: ${error.message}`);

  const SEV_RANK: Record<Severity, number> = { висок: 0, среден: 1, нисък: 2 };

  type Row = StoredIssue & {
    law_analyses: { law_name_bg: string; analyzed_at: string }[] | { law_name_bg: string; analyzed_at: string };
  };
  const items: IssueListItem[] = (data as Row[] | null ?? []).map((r) => {
    const meta = Array.isArray(r.law_analyses) ? r.law_analyses[0] : r.law_analyses;
    return {
      id: r.id,
      analysis_id: r.analysis_id,
      law_slug: r.law_slug,
      type: r.type,
      severity: r.severity,
      explanation: r.explanation,
      primary_law_slug: r.primary_law_slug,
      primary_articles: r.primary_articles,
      conflicting_law_slug: r.conflicting_law_slug,
      conflicting_articles: r.conflicting_articles,
      quote_primary: r.quote_primary,
      quote_conflicting: r.quote_conflicting,
      verified: r.verified,
      refined_explanation: r.refined_explanation,
      created_at: r.created_at,
      law_name_bg: meta?.law_name_bg ?? r.law_slug,
      analyzed_at: meta?.analyzed_at ?? r.created_at,
    };
  });

  if (sort === "severity") {
    items.sort((a, b) => {
      const r = SEV_RANK[a.severity] - SEV_RANK[b.severity];
      if (r !== 0) return r;
      return b.created_at.localeCompare(a.created_at);
    });
  }

  return { items, totalCount: count ?? items.length };
}

export async function getIssuesSummary(): Promise<{
  totalIssues: number;
  totalAnalyses: number;
  lawsAnalyzed: number;
}> {
  const [issuesRes, analysesRes, lawsRes] = await Promise.all([
    supabase.from("law_issues").select("id", { count: "exact", head: true }),
    supabase
      .from("law_analyses")
      .select("id", { count: "exact", head: true }),
    supabase.from("law_analyses").select("law_slug"),
  ]);
  if (issuesRes.error) throw new Error(`getIssuesSummary issues: ${issuesRes.error.message}`);
  if (analysesRes.error) throw new Error(`getIssuesSummary analyses: ${analysesRes.error.message}`);
  if (lawsRes.error) throw new Error(`getIssuesSummary laws: ${lawsRes.error.message}`);

  const distinctLaws = new Set<string>();
  for (const r of (lawsRes.data ?? []) as { law_slug: string }[]) distinctLaws.add(r.law_slug);

  return {
    totalIssues: issuesRes.count ?? 0,
    totalAnalyses: analysesRes.count ?? 0,
    lawsAnalyzed: distinctLaws.size,
  };
}

export async function getProblematicLawsLeaderboard(
  limit = 10,
): Promise<{ law_slug: string; law_name_bg: string; issue_count: number }[]> {
  // PostgREST has no GROUP BY; client-side aggregate.
  const PAGE = 1000;
  const counts = new Map<string, { name: string; n: number }>();
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .from("law_issues")
      .select("law_slug, law_analyses!inner(law_name_bg)")
      .range(start, start + PAGE - 1);
    if (error) throw new Error(`leaderboard: ${error.message}`);
    const chunk = (data ?? []) as {
      law_slug: string;
      law_analyses: { law_name_bg: string }[] | { law_name_bg: string };
    }[];
    for (const row of chunk) {
      const meta = Array.isArray(row.law_analyses) ? row.law_analyses[0] : row.law_analyses;
      const cur = counts.get(row.law_slug);
      if (cur) cur.n += 1;
      else
        counts.set(row.law_slug, {
          name: meta?.law_name_bg ?? row.law_slug,
          n: 1,
        });
    }
    if (chunk.length < PAGE) break;
  }
  return [...counts.entries()]
    .map(([law_slug, v]) => ({ law_slug, law_name_bg: v.name, issue_count: v.n }))
    .sort((a, b) => b.issue_count - a.issue_count)
    .slice(0, limit);
}

export async function getDistinctIssueTypes(): Promise<string[]> {
  const { data, error } = await supabase.from("law_issues").select("type");
  if (error) throw new Error(`getDistinctIssueTypes: ${error.message}`);
  const set = new Set<string>();
  for (const r of (data ?? []) as { type: string }[]) set.add(r.type);
  return [...set].sort();
}

// ============================================================
// Court decisions (КС, ВКС, ВАС)
// ============================================================

export type CourtDecision = {
  id: string;
  ecli: string | null;
  court: string;
  court_code: string;
  act_type: string | null;
  case_number: string | null;
  decision_number: string | null;
  college: string | null;
  decision_date: string | null;
  year: number | null;
  title: string | null;
  source_url: string;
  cited_law_slugs: string[];
};

export type CourtDecisionFull = CourtDecision & {
  full_text: string;
};

export async function getCourtCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const PAGE = 1000;
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .from("court_decisions")
      .select("court_code")
      .range(start, start + PAGE - 1);
    if (error) throw new Error(`getCourtCounts: ${error.message}`);
    const chunk = (data ?? []) as { court_code: string }[];
    for (const r of chunk) {
      counts[r.court_code] = (counts[r.court_code] ?? 0) + 1;
    }
    if (chunk.length < PAGE) break;
  }
  return counts;
}

export async function listCourtDecisions(opts: {
  court_code: string;
  year?: number;
  page?: number;
  pageSize?: number;
}): Promise<{ items: CourtDecision[]; total: number }> {
  const { court_code, year, page = 0, pageSize = 20 } = opts;
  let q = supabase
    .from("court_decisions")
    .select(
      "id,ecli,court,court_code,act_type,case_number,decision_number,college,decision_date,year,title,source_url,cited_law_slugs",
      { count: "exact" },
    )
    .eq("court_code", court_code)
    .not("full_text", "eq", "")
    .order("decision_date", { ascending: false, nullsFirst: false });

  if (year) q = q.eq("year", year);
  q = q.range(page * pageSize, page * pageSize + pageSize - 1);

  const { data, count, error } = await q;
  if (error) throw new Error(`listCourtDecisions: ${error.message}`);
  return { items: (data ?? []) as CourtDecision[], total: count ?? 0 };
}

export async function getCourtDecision(
  id: string,
): Promise<CourtDecisionFull | null> {
  const { data, error } = await supabase
    .from("court_decisions")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data as CourtDecisionFull;
}

export async function getAvailableYears(
  court_code: string,
): Promise<number[]> {
  const { data, error } = await supabase
    .from("court_decisions")
    .select("year")
    .eq("court_code", court_code)
    .not("year", "is", null);
  if (error) throw new Error(`getAvailableYears: ${error.message}`);
  const years = [
    ...new Set(
      (data ?? [])
        .map((r) => (r as { year: number }).year)
        .filter((y) => Boolean(y)),
    ),
  ].sort((a, b) => b - a);
  return years as number[];
}

// ============================================================
// EU Regulations
// ============================================================

export type EuRegulation = {
  id: string;
  celex: string;
  title_bg: string | null;
  title_en: string | null;
  doc_type: string | null;
  year: number | null;
  number: string | null;
  in_force: boolean;
  date_document: string | null;
  date_force: string | null;
  source_url: string | null;
};

export type EuRegulationFull = EuRegulation & {
  full_text_bg: string | null;
  full_text_en: string | null;
};

export async function getEuCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const PAGE = 1000;
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .from("eu_regulations")
      .select("doc_type")
      .range(start, start + PAGE - 1);
    if (error) throw new Error(`getEuCounts: ${error.message}`);
    const chunk = (data ?? []) as { doc_type: string | null }[];
    for (const r of chunk) {
      const t = r.doc_type ?? "other";
      counts[t] = (counts[t] ?? 0) + 1;
    }
    if (chunk.length < PAGE) break;
  }
  return counts;
}

export async function listEuRegulations(opts: {
  doc_type?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: EuRegulation[]; total: number }> {
  const { doc_type, page = 0, pageSize = 20 } = opts;
  let q = supabase
    .from("eu_regulations")
    .select(
      "id,celex,title_bg,title_en,doc_type,year,number,in_force,date_document,date_force,source_url",
      { count: "exact" },
    )
    .order("date_document", { ascending: false, nullsFirst: false });

  if (doc_type) q = q.eq("doc_type", doc_type);
  q = q.range(page * pageSize, page * pageSize + pageSize - 1);

  const { data, count, error } = await q;
  if (error) throw new Error(`listEuRegulations: ${error.message}`);
  return { items: (data ?? []) as EuRegulation[], total: count ?? 0 };
}

export async function getEuRegulation(
  celex: string,
): Promise<EuRegulationFull | null> {
  const { data, error } = await supabase
    .from("eu_regulations")
    .select("*")
    .eq("celex", celex)
    .single();
  if (error) return null;
  return data as EuRegulationFull;
}

export async function getDecisionsForLaw(
  lawSlug: string,
  limit = 6,
): Promise<CourtDecision[]> {
  const { data } = await supabase
    .from("court_decisions")
    .select(
      "id,ecli,court,court_code,act_type,case_number,decision_number,decision_date,year,title,source_url,cited_law_slugs",
    )
    .contains("cited_law_slugs", [lawSlug])
    .order("decision_date", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data ?? []) as CourtDecision[];
}

export async function searchDecisions(
  query: string,
  limit = 5,
  courtCode?: string,
): Promise<CourtDecision[]> {
  try {
    const { data } = await supabase.rpc("search_decisions", {
      query,
      p_court: courtCode ?? null,
      p_year: null,
      lim: limit,
    });
    if (data && Array.isArray(data) && data.length > 0) {
      return data as CourtDecision[];
    }
  } catch {
    // RPC not available — fall through to ilike fallback.
  }
  let q = supabase
    .from("court_decisions")
    .select(
      "id,ecli,court,court_code,act_type,case_number,decision_number,decision_date,year,title,source_url,cited_law_slugs",
    )
    .ilike("full_text", `%${query.slice(0, 100)}%`)
    .limit(limit);
  if (courtCode) q = q.eq("court_code", courtCode);
  const { data } = await q;
  return (data ?? []) as CourtDecision[];
}
