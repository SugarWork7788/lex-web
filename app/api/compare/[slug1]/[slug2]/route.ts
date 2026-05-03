import Anthropic from "@anthropic-ai/sdk";
import { loadFullLaw, formatLawForPrompt, estimateTokens } from "@/lib/analyze-context";

export const runtime = "nodejs";
export const maxDuration = 300;

const SYSTEM_PROMPT = `Ти си правен анализатор. Сравняваш два български нормативни акта.

Намери:
1. Области на застъпване (уреждат едно и също нещо) — category: "overlap"
2. Директни противоречия (казват различни неща за едно и също) — category: "conflict"
3. Правни празнини (единият урежда нещо, другият не) — category: "gap"
4. Йерархични конфликти (единият надхвърля правомощията си спрямо другия) — category: "hierarchy"

За всяка находка върни ТОЧНО един JSON ред (NDJSON). Никакъв друг текст.
Никакви markdown код-блокове. Само валиден JSON, един обект на ред.

Схема:
{"category":"overlap"|"conflict"|"gap"|"hierarchy","explanation":"Ясно обяснение на български. 2-4 изречения.","severity":"нисък"|"среден"|"висок","law1_articles":["5","12"],"law2_articles":["3"],"quote_law1":"кратък точен цитат или null","quote_law2":"кратък точен цитат или null"}

Изисквания:
- Цитирай само разпоредби, които наистина съществуват в подадените текстове.
- Винаги включвай поне един от law1_articles или law2_articles.
- За severity: висок = пряк конфликт с реални последици; среден = напрежение между нормите; нисък = ниско ниво на застъпване или формална неяснота.
- Пропусни тривиални или формални съвпадения.`;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ slug1: string; slug2: string }> },
) {
  const { slug1, slug2 } = await ctx.params;
  if (slug1 === slug2) {
    return new Response("Изберете два различни закона", { status: 400 });
  }

  const [law1, law2] = await Promise.all([loadFullLaw(slug1), loadFullLaw(slug2)]);
  if (!law1 || !law2) {
    return new Response("Един от законите не е намерен или няма съдържание", {
      status: 404,
    });
  }

  const userMessage = [
    `ЗАКОН 1: ${law1.name_bg} (slug: ${law1.slug}, категория: ${law1.category})`,
    formatLawForPrompt(law1),
    ``,
    `ЗАКОН 2: ${law2.name_bg} (slug: ${law2.slug}, категория: ${law2.category})`,
    formatLawForPrompt(law2),
  ].join("\n");

  console.log(
    `[compare] ${slug1} (${law1.articles.length}art) vs ${slug2} (${law2.articles.length}art) ~${estimateTokens(userMessage)} tokens`,
  );

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const claudeStream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 12000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        });
        // Forward raw text — the client parses NDJSON.
        claudeStream.on("text", (delta) => {
          controller.enqueue(encoder.encode(delta));
        });
        await claudeStream.finalMessage();
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[compare] error: ${msg}`);
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
