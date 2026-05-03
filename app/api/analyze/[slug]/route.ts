import Anthropic from "@anthropic-ai/sdk";
import {
  loadAnalysisCorpus,
  formatLawForPrompt,
  estimatePromptChars,
  type AnalysisCorpus,
} from "@/lib/analyze-context";

export const runtime = "nodejs";
export const maxDuration = 300;

const SYSTEM_PROMPT = `Ти си правен анализатор на българското законодателство.
Предоставени са ти основен закон и всички закони, кодекси, наредби и правилници,
към които той препраща, включително Конституцията на Република България.

Задачата ти е да намериш реални правни проблеми.

Търси следното:
1. КОНСТИТУЦИОННО НАРУШЕНИЕ — член от основния закон противоречи пряко на Конституцията
2. КОНФЛИКТ МЕЖДУ ЗАКОНИ — основният закон противоречи на друг закон или кодекс по същата материя
3. НАДХВЪРЛЯНЕ НА ПРАВОМОЩИЯ — наредба или правилник надхвърля правомощията, дадени от закона
4. ВЪТРЕШНО ПРОТИВОРЕЧИЕ — два члена в същия закон си противоречат
5. МЪРТВА ПРЕПРАТКА — законът препраща към отменен или несъществуващ член
6. ПРАВНА ПРАЗНИНА — закон задължава нещо но не урежда как, кой или кога
7. НЕЯСНА ФОРМУЛИРОВКА — текст, допускащ противоречиво тълкуване водещо до различно прилагане

За всеки намерен проблем върни ТОЧНО един JSON обект на отделен ред.
Никакъв друг текст. Никакви обяснения извън JSON. Само JSON редове (NDJSON).
Никакви markdown код-блокове. Никакви коментари. Никакви прелюдии.

Полето "type" ТРЯБВА да е една от тези стойности (на български, главни букви):
"КОНСТИТУЦИОННО НАРУШЕНИЕ", "КОНФЛИКТ МЕЖДУ ЗАКОНИ", "НАДХВЪРЛЯНЕ НА ПРАВОМОЩИЯ",
"ВЪТРЕШНО ПРОТИВОРЕЧИЕ", "МЪРТВА ПРЕПРАТКА", "ПРАВНА ПРАЗНИНА", "НЕЯСНА ФОРМУЛИРОВКА".

Полето "severity" ТРЯБВА да е точно една от: "нисък", "среден", "висок".
- висок = нарушава основни права или Конституцията
- среден = реален конфликт между норми
- нисък = неяснота или пропуск без пряко увреждане

Формат на всеки ред (един JSON обект, без нов ред вътре):
{"type":"ТИП","severity":"нисък|среден|висок","explanation":"Обяснение на ясен български без правен жаргон. Какво е проблемът и защо има значение за гражданин. 2-4 изречения.","primary_law_slug":"slug","primary_articles":["5","12а"],"conflicting_law_slug":"slug или null","conflicting_articles":["3","7"],"quote_primary":"Точен цитат от засегнатия член","quote_conflicting":"Точен цитат от конфликтиращия член или null"}

Изисквания:
- primary_law_slug ВИНАГИ е slugът на основния анализиран закон.
- conflicting_law_slug е slug на другия закон или null ако проблемът е вътрешен.
- primary_articles и conflicting_articles са масиви от номера на членове като strings (например ["5","12а"]).
- quote_primary и quote_conflicting са кратки точни цитати от съответните членове.
- Намери ВСИЧКИ значими проблеми, не само очевидните. Без измислени проблеми.
- Ако наистина няма проблем от даден тип, просто не го включвай.`;

function buildUserMessage(corpus: AnalysisCorpus): string {
  const parts: string[] = [];
  parts.push(
    `ОСНОВЕН ЗАКОН: ${corpus.target.name_bg} (slug: ${corpus.target.slug})\n${formatLawForPrompt(corpus.target)}`,
  );
  if (corpus.constitution) {
    parts.push(
      `\n\nКОНСТИТУЦИЯ НА РЕПУБЛИКА БЪЛГАРИЯ (slug: ${corpus.constitution.slug}):\n${formatLawForPrompt(corpus.constitution)}`,
    );
  }
  if (corpus.referenced.length > 0) {
    parts.push(`\n\nРЕФЕРЕНТНИ ЗАКОНИ:`);
    for (const r of corpus.referenced) {
      parts.push(
        `\n--- ${r.name_bg} (slug: ${r.slug}, категория: ${r.category}) ---\n${formatLawForPrompt(r)}`,
      );
    }
  }
  return parts.join("");
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;

  const corpus = await loadAnalysisCorpus(slug);
  if (!corpus) {
    return new Response("Не е намерен закон или няма заредено съдържание", {
      status: 404,
    });
  }

  const userMessage = buildUserMessage(corpus);

  const totalChars = estimatePromptChars(corpus);
  const tokenEstimate = Math.round(totalChars / 2.2);
  console.log(
    `[analyze:${slug}] target=${corpus.target.articles.length}art constitution=${corpus.constitution?.articles.length ?? 0}art referenced=${corpus.referenced.length}laws chars=${totalChars} ~tokens=${tokenEstimate}`,
  );

  const lawsMapHeader = encodeURIComponent(JSON.stringify(corpus.lawsMap));

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const claudeStream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 16000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        });

        claudeStream.on("text", (delta) => {
          controller.enqueue(encoder.encode(delta));
        });

        await claudeStream.finalMessage();
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[analyze:${slug}] error:`, message);
        controller.enqueue(
          encoder.encode(
            `\n${JSON.stringify({
              type: "ВЪТРЕШНО ПРОТИВОРЕЧИЕ",
              severity: "висок",
              explanation: `Грешка при анализ: ${message}`,
              primary_law_slug: slug,
              primary_articles: [],
              conflicting_law_slug: null,
              conflicting_articles: [],
              quote_primary: "",
              quote_conflicting: null,
              _error: true,
            })}\n`,
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      "X-Laws-Map": lawsMapHeader,
      "Access-Control-Expose-Headers": "X-Laws-Map",
    },
  });
}
