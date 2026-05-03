import { supabase, type Law, type LawArticle } from "./supabase";
import { getLawBySlug, getLawArticles } from "./queries";

export const CONSTITUTION_SLUG = "konstitutsiya-na-republika-balgariya";

export type AnalysisLaw = {
  slug: string;
  name_bg: string;
  category: string;
  articles: LawArticle[];
};

export type AnalysisCorpus = {
  target: AnalysisLaw;
  constitution: AnalysisLaw | null;
  referenced: AnalysisLaw[];
  lawsMap: Record<string, string>;
};

export type AnalysisPills = {
  target: { slug: string; name_bg: string };
  constitution: { slug: string; name_bg: string } | null;
  referenced: { slug: string; name_bg: string; category: string }[];
  lawsMap: Record<string, string>;
};

export async function getMostReferencedSlugs(
  fromSlug: string,
  limit = 10,
): Promise<string[]> {
  const PAGE = 1000;
  const counts = new Map<string, number>();
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .from("cross_references")
      .select("to_slug")
      .eq("from_slug", fromSlug)
      .eq("matched", true)
      .not("to_slug", "is", null)
      .range(start, start + PAGE - 1);
    if (error) throw new Error(`getMostReferencedSlugs: ${error.message}`);
    const chunk = data ?? [];
    for (const row of chunk) {
      const slug = row.to_slug as string | null;
      if (!slug) continue;
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    if (chunk.length < PAGE) break;
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([slug]) => slug);
}

export async function getReferencedLawCount(fromSlug: string): Promise<number> {
  const slugs = await getMostReferencedSlugs(fromSlug, 1000);
  return slugs.length;
}

async function loadLaw(slug: string): Promise<{ law: Law; articles: LawArticle[] } | null> {
  const law = await getLawBySlug(slug);
  if (!law) return null;
  const articles = await getLawArticles(slug);
  if (articles.length === 0) return null;
  return { law, articles };
}

/**
 * Light-weight pre-fetch for the page header pills.
 * Resolves target + constitution + top referenced laws by name only.
 * Does NOT load article bodies — keep the page fast.
 */
export async function buildPills(targetSlug: string): Promise<AnalysisPills | null> {
  const target = await getLawBySlug(targetSlug);
  if (!target) return null;

  const candidateRefSlugs = await getMostReferencedSlugs(targetSlug, 10);
  const wantConstitution = targetSlug !== CONSTITUTION_SLUG;
  const allWantedSlugs = new Set(candidateRefSlugs);
  if (wantConstitution) allWantedSlugs.add(CONSTITUTION_SLUG);

  const slugList = [...allWantedSlugs];
  const lawRows: (Law | null)[] = await Promise.all(
    slugList.map((s) => getLawBySlug(s)),
  );

  const lawsBySlug = new Map<string, Law>();
  slugList.forEach((s, i) => {
    const row = lawRows[i];
    if (row) lawsBySlug.set(s, row);
  });

  const lawsMap: Record<string, string> = { [target.slug]: target.name_bg };
  for (const law of lawsBySlug.values()) lawsMap[law.slug] = law.name_bg;

  const constitutionLaw = wantConstitution
    ? lawsBySlug.get(CONSTITUTION_SLUG) ?? null
    : null;

  const referenced = candidateRefSlugs
    .filter((s) => s !== CONSTITUTION_SLUG)
    .map((s) => lawsBySlug.get(s))
    .filter((l): l is Law => Boolean(l))
    .map((l) => ({ slug: l.slug, name_bg: l.name_bg, category: l.category }));

  return {
    target: { slug: target.slug, name_bg: target.name_bg },
    constitution: constitutionLaw
      ? { slug: constitutionLaw.slug, name_bg: constitutionLaw.name_bg }
      : null,
    referenced,
    lawsMap,
  };
}

/**
 * Heavy load for the LLM: target + constitution + top referenced laws WITH article bodies.
 * Skips any referenced law that has no articles.
 * Caps article count per referenced law (target + constitution always full).
 */
export async function loadAnalysisCorpus(
  targetSlug: string,
  articleLimitPerReferenced = 200,
): Promise<AnalysisCorpus | null> {
  const targetLoaded = await loadLaw(targetSlug);
  if (!targetLoaded) return null;

  const candidateRefSlugs = await getMostReferencedSlugs(targetSlug, 10);
  const wantConstitution = targetSlug !== CONSTITUTION_SLUG;

  const refSlugsToLoad = candidateRefSlugs.filter(
    (s) => s !== CONSTITUTION_SLUG,
  );
  const constitutionPromise: Promise<{ law: Law; articles: LawArticle[] } | null> =
    wantConstitution ? loadLaw(CONSTITUTION_SLUG) : Promise.resolve(null);

  const [refLoaded, constitutionLoaded] = await Promise.all([
    Promise.all(refSlugsToLoad.map((s) => loadLaw(s))),
    constitutionPromise,
  ]);

  const target: AnalysisLaw = {
    slug: targetLoaded.law.slug,
    name_bg: targetLoaded.law.name_bg,
    category: targetLoaded.law.category,
    articles: targetLoaded.articles,
  };

  const constitution: AnalysisLaw | null = constitutionLoaded
    ? {
        slug: constitutionLoaded.law.slug,
        name_bg: constitutionLoaded.law.name_bg,
        category: constitutionLoaded.law.category,
        articles: constitutionLoaded.articles,
      }
    : null;

  const referenced: AnalysisLaw[] = refLoaded
    .filter((r): r is { law: Law; articles: LawArticle[] } => Boolean(r))
    .map((r) => ({
      slug: r.law.slug,
      name_bg: r.law.name_bg,
      category: r.law.category,
      articles: r.articles.slice(0, articleLimitPerReferenced),
    }));

  const lawsMap: Record<string, string> = { [target.slug]: target.name_bg };
  if (constitution) lawsMap[constitution.slug] = constitution.name_bg;
  for (const r of referenced) lawsMap[r.slug] = r.name_bg;

  return { target, constitution, referenced, lawsMap };
}

export function formatLawForPrompt(law: AnalysisLaw): string {
  const articleLines = law.articles
    .map((a) => `Чл.${a.article_number}: ${a.text_content}`)
    .join("\n\n");
  return articleLines;
}

export function estimatePromptChars(corpus: AnalysisCorpus): number {
  let chars = corpus.target.name_bg.length;
  chars += corpus.target.articles.reduce(
    (sum, a) => sum + a.article_number.length + a.text_content.length + 10,
    0,
  );
  if (corpus.constitution) {
    chars += corpus.constitution.articles.reduce(
      (sum, a) => sum + a.article_number.length + a.text_content.length + 10,
      0,
    );
  }
  for (const r of corpus.referenced) {
    chars += r.name_bg.length + r.category.length + 20;
    chars += r.articles.reduce(
      (sum, a) => sum + a.article_number.length + a.text_content.length + 10,
      0,
    );
  }
  return chars;
}
