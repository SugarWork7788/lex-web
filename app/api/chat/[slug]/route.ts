import Anthropic from "@anthropic-ai/sdk";
import { getLawBySlug, searchArticles, searchDecisions, type CourtDecision } from "@/lib/queries";
import { supabase, type LawArticle, type Severity } from "@/lib/supabase";
import { rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

const SYSTEM_PROMPT = `Ти си правен анализатор на цялото българско законодателство и съдебна практика.
Разполагаш с релевантни членове от 1240 закона и известни правни конфликти от база данни.

За всеки въпрос отговаряй в следната структура (markdown с ## заглавия):

## Кратък отговор
[1-2 изречения директен отговор]

## Правна основа
[Кои членове от кои закони уреждат въпроса. Цитирай във формат: Чл.5 от [Име на закона]]

## Плюсове и минуси / Рискове
[Конкретни предимства, недостатъци, правни рискове свързани с въпроса. Използвай списъци (- ).]

## Важни бележки и съвети
[Практически съвети, изключения, специални случаи, срокове]

## Потенциални конфликти
[Ако в базата данни има известни проблеми или конфликти свързани с този въпрос — посочи ги конкретно. Ако няма — напиши "Не са известни конфликти по този въпрос."]

## Препоръка
[Ясна препоръка какво да направи потребителят]

ВАЖНИ ИЗИСКВАНИЯ:
- Пиши на ясен, разбираем български. Без правен жаргон където е възможно.
- Когато цитираш членове, използвай формат: Чл.5 от [Име на закона]
- Използвай "- " за списъци (точки) и "**текст**" за удебеляване
- Не измисляй членове, които не са в подадения контекст
- Резултатите са ориентировъчни и не заместват адвокат — спомени това в препоръката`;

const STOP_WORDS = new Set([
  "и", "в", "на", "от", "за", "с", "по", "при", "че", "не", "ли", "се",
  "са", "е", "ще", "да", "то", "този", "тази", "това", "тези", "ги", "го",
  "му", "ми", "си", "ти", "вие", "ние", "аз", "той", "тя", "ние", "вас",
  "като", "така", "пак", "още", "вече", "когато", "защо", "как", "какво",
  "кой", "коя", "кое", "кои", "къде", "някога", "винаги", "никога",
  "може", "трябва", "има", "няма", "беше", "бъде", "бил", "била", "бяха",
  "или", "ако", "обаче", "но", "а", "но", "до", "след", "преди", "над", "под",
  "между", "през", "около", "против", "освен", "съгласно", "относно", "извън",
  "съм", "си", "сме", "сте", "са", "бил", "бяла", "били", "били",
  "този", "тази", "това", "тези", "тук", "там", "тогава", "сега",
]);

function extractKeyTerms(question: string): string[] {
  const words = question
    .toLowerCase()
    .replace(/[^\p{L}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
  // Score by length (longer ≈ more discriminative).
  const unique = [...new Set(words)].sort((a, b) => b.length - a.length);
  return unique.slice(0, 3);
}

type RankedHit = {
  law_slug: string;
  article_number: string;
  rank: number;
  law_name_bg: string;
  category: string;
};

async function loadArticlesForHits(
  hits: RankedHit[],
): Promise<{ slug: string; name_bg: string; articles: LawArticle[] }[]> {
  if (hits.length === 0) return [];
  const byLaw = new Map<string, RankedHit[]>();
  for (const h of hits) {
    const arr = byLaw.get(h.law_slug) ?? [];
    arr.push(h);
    byLaw.set(h.law_slug, arr);
  }
  const fetched = await Promise.all(
    [...byLaw.entries()].map(async ([slug, refs]) => {
      const numbers = refs.map((r) => r.article_number);
      const { data, error } = await supabase
        .from("law_articles")
        .select(
          "law_slug, ordinal, chapter_title, section_title, article_number, text_content",
        )
        .eq("law_slug", slug)
        .in("article_number", numbers)
        .order("ordinal", { ascending: true });
      if (error || !data || data.length === 0) return null;
      return {
        slug,
        name_bg: refs[0].law_name_bg,
        articles: data as LawArticle[],
      };
    }),
  );
  return fetched.filter(
    (x): x is { slug: string; name_bg: string; articles: LawArticle[] } =>
      x !== null,
  );
}

const SEV_RANK: Record<Severity, number> = { висок: 0, среден: 1, нисък: 2 };

type RelatedIssue = {
  type: string;
  severity: Severity;
  explanation: string;
  primary_law_slug: string;
  primary_articles: string[];
  conflicting_law_slug: string | null;
  conflicting_articles: string[];
};

async function fetchRelatedIssues(
  slug: string,
  limit: number,
): Promise<RelatedIssue[]> {
  const { data, error } = await supabase
    .from("law_issues")
    .select(
      "type, severity, explanation, primary_law_slug, primary_articles, conflicting_law_slug, conflicting_articles",
    )
    .or(`law_slug.eq.${slug},conflicting_law_slug.eq.${slug}`)
    .limit(50);
  if (error || !data) return [];
  const rows = (data as RelatedIssue[]).filter((r) =>
    r.severity === "висок" || r.severity === "среден" || r.severity === "нисък",
  );
  rows.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  return rows.slice(0, limit);
}

function dedupHits(
  arrays: Array<Array<{
    law_slug: string;
    article_number: string;
    rank: number;
    law_name_bg: string;
    category: string;
  }>>,
  excludeSlug?: string,
): RankedHit[] {
  const seen = new Map<string, RankedHit>();
  for (const arr of arrays) {
    for (const h of arr) {
      if (excludeSlug && h.law_slug === excludeSlug) continue;
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
  return [...seen.values()].sort((a, b) => b.rank - a.rank);
}

function buildUserPrompt(args: {
  lawName: string;
  question: string;
  currentLawArticles: LawArticle[];
  corpusGroups: { slug: string; name_bg: string; articles: LawArticle[] }[];
  issues: RelatedIssue[];
  courtDecisions: CourtDecision[];
}): string {
  const fmtArticles = (arts: LawArticle[]) =>
    arts.map((a) => `Чл.${a.article_number}: ${a.text_content}`).join("\n\n");

  const parts: string[] = [];

  parts.push(`КОНТЕКСТ ОТ БАЗАТА ДАННИ:`);
  parts.push(`Текущ закон: ${args.lawName}`);
  if (args.currentLawArticles.length > 0) {
    parts.push("");
    parts.push(`Релевантни членове от текущия закон:`);
    parts.push(fmtArticles(args.currentLawArticles));
  } else {
    parts.push("(Няма пряко съвпадение с членове от текущия закон.)");
  }

  if (args.corpusGroups.length > 0) {
    parts.push("");
    parts.push(`СВЪРЗАНИ РАЗПОРЕДБИ ОТ ДРУГИ ЗАКОНИ:`);
    for (const g of args.corpusGroups) {
      parts.push("");
      parts.push(`--- ${g.name_bg} ---`);
      parts.push(fmtArticles(g.articles));
    }
  }

  if (args.issues.length > 0) {
    parts.push("");
    parts.push(`ИЗВЕСТНИ ПРАВНИ ПРОБЛЕМИ И КОНФЛИКТИ (от база данни):`);
    for (const it of args.issues) {
      const articles =
        it.primary_articles.length > 0 ? `Чл. ${it.primary_articles.join(", ")}` : "";
      const conflictRef =
        it.conflicting_law_slug && it.conflicting_articles.length > 0
          ? ` ↔ Чл. ${it.conflicting_articles.join(", ")} от ${it.conflicting_law_slug}`
          : "";
      parts.push("");
      parts.push(
        `[${it.severity.toUpperCase()}] ${it.type}${articles ? ` (${articles}${conflictRef})` : ""}`,
      );
      parts.push(it.explanation);
    }
  } else {
    parts.push("");
    parts.push(`ИЗВЕСТНИ ПРАВНИ ПРОБЛЕМИ: (няма записани в базата данни)`);
  }

  if (args.courtDecisions.length > 0) {
    parts.push("");
    parts.push(`СВЪРЗАНА СЪДЕБНА ПРАКТИКА:`);
    for (const d of args.courtDecisions) {
      const date = (d.decision_date ?? "").slice(0, 10);
      const title = d.title || d.decision_number || d.case_number || d.id;
      parts.push(`- [${d.court} | ${date}] ${title}`);
    }
  }

  parts.push("");
  parts.push(`ВЪПРОС: ${args.question}`);

  return parts.join("\n");
}

type RequestBody = {
  question?: string;
  history?: Array<{ q?: string; a?: string }>;
};

const MAX_HISTORY_PAIRS = 5;
const MAX_CORPUS_ARTICLES = 40;
const MAX_CURRENT_LAW_ARTICLES = 15;
const MAX_ISSUES = 10;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const limit = rateLimited(req, "chat", { windowMs: 60_000, max: 10 });
  if (limit) return limit;

  const { slug } = await ctx.params;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  const question = (body.question ?? "").trim();
  if (!question) return new Response("Празен въпрос", { status: 400 });

  const law = await getLawBySlug(slug);
  if (!law) return new Response("Не е намерен закон", { status: 404 });

  // STEP 1 — parallel research.
  const keyTerms = extractKeyTerms(question);
  const corpusQueries = [question, ...keyTerms];

  const [corpusHitArrays, currentLawHits, storedIssues, courtDecisions] = await Promise.all([
    Promise.all(
      corpusQueries.map((q) =>
        searchArticles(q, 20).catch(
          () => [] as Awaited<ReturnType<typeof searchArticles>>,
        ),
      ),
    ),
    searchArticles(question, 30)
      .then((hits) => hits.filter((h) => h.law_slug === slug))
      .catch(() => [] as Awaited<ReturnType<typeof searchArticles>>),
    fetchRelatedIssues(slug, MAX_ISSUES),
    searchDecisions(question, 3).catch(() => [] as CourtDecision[]),
  ]);

  // Dedup corpus hits, exclude current law (handled separately).
  const corpusRanked = dedupHits(corpusHitArrays, slug).slice(
    0,
    MAX_CORPUS_ARTICLES,
  );

  // Current-law top hits → ranked refs (use the same load pipeline for consistency).
  const currentLawRanked = currentLawHits
    .slice(0, MAX_CURRENT_LAW_ARTICLES)
    .map((h) => ({
      law_slug: h.law_slug,
      article_number: h.article_number,
      rank: h.rank,
      law_name_bg: h.law_name_bg,
      category: h.category,
    }));

  const [corpusGroups, currentLawGroup] = await Promise.all([
    loadArticlesForHits(corpusRanked),
    loadArticlesForHits(currentLawRanked),
  ]);
  const currentLawArticles = currentLawGroup[0]?.articles ?? [];

  console.log(
    `[chat:${slug}] q="${question.slice(0, 60)}" terms=[${keyTerms.join(",")}] corpus=${corpusGroups.length}laws/${corpusRanked.length}art current=${currentLawArticles.length}art issues=${storedIssues.length}`,
  );

  const userPrompt = buildUserPrompt({
    lawName: law.name_bg,
    question,
    currentLawArticles,
    corpusGroups,
    issues: storedIssues,
    courtDecisions,
  });

  // Build conversation history.
  const history = (body.history ?? [])
    .filter((h) => h && typeof h.q === "string" && typeof h.a === "string")
    .slice(-MAX_HISTORY_PAIRS);

  const messages: Anthropic.MessageParam[] = [];
  for (const turn of history) {
    messages.push({ role: "user", content: turn.q ?? "" });
    messages.push({ role: "assistant", content: turn.a ?? "" });
  }
  messages.push({ role: "user", content: userPrompt });

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const claudeStream = client.messages.stream(
          {
            model: "claude-sonnet-4-6",
            max_tokens: 6000,
            system: SYSTEM_PROMPT,
            messages,
          },
          { signal: req.signal },
        );
        claudeStream.on("text", (delta) => {
          controller.enqueue(encoder.encode(delta));
        });
        await claudeStream.finalMessage();
        controller.close();
      } catch (err) {
        if (req.signal.aborted) {
          controller.close();
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(`\n\n[грешка: ${msg}]`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
