import Anthropic from "@anthropic-ai/sdk";
import { supabase, type Law, type LawArticle } from "./supabase";
import { getLawBySlug, getLawArticles, searchArticles } from "./queries";

export const CONSTITUTION_SLUG = "konstitutsiya-na-republika-balgariya";

export type AnalysisLaw = {
  slug: string;
  name_bg: string;
  category: string;
  articles: LawArticle[];
};

export type Concepts = {
  terms: string[];
  obligations: string[];
  rights: string[];
  entities: string[];
  key_articles: string[];
};

export type Pass2Stats = {
  searched_terms: number;
  raw_hits: number;
  unique_articles: number;
  laws_touched: number;
};

export type SearchProgress = {
  searched_terms: number;
  queries_done: number;
  articles_found: number;
  laws_loaded: number;
  laws_total_to_load: number;
};

export async function loadFullLaw(slug: string): Promise<AnalysisLaw | null> {
  const law = await getLawBySlug(slug);
  if (!law) return null;
  const articles = await getLawArticles(slug);
  if (articles.length === 0) return null;
  return {
    slug: law.slug,
    name_bg: law.name_bg,
    category: law.category,
    articles,
  };
}

export function formatLawForPrompt(law: AnalysisLaw): string {
  return law.articles
    .map((a) => `Чл.${a.article_number}: ${a.text_content}`)
    .join("\n\n");
}

export function estimateTokens(text: string): number {
  return Math.round(text.length / 2.2);
}

function articleTokenCost(a: LawArticle): number {
  return estimateTokens(`Чл.${a.article_number}: ${a.text_content}\n\n`);
}

// =====================================================================
// PASS 1 — Extract key concepts from the target law
// =====================================================================

const PASS1_SYSTEM = `Ти си правен анализатор. Извличаш ключови концепции от закон, за да могат да се търсят свързани разпоредби в други закони.

Върни ЕДИН JSON обект, нищо друго. Без markdown, без коментари, без обяснения.

Схема:
{
  "terms": ["..."],
  "obligations": ["..."],
  "rights": ["..."],
  "entities": ["..."],
  "key_articles": ["..."]
}

- "terms": 8-15 ключови правни термина или фрази (например "трудов договор", "обществена поръчка"). Кратки, конкретни, търсими.
- "obligations": 4-8 фрази описващи задължения, които законът налага.
- "rights": 4-8 фрази описващи права, които законът дава.
- "entities": 4-10 институции, длъжности или субекти, които законът регулира (например "работодател", "Министерски съвет").
- "key_articles": 5-10 номера на най-важните членове в закона (като strings).

Целта е тези термини да служат за full-text search в база от 1240 български закона. Избирай дискриминативни, не общи думи.`;

