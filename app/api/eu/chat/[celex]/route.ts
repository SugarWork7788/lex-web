import Anthropic from "@anthropic-ai/sdk";
import { getEuRegulation } from "@/lib/queries";

export const runtime = "nodejs";
export const maxDuration = 120;

const SYSTEM_PROMPT = `Ти си правен асистент по правото на ЕС. Отговаряш на въпроси за конкретен акт на ЕС
(регламент, директива или решение), приложим в България.

За всеки въпрос отговаряй в следната структура (markdown с ## заглавия):

## Отговор
[Директен отговор. 2-4 изречения.]

## Правна основа в акта
[Цитирай конкретни членове, съображения или клаузи от акта, които подкрепят отговора. Ако въпросът е извън обхвата на текста — кажи го.]

## Приложение в България
[Какво означава това на практика за български институции, бизнес или граждани. Ако е директива — посочи дали се очаква транспониране.]

ВАЖНИ ИЗИСКВАНИЯ:
- Пиши на ясен български. Базирай отговора върху текста на акта — не измисляй.
- Ако въпросът е извън обхвата, кажи го честно.
- Използвай "- " за списъци и "**текст**" за удебеляване.`;

const MAX_TEXT_CHARS = 60_000;
const MAX_HISTORY_PAIRS = 4;

type RequestBody = {
  question?: string;
  history?: Array<{ q?: string; a?: string }>;
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ celex: string }> },
) {
  const { celex } = await ctx.params;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  const question = (body.question ?? "").trim();
  if (!question) return new Response("Празен въпрос", { status: 400 });

  const reg = await getEuRegulation(decodeURIComponent(celex));
  if (!reg) return new Response("Не е намерен регламент", { status: 404 });

  const meta: string[] = [];
  meta.push(`CELEX: ${reg.celex}`);
  if (reg.title_bg) meta.push(`ЗАГЛАВИЕ (BG): ${reg.title_bg}`);
  if (reg.title_en) meta.push(`ЗАГЛАВИЕ (EN): ${reg.title_en}`);
  if (reg.doc_type) meta.push(`ВИД: ${reg.doc_type}`);
  if (reg.date_document) meta.push(`ДАТА: ${reg.date_document.slice(0, 10)}`);

  const text = (reg.full_text_bg || reg.full_text_en || "").slice(
    0,
    MAX_TEXT_CHARS,
  );

  const promptParts: string[] = [
    "МЕТАДАННИ НА АКТА:",
    meta.join("\n"),
    "",
    text ? "ПЪЛЕН ТЕКСТ:" : "ПЪЛНИЯТ ТЕКСТ НЕ Е НАЛИЧЕН ЛОКАЛНО — отговори въз основа на CELEX, заглавие и общо познание; ако не можеш — кажи го.",
  ];
  if (text) promptParts.push(text);
  promptParts.push("");
  promptParts.push(`ВЪПРОС: ${question}`);
  const userPrompt = promptParts.join("\n");

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
