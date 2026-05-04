import Anthropic from "@anthropic-ai/sdk";
import { rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `Ти си разузнавателен анализатор. Получаваш заявка
("име на лице, фирма или тема") и обобщение на резултатите от 6 интел бази
(санкции, офшор, OLAF, разследваща журналистика, прокуратура, НАП).

Отговаряй на български в кратък markdown формат:

## Какво намерихме
[1-2 изречения. Спомени общия брой попадения и кои категории имат най-много.]

## Ключови наблюдения
[До 4 точки със "- " — конкретни лица/компании/случаи, които изпъкват.
Цитирай името дословно. Ако е намерено в няколко източника, отбележи го.]

## Препоръка
[Какви са следващите стъпки за дълбочинна проверка. 1-2 изречения.]

ВАЖНО: Не измисляй имена или цифри. Ако някоя категория е празна, кажи го честно.
Резултатите са ориентировъчни — не предполагат вина.`;

type RequestBody = {
  query?: string;
  counts?: {
    sanctioned: number; offshore: number; olaf: number;
    articles: number; prosecution: number; nap: number;
  };
  samples?: {
    sanctioned: string[];
    offshore: string[];
    olaf: string[];
    articles: string[];
    prosecution: string[];
    nap: string[];
  };
};

export async function POST(req: Request) {
  const limit = rateLimited(req, "intel-search", { windowMs: 60_000, max: 10 });
  if (limit) return limit;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const query = (body.query ?? "").trim();
  if (!query) return new Response("Празна заявка", { status: 400 });

  const c = body.counts ?? { sanctioned: 0, offshore: 0, olaf: 0, articles: 0, prosecution: 0, nap: 0 };
  const s = body.samples ?? { sanctioned: [], offshore: [], olaf: [], articles: [], prosecution: [], nap: [] };

  const lines: string[] = [];
  lines.push(`ЗАЯВКА: "${query}"`);
  lines.push("");
  lines.push("ОБЩИ БРОЯЧИ:");
  lines.push(`- Санкционирани лица/организации: ${c.sanctioned}`);
  lines.push(`- Офшорни структури: ${c.offshore}`);
  lines.push(`- OLAF разследвания: ${c.olaf}`);
  lines.push(`- Разследващи статии: ${c.articles}`);
  lines.push(`- Прокурорски случаи: ${c.prosecution}`);
  lines.push(`- НАП указания: ${c.nap}`);
  lines.push("");
  lines.push("ПРИМЕРНИ ИМЕНА/ЗАГЛАВИЯ ОТ ВСЯКА КАТЕГОРИЯ:");
  for (const [k, v] of Object.entries(s)) {
    if (Array.isArray(v) && v.length > 0) {
      lines.push(`- ${k}: ${v.slice(0, 5).join(" | ")}`);
    }
  }

  const client = new Anthropic();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const cs = client.messages.stream(
          {
            model: "claude-sonnet-4-6",
            max_tokens: 1500,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: lines.join("\n") }],
          },
          { signal: req.signal },
        );
        cs.on("text", (delta) => controller.enqueue(encoder.encode(delta)));
        await cs.finalMessage();
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
