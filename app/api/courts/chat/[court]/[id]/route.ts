import Anthropic from "@anthropic-ai/sdk";
import { getCourtDecision } from "@/lib/queries";
import { supabase, type Severity } from "@/lib/supabase";
import { rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

const SYSTEM_PROMPT = `Ти си правен асистент. Отговаряш на въпроси за конкретно съдебно решение.

Имаш достъп до пълния текст на решението и до известни правни конфликти от база данни,
свързани със законите, които решението цитира.

За всеки въпрос отговаряй в следната структура (markdown с ## заглавия):

## Отговор
[Директен отговор. 2-4 изречения.]

## Правна основа в решението
[Цитирай конкретни части от текста на решението, които подкрепят отговора.]

## Бележки
[Свързани правни проблеми от базата данни, ако има релевантни. Иначе пропусни секцията или напиши "Няма допълнителни бележки."]

ВАЖНИ ИЗИСКВАНИЯ:
- Пиши на ясен български. Базирай отговора върху текста на решението — не измисляй.
- Ако въпросът е извън обхвата на решението, кажи го честно.
- Използвай "- " за списъци и "**текст**" за удебеляване.`;

const MAX_TEXT_CHARS = 60_000;
const MAX_HISTORY_PAIRS = 4;
const MAX_ISSUES = 5;

type IssueRow = {
  type: string;
  severity: Severity;
  explanation: string;
  primary_law_slug: string;
  primary_articles: string[];
  conflicting_law_slug: string | null;
  conflicting_articles: string[];
};

type RequestBody = {
  question?: string;
  history?: Array<{ q?: string; a?: string }>;
};

async function fetchIssuesForCitedLaws(slugs: string[]): Promise<IssueRow[]> {
  if (slugs.length === 0) return [];
  const { data, error } = await supabase
    .from("law_issues")
    .select(
      "type, severity, explanation, primary_law_slug, primary_articles, conflicting_law_slug, conflicting_articles",
    )
    .in("law_slug", slugs)
    .limit(MAX_ISSUES);
  if (error || !data) return [];
  return data as IssueRow[];
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ court: string; id: string }> },
) {
  const limit = rateLimited(req, "courts-chat", { windowMs: 60_000, max: 10 });
  if (limit) return limit;

  const { id } = await ctx.params;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  const question = (body.question ?? "").trim();
  if (!question) return new Response("Празен въпрос", { status: 400 });

  const decision = await getCourtDecision(id);
  if (!decision) return new Response("Не е намерено решение", { status: 404 });

  const issues = await fetchIssuesForCitedLaws(decision.cited_law_slugs ?? []);

  const meta: string[] = [];
  meta.push(`СЪД: ${decision.court}`);
  if (decision.act_type) meta.push(`ВИД: ${decision.act_type}`);
  if (decision.decision_date) meta.push(`ДАТА: ${decision.decision_date}`);
  if (decision.case_number) meta.push(`ДЕЛО: ${decision.case_number}`);
  if (decision.decision_number) meta.push(`РЕШЕНИЕ: ${decision.decision_number}`);
  if (decision.cited_law_slugs && decision.cited_law_slugs.length > 0) {
    meta.push(`ЦИТИРАНИ ЗАКОНИ: ${decision.cited_law_slugs.join(", ")}`);
  }

  const promptParts: string[] = [
    "МЕТАДАННИ НА РЕШЕНИЕТО:",
    meta.join("\n"),
    "",
    "ПЪЛЕН ТЕКСТ НА РЕШЕНИЕТО:",
    (decision.full_text ?? "").slice(0, MAX_TEXT_CHARS),
  ];

  if (issues.length > 0) {
    promptParts.push("");
    promptParts.push("ИЗВЕСТНИ ПРАВНИ ПРОБЛЕМИ ОТ БАЗАТА ДАННИ (свързани със законите в това решение):");
    for (const it of issues) {
      const articles =
        it.primary_articles.length > 0 ? `Чл. ${it.primary_articles.join(", ")}` : "";
      promptParts.push(
        `- [${it.severity.toUpperCase()}] ${it.type}${articles ? ` (${articles} от ${it.primary_law_slug})` : ""}: ${it.explanation}`,
      );
    }
  }

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
        const claudeStream = client.messages.stream(
          {
            model: "claude-sonnet-4-6",
            max_tokens: 4000,
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
