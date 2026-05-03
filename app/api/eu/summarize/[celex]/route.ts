import Anthropic from "@anthropic-ai/sdk";
import { getEuRegulation } from "@/lib/queries";

export const runtime = "nodejs";
export const maxDuration = 120;

const SYSTEM_PROMPT = `Ти си експерт по правото на Европейския съюз и неговото прилагане в България.
Получаваш текста на регламент, директива или решение на ЕС.

Твоята задача: създай ясно структурирано резюме на български в следния markdown формат:

## Същност на регламента
[1-2 изречения — какво регулира този акт по същество]

## Приложно поле
[Към кого се прилага и какво обхваща. 2-4 изречения.]

## Задължения за България
[Конкретни задължения за български институции, бизнес или граждани. Ако е директива — какво трябва да транспонира НС. Ако е регламент — пряко приложим.]

## Важни срокове и дати
[Срокове за прилагане, транспониране, публикуване, влизане в сила. Използвай "- " за списък. Ако няма срокове, напиши "Няма изрично посочени срокове."]

## Практическо значение
[Какво означава това за бизнеса и гражданите в България. Кога важи. За кого е особено важно и защо.]

ВАЖНИ ИЗИСКВАНИЯ:
- Пиши на ясен български. Без правен жаргон, където е възможно.
- Използвай "- " за точки в списък и "**текст**" за удебеляване.
- Не измисляй факти. Ако нещо не е в текста, не го твърди.
- Резултатите са ориентировъчни и не заместват професионален правен анализ.`;

const MAX_TEXT_CHARS = 80_000;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ celex: string }> },
) {
  const { celex } = await ctx.params;
  const reg = await getEuRegulation(decodeURIComponent(celex));
  if (!reg) {
    return new Response("Не е намерен регламент", { status: 404 });
  }

  const meta: string[] = [];
  meta.push(`CELEX: ${reg.celex}`);
  if (reg.title_bg) meta.push(`ЗАГЛАВИЕ (BG): ${reg.title_bg}`);
  if (reg.title_en) meta.push(`ЗАГЛАВИЕ (EN): ${reg.title_en}`);
  if (reg.doc_type) meta.push(`ВИД: ${reg.doc_type}`);
  if (reg.date_document) meta.push(`ДАТА: ${reg.date_document.slice(0, 10)}`);
  if (reg.year) meta.push(`ГОДИНА: ${reg.year}`);
  if (reg.in_force !== undefined && reg.in_force !== null) {
    meta.push(`В СИЛА: ${reg.in_force ? "Да" : "Не"}`);
  }

  const body = (reg.full_text_bg || reg.full_text_en || "").slice(
    0,
    MAX_TEXT_CHARS,
  );
  const userMessage = body
    ? [
        "МЕТАДАННИ:",
        meta.join("\n"),
        "",
        "ПЪЛЕН ТЕКСТ НА АКТА:",
        body,
      ].join("\n")
    : [
        "МЕТАДАННИ:",
        meta.join("\n"),
        "",
        "ПЪЛНИЯТ ТЕКСТ НЕ Е НАЛИЧЕН ЛОКАЛНО.",
        "Базирай резюмето си на CELEX номера, заглавието и общото познание за този вид акт на ЕС. Ако не можеш да дадеш точно резюме, кажи го честно.",
      ].join("\n");

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const claudeStream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 6000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
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
