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

// Parallel HEAD-COUNT queries per known court_code. Three round-trips that
// fly in parallel (~one round-trip wall-clock) instead of paginating ~3 KB of
// court_code strings 1000 rows at a time. PostgREST's `select('id', { count:
// 'exact', head: true })` returns no rows, just the X-Total-Count header —
// that's why this is dramatically faster than the previous approach as the
// table grows.
const KNOWN_COURT_CODES = ["CC", "SC", "SA"] as const;

export async function getCourtCounts(): Promise<Record<string, number>> {
  const results = await Promise.all(
    KNOWN_COURT_CODES.map(async (code) => {
      const { count, error } = await supabase
        .from("court_decisions")
        .select("id", { count: "exact", head: true })
        .eq("court_code", code);
      if (error) throw new Error(`getCourtCounts(${code}): ${error.message}`);
      return [code, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(results);
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

export async function searchEuRegulations(
  query: string,
  limit = 20,
): Promise<EuRegulation[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  // Escape commas/percents that would break PostgREST's `or` syntax.
  const safe = trimmed.replace(/[%,()]/g, " ");
  const { data, error } = await supabase
    .from("eu_regulations")
    .select(
      "id,celex,title_bg,title_en,doc_type,year,number,in_force,date_document,date_force,source_url",
    )
    .or(`title_bg.ilike.%${safe}%,title_en.ilike.%${safe}%,celex.ilike.%${safe}%`)
    .order("date_document", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) {
    console.error("searchEuRegulations error", error);
    return [];
  }
  return (data ?? []) as EuRegulation[];
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

// ============================================================
// Intel Center
// ============================================================

export type SanctionedEntity = {
  id: string;
  name: string | null;
  entity_type: string | null;
  sanction_type: string | null;
  sanctioning_body: string | null;
  country: string | null;
  opensanctions_id: string | null;
};

export type OffshoreEntity = {
  id: string;
  name: string | null;
  jurisdiction: string | null;
  linked_to: string | null;
  source_file: string | null;
  status: string | null;
  icij_id: string | null;
  entity_type: string | null;
};

export type OlafCase = {
  id: string;
  title: string | null;
  date: string | null;
  fraud_type: string | null;
  amount_eur: number | null;
  country: string | null;
  source_url: string | null;
};

export type InvestigativeArticle = {
  id: string;
  title: string | null;
  date: string | null;
  source: string | null;
  author: string | null;
  summary: string | null;
  url: string | null;
  tags: string[] | null;
};

export type ProsecutionCase = {
  id: string;
  title: string | null;
  date: string | null;
  charges: string[] | null;
  amount_bgn: number | null;
  source_url: string | null;
};

export async function getIntelCounts(): Promise<{
  sanctioned: number; offshore: number; olaf: number;
  articles: number; prosecution: number; nap: number;
}> {
  const tables: ("sanctioned_entities" | "offshore_entities" | "olaf_cases" |
                 "investigative_articles" | "prosecution_cases" | "nap_rulings")[]
    = ["sanctioned_entities", "offshore_entities", "olaf_cases",
       "investigative_articles", "prosecution_cases", "nap_rulings"];
  const counts = await Promise.all(tables.map(async (t) => {
    const r = await supabase.from(t).select("id", { count: "exact", head: true });
    return [t, r.count ?? 0] as const;
  }));
  const m = Object.fromEntries(counts);
  return {
    sanctioned: m.sanctioned_entities ?? 0,
    offshore:   m.offshore_entities ?? 0,
    olaf:       m.olaf_cases ?? 0,
    articles:   m.investigative_articles ?? 0,
    prosecution: m.prosecution_cases ?? 0,
    nap:        m.nap_rulings ?? 0,
  };
}

export async function listSanctionedEntities(opts: {
  search?: string; entity_type?: string; sanctioning_body?: string;
  page?: number; pageSize?: number;
}): Promise<{ items: SanctionedEntity[]; total: number }> {
  const { search, entity_type, sanctioning_body, page = 0, pageSize = 50 } = opts;
  let q = supabase.from("sanctioned_entities")
    .select("id,name,entity_type,sanction_type,sanctioning_body,country,opensanctions_id",
            { count: "exact" })
    .order("name", { ascending: true });
  if (search) q = q.ilike("name", `%${search.replace(/[%]/g, " ")}%`);
  if (entity_type) q = q.eq("entity_type", entity_type);
  if (sanctioning_body) q = q.eq("sanctioning_body", sanctioning_body);
  q = q.range(page * pageSize, page * pageSize + pageSize - 1);
  const { data, count } = await q;
  return { items: (data ?? []) as SanctionedEntity[], total: count ?? 0 };
}

export async function listOffshoreEntities(opts: {
  search?: string; jurisdiction?: string; entity_type?: string;
  page?: number; pageSize?: number;
}): Promise<{ items: OffshoreEntity[]; total: number }> {
  const { search, jurisdiction, entity_type, page = 0, pageSize = 50 } = opts;
  let q = supabase.from("offshore_entities")
    .select("id,name,jurisdiction,linked_to,source_file,status,icij_id,entity_type",
            { count: "exact" })
    .order("name", { ascending: true, nullsFirst: false });
  if (search) q = q.ilike("name", `%${search.replace(/[%]/g, " ")}%`);
  if (jurisdiction) q = q.eq("jurisdiction", jurisdiction);
  if (entity_type) q = q.eq("entity_type", entity_type);
  q = q.range(page * pageSize, page * pageSize + pageSize - 1);
  const { data, count } = await q;
  return { items: (data ?? []) as OffshoreEntity[], total: count ?? 0 };
}

export async function listOlafCases(opts: {
  fraud_type?: string; page?: number; pageSize?: number;
}): Promise<{ items: OlafCase[]; total: number }> {
  const { fraud_type, page = 0, pageSize = 30 } = opts;
  let q = supabase.from("olaf_cases")
    .select("id,title,date,fraud_type,amount_eur,country,source_url",
            { count: "exact" })
    .order("date", { ascending: false, nullsFirst: false });
  if (fraud_type) q = q.eq("fraud_type", fraud_type);
  q = q.range(page * pageSize, page * pageSize + pageSize - 1);
  const { data, count } = await q;
  return { items: (data ?? []) as OlafCase[], total: count ?? 0 };
}

export async function listInvestigativeArticles(opts: {
  search?: string; tag?: string; page?: number; pageSize?: number;
}): Promise<{ items: InvestigativeArticle[]; total: number }> {
  const { search, tag, page = 0, pageSize = 30 } = opts;
  let q = supabase.from("investigative_articles")
    .select("id,title,date,source,author,summary,url,tags", { count: "exact" })
    .order("date", { ascending: false, nullsFirst: false });
  if (search) q = q.ilike("title", `%${search.replace(/[%]/g, " ")}%`);
  if (tag) q = q.contains("tags", [tag]);
  q = q.range(page * pageSize, page * pageSize + pageSize - 1);
  const { data, count } = await q;
  return { items: (data ?? []) as InvestigativeArticle[], total: count ?? 0 };
}

export async function listProsecutionCases(opts: {
  page?: number; pageSize?: number;
}): Promise<{ items: ProsecutionCase[]; total: number }> {
  const { page = 0, pageSize = 30 } = opts;
  const q = supabase.from("prosecution_cases")
    .select("id,title,date,charges,amount_bgn,source_url", { count: "exact" })
    .order("date", { ascending: false, nullsFirst: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  const { data, count } = await q;
  return { items: (data ?? []) as ProsecutionCase[], total: count ?? 0 };
}

export async function getDistinctSanctioningBodies(): Promise<string[]> {
  const { data } = await supabase.from("sanctioned_entities")
    .select("sanctioning_body").limit(1000);
  const seen = new Set<string>();
  for (const r of (data ?? []) as { sanctioning_body: string | null }[]) {
    if (r.sanctioning_body) seen.add(r.sanctioning_body);
  }
  return [...seen].sort();
}

// ============================================================
// Audit / Национален правен одит
// ============================================================

export type AuditFinding = {
  id: string;
  domain: string;
  domain_order: number;
  title: string;
  severity: "КРИТИЧНО" | "СЕРИОЗНО" | "УМЕРЕНО";
  description: string;
  affected_laws: string[];
  affected_articles: string[];
  court_decisions_proof: string[];
  proposed_fix: string | null;
  why_not_fixable: string | null;
  who_must_act: string[];
  authority_level: string | null;
  reform_steps: string[];
  reform_timeline: string | null;
  vote_count: number;
  generated_at: string;
};

export async function getAuditFindings(
  domain?: string, severity?: string,
): Promise<AuditFinding[]> {
  let q = supabase.from("audit_findings").select("*")
    .order("domain_order", { ascending: true });
  if (domain) q = q.eq("domain", domain);
  if (severity) q = q.eq("severity", severity);
  const { data } = await q;
  return (data ?? []) as AuditFinding[];
}

export async function getAuditFindingById(id: string): Promise<AuditFinding | null> {
  const { data } = await supabase.from("audit_findings").select("*").eq("id", id).single();
  return (data as AuditFinding) ?? null;
}

export async function getAuditStats(): Promise<{
  КРИТИЧНО: number; СЕРИОЗНО: number; УМЕРЕНО: number;
  total: number; domains: number;
}> {
  const { data } = await supabase.from("audit_findings").select("severity,domain");
  const stats = { КРИТИЧНО: 0, СЕРИОЗНО: 0, УМЕРЕНО: 0, total: 0, domains: 0 };
  const ds = new Set<string>();
  for (const r of (data ?? []) as { severity: string; domain: string }[]) {
    if (r.severity in stats) (stats as Record<string, number>)[r.severity]++;
    stats.total++;
    ds.add(r.domain);
  }
  stats.domains = ds.size;
  return stats;
}

// ============================================================
// Държавен вестник (State Gazette) queries — Phase 8
// ============================================================

export type DvIssueRow = {
  id: string;
  issue_number: number;
  year: number;
  issue_supplement: number;
  date: string | null;
  title: string | null;
  source_url: string | null;
  act_count: number; // joined count from dv_acts
  top_act_types: string[]; // top-3 act types by frequency in this issue
};

export type DvActRow = {
  id: string;
  issue_id: string;
  issue_number: number;
  year: number;
  act_number: string | null;
  title: string;
  act_type: string | null;
  full_text: string | null;
  source_url: string | null;
  razdel: number | null;
  summary_ai: string | null;
  summary_ai_generated_at: string | null;
};

/**
 * List dv_issues with pagination + per-issue act count + top-3 act types.
 * Used by /dv listing page.
 *
 * Returns { items: [], total: 0 } on error so the page still renders
 * (D-04 fallback contract — query helpers never throw).
 */
export async function listDvIssues(opts: {
  page: number;
  pageSize: number;
  year?: number;
  from_date?: string;
  to_date?: string;
  from_issue?: number;
  to_issue?: number;
}): Promise<{ items: DvIssueRow[]; total: number }> {
  const offset = opts.page * opts.pageSize;
  let q = supabase
    .from("dv_issues")
    .select(
      "id, issue_number, year, issue_supplement, date, title, source_url",
      { count: "exact" },
    )
    .order("year", { ascending: false })
    .order("issue_number", { ascending: false })
    .range(offset, offset + opts.pageSize - 1);

  if (opts.year !== undefined) q = q.eq("year", opts.year);
  if (opts.from_date) q = q.gte("date", opts.from_date);
  if (opts.to_date) q = q.lte("date", opts.to_date);
  if (opts.from_issue !== undefined) q = q.gte("issue_number", opts.from_issue);
  if (opts.to_issue !== undefined) q = q.lte("issue_number", opts.to_issue);

  const { data, error, count } = await q;
  if (error) {
    console.error("[listDvIssues] error", error);
    return { items: [], total: 0 };
  }

  const issueIds = (data ?? []).map((i) => i.id);
  if (issueIds.length === 0) return { items: [], total: count ?? 0 };

  // Fetch acts for these issues to compute act_count + top-3 act types.
  const { data: acts } = await supabase
    .from("dv_acts")
    .select("issue_id, act_type")
    .in("issue_id", issueIds);

  const actsByIssue = new Map<string, string[]>();
  for (const a of (acts ?? []) as { issue_id: string; act_type: string | null }[]) {
    const arr = actsByIssue.get(a.issue_id) ?? [];
    if (a.act_type) arr.push(a.act_type);
    actsByIssue.set(a.issue_id, arr);
  }

  const items: DvIssueRow[] = (data ?? []).map((i) => {
    const types = actsByIssue.get(i.id) ?? [];
    const freq = new Map<string, number>();
    for (const t of types) freq.set(t, (freq.get(t) ?? 0) + 1);
    const topTypes = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map((e) => e[0]);
    return {
      id: i.id,
      issue_number: i.issue_number,
      year: i.year,
      issue_supplement: i.issue_supplement,
      date: i.date,
      title: i.title,
      source_url: i.source_url,
      act_count: types.length,
      top_act_types: topTypes,
    };
  });

  return { items, total: count ?? 0 };
}

/**
 * Get a single dv_issue by (year, issue_number) — used by /dv/[slug] page.
 * Returns null on miss or error so the page can call notFound().
 */
export async function getDvIssue(
  year: number,
  issue_number: number,
): Promise<DvIssueRow | null> {
  const { data, error } = await supabase
    .from("dv_issues")
    .select(
      "id, issue_number, year, issue_supplement, date, title, source_url",
    )
    .eq("year", year)
    .eq("issue_number", issue_number)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const { data: acts } = await supabase
    .from("dv_acts")
    .select("act_type")
    .eq("issue_id", data.id);

  const types = ((acts ?? []) as { act_type: string | null }[])
    .map((a) => a.act_type)
    .filter((t): t is string => !!t);
  const freq = new Map<string, number>();
  for (const t of types) freq.set(t, (freq.get(t) ?? 0) + 1);
  const topTypes = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map((e) => e[0]);

  return {
    ...data,
    act_count: types.length,
    top_act_types: topTypes,
  };
}

/**
 * List all acts in a given dv_issue, optionally filtered by act_type or
 * local search (in-issue ILIKE per CONTEXT D-12).
 *
 * Returns [] on error (D-04 fallback).
 */
export async function listDvActs(opts: {
  issue_id: string;
  search?: string;
  act_type?: string;
}): Promise<DvActRow[]> {
  let q = supabase
    .from("dv_acts")
    .select(
      "id, issue_id, issue_number, year, act_number, title, act_type, full_text, source_url, razdel, summary_ai, summary_ai_generated_at",
    )
    .eq("issue_id", opts.issue_id)
    .order("razdel", { ascending: true })
    .order("title", { ascending: true });

  if (opts.act_type) q = q.eq("act_type", opts.act_type);
  if (opts.search && opts.search.trim().length >= 2) {
    q = q.ilike("title", `%${opts.search.trim()}%`);
  }

  const { data, error } = await q;
  if (error) {
    console.error("[listDvActs] error", error);
    return [];
  }
  return (data ?? []) as DvActRow[];
}
