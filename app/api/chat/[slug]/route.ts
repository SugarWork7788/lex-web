import Anthropic from "@anthropic-ai/sdk";
import { getLawBySlug, getLawArticles, searchArticles } from "@/lib/queries";
import type { LawArticle } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

const SYSTEM_PROMPT = `Ти си правен асистент. Отговаряш САМО въз основа на предоставените членове от закона.
Цитирай конкретни членове с номера в свободен текст (например: "съгласно Чл. 5...").
Пиши на ясен, разбираем български без правен жаргон.
Ако въпросът е извън обхвата на закона или предоставените членове, кажи го честно.
Не измисляй членове или разпоредби.`;

const MAX_TOTAL_ARTICLES = 30;
const MAX_HISTORY_PAIRS = 5;

function formatArticles(arts: LawArticle[]): string {
  return arts
    .map((a) => `Чл. ${a.article_number}: ${a.text_content}`)
    .join("\n\n");
}

type RequestBody = {
  question?: string;
  history?: Array<{ q?: string; a?: string }>;
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
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

  // Run FTS for relevant articles within this law specifically.
  const [allArticles, ftsHits] = await Promise.all([
    getLawArticles(slug),
    searchArticles(question, 30).catch(() => []),
  ]);
  if (allArticles.length === 0) {
    return new Response("За този закон няма заредено съдържание", { status: 422 });
  }

  // FTS searches the entire corpus — keep only hits from this law.
  const ftsForLaw = ftsHits.filter((h) => h.law_slug === slug);
  const articlesByNum = new Map(allArticles.map((a) => [a.article_number, a]));

  const ranked: LawArticle[] = [];
  const seen = new Set<string>();
  for (const hit of ftsForLaw) {
    const a = articlesByNum.get(hit.article_number);
    if (a && !seen.has(a.article_number)) {
      seen.add(a.article_number);
      ranked.push(a);
    }
    if (ranked.length >= MAX_TOTAL_ARTICLES) break;
  }
  // If FTS didn't yield enough, top up from the start of the law.
  if (ranked.length < 8) {
    for (const a of allArticles) {
      if (seen.has(a.article_number)) continue;
      seen.add(a.article_number);
      ranked.push(a);
      if (ranked.length >= 8) break;
    }
  }

  // Build the conversation history (cap to last N pairs).
  const history = (body.history ?? [])
    .filter((h) => h && typeof h.q === "string" && typeof h.a === "string")
    .slice(-MAX_HISTORY_PAIRS);

  const messages: Anthropic.MessageParam[] = [];
  for (const turn of history) {
    messages.push({ role: "user", content: turn.q ?? "" });
    messages.push({ role: "assistant", content: turn.a ?? "" });
  }
  messages.push({
    role: "user",
    content: [
      `ЗАКОН: ${law.name_bg}`,
      ``,
      `РЕЛЕВАНТНИ ЧЛЕНОВЕ:`,
      formatArticles(ranked),
      ``,
      `ВЪПРОС: ${question}`,
    ].join("\n"),
  });

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const claudeStream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          messages,
        });
        claudeStream.on("text", (delta) => {
          controller.enqueue(encoder.encode(delta));
        });
        await claudeStream.finalMessage();
        controller.close();
      } catch (err) {
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
