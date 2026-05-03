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

  // Strip any accidental markdown fencing.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: Partial<Concepts> = {};
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Fallback: derive crude terms from chapter titles + first articles.
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

type ArticleRef = { law_slug: string; article_number: string };
type RankedRef = ArticleRef & { rank: number; law_name_bg: string; category: string };

export async function searchRelevantLaws(
  concepts: Concepts,
  excludeSlugs: Set<string>,
  opts: {
    perTermLimit?: number;
    maxArticlesTotal?: number;
    maxLawsTotal?: number;
  } = {},
): Promise<{ laws: AnalysisLaw[]; stats: Pass2Stats }> {
  const perTermLimit = opts.perTermLimit ?? 8;
  const maxArticlesTotal = opts.maxArticlesTotal ?? 150;
  const maxLawsTotal = opts.maxLawsTotal ?? 30;

  // Choose search terms: prioritize terms + entities (most discriminative).
  const queries = uniqueStrings([
    ...concepts.terms,
    ...concepts.entities,
    ...concepts.obligations.slice(0, 4),
    ...concepts.rights.slice(0, 4),
  ]).slice(0, 18);

  // Run FTS in parallel.
  const allHits = await Promise.all(
    queries.map((q) =>
      searchArticles(q, perTermLimit).catch(() => [] as Awaited<ReturnType<typeof searchArticles>>),
    ),
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

  // Sort all unique articles by rank desc, take top N overall.
  const ranked = [...seen.values()].sort((a, b) => b.rank - a.rank);

  // Apply caps: maxArticlesTotal globally, maxLawsTotal distinct laws.
  const lawsAccepted = new Set<string>();
  const acceptedRefs: RankedRef[] = [];
  for (const r of ranked) {
    if (acceptedRefs.length >= maxArticlesTotal) break;
    if (!lawsAccepted.has(r.law_slug)) {
      if (lawsAccepted.size >= maxLawsTotal) continue;
      lawsAccepted.add(r.law_slug);
    }
    acceptedRefs.push(r);
  }

  // Group by law_slug, fetch the matched articles in one batch per law.
  const byLaw = new Map<string, RankedRef[]>();
  for (const r of acceptedRefs) {
    const arr = byLaw.get(r.law_slug) ?? [];
    arr.push(r);
    byLaw.set(r.law_slug, arr);
  }

  const laws: AnalysisLaw[] = await Promise.all(
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
        console.warn(`[analyze] failed to load articles for ${slug}: ${error.message}`);
        return null;
      }
      const articles = (data ?? []) as LawArticle[];
      if (articles.length === 0) return null;
      return {
        slug,
        name_bg: refs[0].law_name_bg,
        category: refs[0].category,
        articles,
      };
    }),
  ).then((arr) => arr.filter((l): l is AnalysisLaw => l !== null));

  return {
    laws,
    stats: {
      searched_terms: queries.length,
      raw_hits: rawCount,
      unique_articles: acceptedRefs.length,
      laws_touched: laws.length,
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