export async function extractConcepts(target: AnalysisLaw): Promise<Concepts> {
  const client = new Anthropic();
  const userMessage = `ЗАКОН: ${target.name_bg}\n\n${formatLawForPrompt(target)}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: PASS1_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const text = textBlock && textBlock.type === "text" ? textBlock.text : "";

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: Partial<Concepts> = {};
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const titles = new Set<string>();
    for (const a of target.articles.slice(0, 30)) {
      if (a.chapter_title) titles.add(a.chapter_title);
      if (a.section_title) titles.add(a.section_title);
    }
    parsed = {
      terms: [...titles].slice(0, 12),
      obligations: [],
      rights: [],
      entities: [],
      key_articles: target.articles.slice(0, 5).map((a) => a.article_number),
    };
  }

  const norm = (v: unknown): string[] =>
    Array.isArray(v)
      ? v
          .map((x) => String(x).trim())
          .filter((x) => x.length > 1 && x.length < 200)
      : [];

  return {
    terms: norm(parsed.terms),
    obligations: norm(parsed.obligations),
    rights: norm(parsed.rights),
    entities: norm(parsed.entities),
    key_articles: norm(parsed.key_articles),
  };
}

// =====================================================================
// PASS 2 — Search the entire corpus for related articles
// =====================================================================

type RankedRef = {
  law_slug: string;
  article_number: string;
  rank: number;
  law_name_bg: string;
  category: string;
};

export async function searchRelevantLaws(
  concepts: Concepts,
  excludeSlugs: Set<string>,
  opts: {
    perTermLimit?: number;
    maxLawsTotal?: number;
    maxArticlesPerLaw?: number;
    availableTokenBudget?: number;
    onProgress?: (p: SearchProgress) => void;
  } = {},
): Promise<{ laws: AnalysisLaw[]; stats: Pass2Stats }> {
  const perTermLimit = opts.perTermLimit ?? 8;
  const maxLawsTotal = opts.maxLawsTotal ?? 30;
  const maxArticlesPerLaw = opts.maxArticlesPerLaw ?? 25;
  const availableTokenBudget = opts.availableTokenBudget ?? 80_000;
  const onProgress = opts.onProgress;

  const queries = uniqueStrings([
    ...concepts.terms,
    ...concepts.entities,
    ...concepts.obligations.slice(0, 4),
    ...concepts.rights.slice(0, 4),
  ]).slice(0, 18);

  const progress: SearchProgress = {
    searched_terms: queries.length,
    queries_done: 0,
    articles_found: 0,
    laws_loaded: 0,
    laws_total_to_load: 0,
  };

  // Pass 2a: parallel FTS, with progress emission per resolved query.
  const allHits = await Promise.all(
    queries.map(async (q) => {
      const hits = await searchArticles(q, perTermLimit).catch(
        () => [] as Awaited<ReturnType<typeof searchArticles>>,
      );
      progress.queries_done++;
      progress.articles_found += hits.length;
      onProgress?.({ ...progress });
      return hits;
    }),
  );

  // Dedup by (law_slug, article_number), keep best rank.
  const seen = new Map<string, RankedRef>();
  let rawCount = 0;
  for (const hits of allHits) {
    for (const h of hits) {
      rawCount++;
      if (excludeSlugs.has(h.law_slug)) continue;
      const key = `${h.law_slug}::${h.article_number}`;
      const prior = seen.get(key);
      if (!prior || h.rank > prior.rank) {
        seen.set(key, {
          law_slug: h.law_slug,
          article_number: h.article_number,
          rank: h.rank,
          law_name_bg: h.law_name_bg,
          category: h.category,
        });
      }
    }
  }

  const ranked = [...seen.values()].sort((a, b) => b.rank - a.rank);

  // Apply law-count + per-law caps so a single chatty law can't monopolize.
  const perLawCount = new Map<string, number>();
  const lawsAccepted = new Set<string>();
  const acceptedRefs: RankedRef[] = [];
  for (const r of ranked) {
    if (!lawsAccepted.has(r.law_slug)) {
      if (lawsAccepted.size >= maxLawsTotal) continue;
      lawsAccepted.add(r.law_slug);
    }
    const cnt = perLawCount.get(r.law_slug) ?? 0;
    if (cnt >= maxArticlesPerLaw) continue;
    perLawCount.set(r.law_slug, cnt + 1);
    acceptedRefs.push(r);
  }

  // Group accepted refs by law_slug.
  const byLaw = new Map<string, RankedRef[]>();
  for (const r of acceptedRefs) {
    const arr = byLaw.get(r.law_slug) ?? [];
    arr.push(r);
    byLaw.set(r.law_slug, arr);
  }

  progress.laws_total_to_load = byLaw.size;
  onProgress?.({ ...progress });

  // Pass 2b: parallel article-body fetches.
  const lawsLoaded: { law: AnalysisLaw; ranks: Map<string, number> }[] = (
    await Promise.all(
      [...byLaw.entries()].map(async ([slug, refs]) => {
        const articleNumbers = refs.map((r) => r.article_number);
        const { data, error } = await supabase
          .from("law_articles")
          .select(
            "law_slug, ordinal, chapter_title, section_title, article_number, text_content",
          )
          .eq("law_slug", slug)
          .in("article_number", articleNumbers)
          .order("ordinal", { ascending: true });
        if (error) {
          console.warn(
            `[analyze] failed to load articles for ${slug}: ${error.message}`,
          );
          progress.laws_loaded++;
          onProgress?.({ ...progress });
          return null;
        }
        const articles = (data ?? []) as LawArticle[];
        progress.laws_loaded++;
        onProgress?.({ ...progress });
        if (articles.length === 0) return null;
        const ranks = new Map<string, number>();
        for (const r of refs) ranks.set(r.article_number, r.rank);
        return {
          law: {
            slug,
            name_bg: refs[0].law_name_bg,
            category: refs[0].category,
            articles,
          },
          ranks,
        };
      }),
    )
  ).filter((x): x is { law: AnalysisLaw; ranks: Map<string, number> } => x !== null);

  // Token-budget walk: flatten + sort by rank, accept until budget exhausted.
  type FlatItem = {
    lawSlug: string;
    article: LawArticle;
    rank: number;
  };
  const flat: FlatItem[] = [];
  for (const { law, ranks } of lawsLoaded) {
    for (const a of law.articles) {
      flat.push({
        lawSlug: law.slug,
        article: a,
        rank: ranks.get(a.article_number) ?? 0,
      });
    }
  }
  flat.sort((a, b) => b.rank - a.rank);

  const acceptedByLaw = new Map<string, LawArticle[]>();
  let usedTokens = 0;
  let acceptedCount = 0;
  for (const item of flat) {
    const cost = articleTokenCost(item.article);
    if (usedTokens + cost > availableTokenBudget) break;
    usedTokens += cost;
    acceptedCount++;
    const arr = acceptedByLaw.get(item.lawSlug) ?? [];
    arr.push(item.article);
    acceptedByLaw.set(item.lawSlug, arr);
  }

  // Re-sort accepted articles within each law by ordinal for readability.
  const finalLaws: AnalysisLaw[] = lawsLoaded
    .map(({ law }) => {
      const accepted = acceptedByLaw.get(law.slug);
      if (!accepted || accepted.length === 0) return null;
      const sorted = [...accepted].sort((a, b) => a.ordinal - b.ordinal);
      return {
        slug: law.slug,
        name_bg: law.name_bg,
        category: law.category,
        articles: sorted,
      };
    })
    .filter((l): l is AnalysisLaw => l !== null);

  return {
    laws: finalLaws,
    stats: {
      searched_terms: queries.length,
      raw_hits: rawCount,
      unique_articles: acceptedCount,
      laws_touched: finalLaws.length,
    },
  };
}

function uniqueStrings(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const key = s.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
