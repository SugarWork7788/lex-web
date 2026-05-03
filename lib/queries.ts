import { supabase, type Law, type LawArticle, type CrossReference } from "./supabase";

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
