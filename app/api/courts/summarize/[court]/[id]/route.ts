import Anthropic from "@anthropic-ai/sdk";
import { getCourtDecision } from "@/lib/queries";

export const runtime = "nodejs";
export const maxDuration = 120;

const SYSTEM_PROMPT = `Ти си правен анализатор на българската съдебна практика.
Получаваш пълен текст на съдебно решение от ВКС, ВАС или Конституционен съд.

Твоята задача: създай ясно структурирано резюме на български в следния markdown формат:

## Същност на решението
[1-2 изречения — какво решава съдът по същество]

## Фактическа обстановка
[Кратко описание на спора, страните и обстоятелствата. 2-4 изречения.]

## Правен анализ
[Юридическата аргументация на съда. Кои принципи и норми прилага. Цитирай членове и закони, ако са посочени.]

## Резултат
[Какво постановява съдът — отменя/потвърждава/връща за ново разглеждане и т.н.]

## Практическо значение
[Какво означава това решение за подобни случаи. За кого е важно и защо.]

## Ключови правни принципи
[Списък - на най-важните правни принципи, изведени от решението. Използвай "- " за списък.]

ВАЖНИ ИЗИСКВАНИЯ:
- Пиши на ясен, разбираем български. Без правен жаргон където е възможно.
- Използвай "- " за точки в списък и "**текст**" за удебеляване.
- Не измисляй факти. Само това, което е в текста.
- Резултатите са ориентировъчни и не заместват професионален правен анализ.`;

const MAX_TEXT_CHARS = 80_000;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ court: string; id: string }> },
) {
  const { id } = await ctx.params;

  const decision = await getCourtDecision(id);
  if (!decision) {
    return new Response("Не е намерено решение", { status: 404 });
  }

  const meta: string[] = [];
  meta.push(`СЪД: ${decision.court}`);
  if (decision.act_type) meta.push(`ВИД: ${decision.act_type}`);
  if (decision.decision_date) meta.push(`ДАТА: ${decision.decision_date}`);
  if (decision.case_number) meta.push(`ДЕЛО: ${decision.case_number}`);
  if (decision.decision_number) meta.push(`РЕШЕНИЕ: ${decision.decision_number}`);
  if (decision.college) meta.push(`ОТДЕЛЕНИЕ: ${decision.college}`);
  if (decision.ecli) meta.push(`ECLI: ${decision.ecli}`);
  if (decision.cited_law_slugs && decision.cited_law_slugs.length > 0) {
    meta.push(`ЦИТИРАНИ ЗАКОНИ: ${decision.cited_law_slugs.join(", ")}`);
  }

  const userMessage = [
    "МЕТАДАННИ НА РЕШЕНИЕТО:",
    meta.join("\n"),
    "",
    "ПЪЛЕН ТЕКСТ НА РЕШЕНИЕТО:",
    (decision.full_text ?? "").slice(0, MAX_TEXT_CHARS),
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
