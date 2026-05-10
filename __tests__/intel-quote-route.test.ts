/**
 * Unit tests for app/api/intel/quote/route.ts (Phase 02 / INT-02 / Task 2).
 *
 * Validates VALIDATION row 02-02-02:
 *   - rate-limit gate ("intel-quote", 60s, max 30) returns 429 over cap
 *   - response shape (text/plain stream + Cache-Control: no-store + X-Accel-Buffering: no)
 *   - model identity (claude-haiku-4-5)
 *   - signal propagation (req.signal forwarded to client.messages.stream)
 *   - 400 on missing query / missing summary / invalid JSON
 *
 * Mocks @anthropic-ai/sdk so the test never hits the live API.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SALT = "test-salt-for-quote-route";
process.env.AUDIT_VOTE_SALT = SALT;

// --- Anthropic mock --------------------------------------------------------
// Captured per-call so each test can assert on what the SDK saw.
type StreamCall = {
  args: { model: string; max_tokens: number; system: string; messages: unknown[] };
  options: { signal?: AbortSignal };
};
const streamCalls: StreamCall[] = [];

vi.mock("@anthropic-ai/sdk", () => {
  class Anthropic {
    messages = {
      stream: (args: StreamCall["args"], options: StreamCall["options"]) => {
        streamCalls.push({ args, options });
        let textCb: ((delta: string) => void) | null = null;
        const handle = {
          on: (event: string, cb: (delta: string) => void) => {
            if (event === "text") textCb = cb;
            return handle;
          },
          finalMessage: async () => {
            // Simulate two streamed chunks then resolve.
            textCb?.("Първо изречение. ");
            textCb?.("Второ изречение.");
            return { content: [] };
          },
        };
        return handle;
      },
    };
  }
  return { default: Anthropic, Anthropic };
});

async function readBody(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let acc = "";
  // Read to completion.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    acc += dec.decode(value, { stream: true });
  }
  return acc;
}

function makeReq(body: unknown, ip: string = "203.0.113.7"): Request {
  return new Request("http://test.local/api/intel/quote", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("/api/intel/quote (Haiku 4.5 streaming endpoint)", () => {
  beforeEach(() => {
    streamCalls.length = 0;
    vi.resetModules();
    process.env.AUDIT_VOTE_SALT = SALT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("streams the Haiku response back as text/plain with no-store headers", async () => {
    const { POST } = await import("@/app/api/intel/quote/route");
    const res = await POST(
      makeReq({ query: "борисов", summary: "Дълъг текст с информация." }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(res.headers.get("Content-Type")).toContain("charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");
    const body = await readBody(res);
    expect(body).toContain("Първо изречение");
    expect(body).toContain("Второ изречение");
  });

  it("uses model claude-haiku-4-5 (D-04 — NOT sonnet)", async () => {
    const { POST } = await import("@/app/api/intel/quote/route");
    await readBody(await POST(makeReq({ query: "q", summary: "s" })));
    expect(streamCalls.length).toBe(1);
    expect(streamCalls[0].args.model).toBe("claude-haiku-4-5");
    expect(streamCalls[0].args.model).not.toBe("claude-sonnet-4-6");
  });

  it("forwards req.signal to client.messages.stream (AI-07 / Pitfall 7)", async () => {
    const { POST } = await import("@/app/api/intel/quote/route");
    await readBody(await POST(makeReq({ query: "q", summary: "s" })));
    expect(streamCalls.length).toBe(1);
    // The Request object's `signal` property is an AbortSignal; the route
    // must forward it as the second-arg `signal` to the SDK so a client
    // disconnect propagates upstream.
    expect(streamCalls[0].options).toBeDefined();
    expect(streamCalls[0].options.signal).toBeDefined();
    expect(streamCalls[0].options.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns 400 on invalid JSON body", async () => {
    const { POST } = await import("@/app/api/intel/quote/route");
    const res = await POST(makeReq("not-json{{"));
    expect(res.status).toBe(400);
    const txt = await res.text();
    expect(txt).toContain("Invalid JSON");
  });

  it("returns 400 on empty query", async () => {
    const { POST } = await import("@/app/api/intel/quote/route");
    const res = await POST(makeReq({ query: "", summary: "Ненулево резюме." }));
    expect(res.status).toBe(400);
    const txt = await res.text();
    expect(txt).toContain("Празна заявка");
  });

  it("returns 400 on empty summary", async () => {
    const { POST } = await import("@/app/api/intel/quote/route");
    const res = await POST(makeReq({ query: "борисов", summary: "" }));
    expect(res.status).toBe(400);
    const txt = await res.text();
    expect(txt).toContain("Липсва резюме");
  });

  it("rate-limits at the 31st request from a single IP within 60s window (key=intel-quote, max=30)", async () => {
    const { POST } = await import("@/app/api/intel/quote/route");
    const ip = "198.51.100.99"; // unique IP isolated from other tests
    // Fire 30 requests under cap — all should return 200 (or be drained as text streams)
    for (let i = 0; i < 30; i++) {
      const r = await POST(makeReq({ query: "q", summary: "s" }, ip));
      // Drain body to release the stream.
      await readBody(r);
      expect(r.status).toBe(200);
    }
    // 31st must be 429.
    const blocked = await POST(makeReq({ query: "q", summary: "s" }, ip));
    expect(blocked.status).toBe(429);
    const j = (await blocked.json()) as { error: string; retry_after: number };
    expect(j.error).toMatch(/Твърде много заявки/);
    expect(j.retry_after).toBeGreaterThanOrEqual(1);
  });

  it("emits Bulgarian system prompt + Bulgarian-framed user message", async () => {
    const { POST } = await import("@/app/api/intel/quote/route");
    await readBody(
      await POST(
        makeReq(
          { query: "Бойко", summary: "Резюме на разследване." },
          "203.0.113.55",
        ),
      ),
    );
    expect(streamCalls.length).toBe(1);
    const call = streamCalls[0];
    expect(call.args.system).toMatch(/Извади/);
    expect(call.args.system).toMatch(/Без коментар/);
    const userMsg = call.args.messages[0] as { role: string; content: string };
    expect(userMsg.role).toBe("user");
    expect(userMsg.content).toContain("Заявка:");
    expect(userMsg.content).toContain('"Бойко"');
    expect(userMsg.content).toContain("Резюме:");
    expect(call.args.max_tokens).toBe(200);
  });
});
