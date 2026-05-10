/**
 * /api/intel/quote — Haiku 4.5 quote-extraction streaming endpoint (INT-02 / D-03 / D-04).
 *
 * Inputs (POST JSON): { query: string, summary: string }
 * Output: text/plain stream of 1–2 Bulgarian sentences extracted from `summary`,
 *         most relevant to `query`.
 *
 * Called per-card (article variant only) by app/intel/search/best-match-quote.tsx
 * via useRateLimitedFetch (Phase 1, CONTEXT.md D-06). Up to 5 article cards per
 * page render → the rate-limit cap is sized for ~6 page renders/min/IP (max=30).
 *
 * Rate-limit key: "intel-quote" — separate slot from "intel-search" so the
 * caps don't collide.
 *
 * Runtime: nodejs (Edge can't host @anthropic-ai/sdk's stream() as currently
 *   typed; same posture as the existing /api/intel/search route).
 *
 * AI-07 contract: req.signal forwarded to client.messages.stream(...) so a
 *   client disconnect propagates upstream and stops Haiku token spend
 *   (RESEARCH Pitfall 7).
 */

import Anthropic from "@anthropic-ai/sdk";
import { rateLimited } from "@/lib/rate-limit";

// Verified against node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/{runtime,maxDuration}.md
// — no breaking changes from training data.
export const runtime = "nodejs";
export const maxDuration = 30; // RESEARCH Pattern 3 — Haiku is fast; 30s is generous

const SYSTEM_PROMPT = `Получаваш кратко резюме на разследваща статия и потребителска
заявка. Извади 1–2 изречения от резюмето, които са най-релевантни на заявката.
Не цитирай повече от 2 изречения. Не редактирай — върни дословно. Без коментар.`;

type RequestBody = { query?: string; summary?: string };

export async function POST(req: Request) {
  // CONTEXT.md D-07: reuse Phase-1 rate-limit gate; structured-log throttle
  // event emitted by lib/rate-limit.ts (no new event names in this plan).
  const limit = rateLimited(req, "intel-quote", { windowMs: 60_000, max: 30 });
  if (limit) return limit;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const query = (body.query ?? "").trim();
  const summary = (body.summary ?? "").trim();
  if (!query) return new Response("Празна заявка", { status: 400 });
  if (!summary) return new Response("Липсва резюме", { status: 400 });

  const client = new Anthropic();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const cs = client.messages.stream(
          {
            // CONTEXT.md D-04 — Haiku 4.5 (NOT sonnet); ~5× cheaper, ~3× faster.
            model: "claude-haiku-4-5",
            // 2 BG sentences ≈ ~120 tokens; 200 is a generous ceiling.
            max_tokens: 200,
            system: SYSTEM_PROMPT,
            messages: [
              {
                role: "user",
                content: `Заявка: "${query}"\n\nРезюме:\n${summary}`,
              },
            ],
          },
          // RESEARCH Pitfall 7 — preserves AI-07 abort propagation.
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
