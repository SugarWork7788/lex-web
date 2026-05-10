import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `Ти си експерт по българско право, който обяснява закони и подзаконови актове на обикновени граждани.

Получаваш заглавието и пълния текст на акт от Държавен вестник. Отговаряй на български в кратък markdown формат:

## Какво прави този акт
[1–2 изречения. Кой го издава, какво променя или регулира, кога влиза в сила.]

## Засегнати лица
[До 3 точки със "- " — конкретни групи, индустрии или ситуации, за които има значение.]

## Ключови разпоредби
[До 4 точки със "- " — основните задължения, права или промени. Цитирай номера на членове или параграфи, ако са в текста.]

ВАЖНО: Не измисляй съдържание. Ако нещо не е ясно от текста, кажи "не е уточнено". Не давай правни съвети — само обяснение.`;

type RequestBody = { actId?: string };

/**
 * Service-role Supabase client for write-back.
 * Falls back to anon client for the cache-read; only the write needs service role
 * (anon RLS may prevent updating dv_acts.summary_ai depending on policy).
 */
function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  // 1. Rate-limit gate
  const limit = rateLimited(req, "dv-summarize", { windowMs: 60_000, max: 10 });
  if (limit) return limit;

  // 2. Parse + validate body
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const actId = (body.actId ?? "").trim();
  if (!actId) return new Response("Празна заявка (actId)", { status: 400 });

  // 3. Fetch act from DB
  const supabase = getServiceSupabase();
  const { data: act, error: actErr } = await supabase
    .from("dv_acts")
    .select("id, title, act_type, full_text, summary_ai")
    .eq("id", actId)
    .limit(1)
    .single();

  if (actErr || !act) {
    return new Response("Актът не е намерен", { status: 404 });
  }

  if (!act.full_text || act.full_text.length < 20) {
    return new Response("Актът няма достатъчно съдържание за обобщение", { status: 422 });
  }

  // 4. Cache hit — faux-stream the cached value
  if (act.summary_ai && act.summary_ai.length > 0) {
    const encoder = new TextEncoder();
    const cached = act.summary_ai;
    const cacheStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(cached));
        controller.close();
      },
    });
    return new Response(cacheStream, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Source": "cache",
      },
    });
  }

  // 5. Cache miss — call Anthropic and write-back AFTER stream completes
  const client = new Anthropic();
  const encoder = new TextEncoder();
  let collected = "";

  const stream = await client.messages.stream(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `ЗАГЛАВИЕ: ${act.title}\nТИП АКТ: ${act.act_type ?? "Неопределен"}\n\nПЪЛЕН ТЕКСТ:\n${act.full_text}`,
        },
      ],
    },
    { signal: req.signal },
  );

  const responseStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const chunk = event.delta.text;
            collected += chunk;
            controller.enqueue(encoder.encode(chunk));
          }
        }
        // STREAM COMPLETED CLEANLY — write-back HERE, inside try, AFTER the loop.
        // Do NOT move this to a post-try cleanup block (the always-runs JS keyword);
        // such a block runs on abort too and would poison the cache with partial text.
        // RESEARCH §Q6 + T-DV-03-01 forbid that pattern. Catch must NOT write-back either.
        if (collected.length > 0) {
          await supabase
            .from("dv_acts")
            .update({
              summary_ai: collected,
              summary_ai_generated_at: new Date().toISOString(),
            })
            .eq("id", actId);
        }
        controller.close();
      } catch (err) {
        // Aborted or upstream error — DO NOT write-back. Partial summary is poison.
        controller.error(err);
      }
    },
  });

  return new Response(responseStream, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Source": "fresh",
    },
  });
}
