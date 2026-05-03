import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

const SYSTEM_PROMPT = `Ти си правен асистент. Отговаряш на въпроси за конкретен правен проблем,
открит при AI анализ на български закон.

Имаш достъп до:
  - Описание на проблема (тип, сериозност, обяснение, цитати)
  - Засегнати членове на основния закон
  - Ако е приложимо: членовете на конфликтния закон
  - Имената на двата закона

За всеки въпрос отговаряй в следната структура (markdown с ## заглавия):

## Отговор
[Директен отговор на въпроса. 2-4 изречения.]

## Връзка с проблема
[Кои части от описанието на проблема подкрепят отговора. Цитирай конкретни членове, ако е възможно.]

## Бележки
[Допълнителен контекст или практически последици. Ако няма — пропусни секцията.]

ВАЖНИ ИЗИСКВАНИЯ:
- Пиши на ясен български. Базирай отговора върху описанието на проблема — не измисляй.
- Ако въпросът е извън обхвата на проблема, кажи го честно.
- Използвай "- " за списъци и "**текст**" за удебеляване.
- Резултатите са ориентировъчни и не заместват професионален правен съвет.`;

const MAX_HISTORY_PAIRS = 4;

type RequestBody = {
  issue_id?: string;
  question?: string;
  history?: Array<{ q?: string; a?: string }>;
};

type IssueContext = {
  type: string;
  severity: string;
  explanation: string;
  refined_explanation: string | null;
  primary_law_slug: string;
  primary_articles: string[];
  conflicting_law_slug: string | null;
  conflicting_articles: string[];
  quote_primary: string | null;
  quote_conflicting: string | null;
  primary_law_name: string | null;
  conflicting_law_name: string | null;
};

async function fetchIssue(id: string): Promise<IssueContext | null> {
  const { data, error } = await supabase
    .from("law_issues")
    .select(
      `type, severity, explanation, refined_explanation,
       primary_law_slug, primary_articles, conflicting_law_slug, conflicting_articles,
       quote_primary, quote_conflicting`,
    )
    .eq("id", id)
    .single();
  if (error || !data) return null;

  const slugs = [data.primary_law_slug, data.conflicting_law_slug].filter(
    Boolean,
  ) as string[];
  let nameMap = new Map<string, string>();
  if (slugs.length > 0) {
    const lawsRes = await supabase
      .from("laws")
      .select("slug, name_bg")
      .in("slug", slugs);
    if (lawsRes.data) {
      for (const r of lawsRes.data as { slug: string; name_bg: string }[]) {
        nameMap.set(r.slug, r.name_bg);
      }
    }
  }

  return {
    type: data.type,
    severity: data.severity,
    explanation: data.explanation,
    refined_explanation: data.refined_explanation ?? null,
    primary_law_slug: data.primary_law_slug,
    primary_articles: (data.primary_articles ?? []) as string[],
    conflicting_law_slug: data.conflicting_law_slug ?? null,
    conflicting_articles: (data.conflicting_articles ?? []) as string[],
    quote_primary: data.quote_primary ?? null,
    quote_conflicting: data.quote_conflicting ?? null,
    primary_law_name: nameMap.get(data.primary_law_slug) ?? null,
    conflicting_law_name: data.conflicting_law_slug
      ? (nameMap.get(data.conflicting_law_slug) ?? null)
      : null,
  };
}

function formatIssueContext(c: IssueContext): string {
  const lines: string[] = [];
  lines.push(`ТИП НА ПРОБЛЕМА: ${c.type}`);
  lines.push(`СЕРИОЗНОСТ: ${c.severity}`);
  lines.push(
    `ОСНОВЕН ЗАКОН: ${c.primary_law_name || c.primary_law_slug} (slug: ${c.primary_law_slug})`,
  );
  if (c.primary_articles.length > 0) {
    lines.push(`ЗАСЕГНАТИ ЧЛЕНОВЕ: ${c.primary_articles.map((a) => `Чл. ${a}`).join(", ")}`);
  }
  if (c.conflicting_law_slug) {
    lines.push(
      `КОНФЛИКТЕН ЗАКОН: ${c.conflicting_law_name || c.conflicting_law_slug} (slug: ${c.conflicting_law_slug})`,
    );
    if (c.conflicting_articles.length > 0) {
      lines.push(
        `КОНФЛИКТНИ ЧЛЕНОВЕ: ${c.conflicting_articles.map((a) => `Чл. ${a}`).join(", ")}`,
      );
    }
  }
  lines.push("");
  lines.push("ОБЯСНЕНИЕ:");
  lines.push(c.refined_explanation || c.explanation);
  if (c.quote_primary) {
    lines.push("");
    lines.push("ЦИТАТ ОТ ОСНОВНИЯ ЗАКОН:");
    lines.push(c.quote_primary);
  }
  if (c.quote_conflicting) {
    lines.push("");
    lines.push("ЦИТАТ ОТ КОНФЛИКТНИЯ ЗАКОН:");
    lines.push(c.quote_conflicting);
  }
  return lines.join("\n");
}

export async function POST(req: Request) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  const issueId = (body.issue_id ?? "").trim();
  const question = (body.question ?? "").trim();
  if (!issueId) return new Response("Липсва issue_id", { status: 400 });
  if (!question) return new Response("Празен въпрос", { status: 400 });

  const ctx = await fetchIssue(issueId);
  if (!ctx) return new Response("Не е намерен проблем", { status: 404 });

  const userPrompt = [
    "КОНТЕКСТ ЗА ПРОБЛЕМА:",
    formatIssueContext(ctx),
    "",
    `ВЪПРОС: ${question}`,
  ].join("\n");

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
          max_tokens: 3000,
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
