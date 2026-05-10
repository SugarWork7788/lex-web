import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

// Mock Anthropic SDK
const mockStream = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        stream: mockStream,
      };
    },
  };
});

// Mock Supabase
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockCreateClient = vi.fn(() => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        limit: () => ({
          single: mockSelect,
        }),
      }),
    }),
    update: (data: unknown) => ({
      eq: (col: string, val: unknown) => {
        mockUpdate({ data, col, val });
        return { error: null };
      },
    }),
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateClient,
}));

// Mock rate-limit so we control which calls return 429
const mockRateLimited = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  rateLimited: mockRateLimited,
}));

// Set required env vars for service client
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.AUDIT_VOTE_SALT = "test-salt";
process.env.ANTHROPIC_API_KEY = "test-anthropic-key";

// Helper: build a Request with the standard shape
function mkRequest(body: object, signal?: AbortSignal): Request {
  return new Request("https://example.com/api/dv/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(body),
    signal,
  });
}

// Helper: drain a ReadableStream body to a string
async function drainBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}

describe("/api/dv/summarize — grep gates", () => {
  it("uses claude-sonnet-4-6 model (no version bleed-through)", () => {
    const source = readFileSync(`${process.cwd()}/app/api/dv/summarize/route.ts`, "utf-8");
    expect(source).toMatch(/"claude-sonnet-4-6"/);
    expect(source).not.toMatch(/claude-sonnet-4-5(?!\.\d)/); // ensure no 4-5 leakage
  });

  it("forwards signal: req.signal to Anthropic stream (AI-07 preservation)", () => {
    const source = readFileSync(`${process.cwd()}/app/api/dv/summarize/route.ts`, "utf-8");
    expect(source).toMatch(/signal:\s*req\.signal/);
  });

  it("contains zero `finally` blocks (cache-poison prevention per RESEARCH Q6)", () => {
    const source = readFileSync(`${process.cwd()}/app/api/dv/summarize/route.ts`, "utf-8");
    const finallyMatches = source.match(/\bfinally\b/g);
    expect(finallyMatches).toBeNull();
  });

  it("uses dv-summarize rate-limit key with max=10/min", () => {
    const source = readFileSync(`${process.cwd()}/app/api/dv/summarize/route.ts`, "utf-8");
    expect(source).toMatch(/"dv-summarize"/);
    expect(source).toMatch(/max:\s*10/);
    expect(source).toMatch(/windowMs:\s*60_000/);
  });
});

describe("/api/dv/summarize — behavior", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockUpdate.mockReset();
    mockStream.mockReset();
    mockRateLimited.mockReset();
    mockRateLimited.mockReturnValue(null); // default: not rate-limited
  });

  it("returns 429 when rate-limited", async () => {
    // Override rate-limit to return a 429 response
    mockRateLimited.mockReturnValueOnce(
      new Response("Превишен лимит", { status: 429, headers: { "Retry-After": "60" } }),
    );
    const { POST } = await import("@/app/api/dv/summarize/route");
    const res = await POST(mkRequest({ actId: "uuid-1" }));
    expect(res.status).toBe(429);
  });

  it("cache hit: returns cached summary_ai with X-Source: cache; NO Anthropic call", async () => {
    mockSelect.mockResolvedValueOnce({
      data: { id: "uuid-1", title: "Test", act_type: "Указ", full_text: "...".repeat(20), summary_ai: "cached body" },
      error: null,
    });

    const { POST } = await import("@/app/api/dv/summarize/route");
    const res = await POST(mkRequest({ actId: "uuid-1" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Source")).toBe("cache");
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await drainBody(res);
    expect(body).toBe("cached body");
    expect(mockStream).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("cache miss: streams Anthropic + write-back after complete", async () => {
    mockSelect.mockResolvedValueOnce({
      data: { id: "uuid-1", title: "Test", act_type: "Закон", full_text: "Long act body".repeat(100), summary_ai: null },
      error: null,
    });

    // Mock the Anthropic stream to yield 3 chunks
    const fakeEvents = [
      { type: "content_block_delta", delta: { type: "text_delta", text: "## Какво прави\n" } },
      { type: "content_block_delta", delta: { type: "text_delta", text: "Тестово обобщение. " } },
      { type: "content_block_delta", delta: { type: "text_delta", text: "Край." } },
    ];
    mockStream.mockResolvedValueOnce({
      [Symbol.asyncIterator]: async function* () {
        for (const e of fakeEvents) yield e;
      },
    });

    const { POST } = await import("@/app/api/dv/summarize/route");
    const res = await POST(mkRequest({ actId: "uuid-1" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Source")).toBe("fresh");
    const body = await drainBody(res);
    expect(body).toBe("## Какво прави\nТестово обобщение. Край.");

    // After stream drain, write-back should have been called
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0].data.summary_ai).toBe("## Какво прави\nТестово обобщение. Край.");
    expect(mockUpdate.mock.calls[0][0].data.summary_ai_generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("abort mid-stream: NO write-back (cache-poison prevention)", async () => {
    mockSelect.mockResolvedValueOnce({
      data: { id: "uuid-1", title: "Test", act_type: "Закон", full_text: "Long act body".repeat(100), summary_ai: null },
      error: null,
    });

    // Stream yields one chunk then throws
    mockStream.mockResolvedValueOnce({
      [Symbol.asyncIterator]: async function* () {
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "partial " } };
        throw new Error("abort");
      },
    });

    const { POST } = await import("@/app/api/dv/summarize/route");
    const res = await POST(mkRequest({ actId: "uuid-1" }));

    // Response is still 200 (stream starts before the error); the error happens during drain
    try {
      await drainBody(res);
    } catch {
      // Expected — stream errored
    }
    // Write-back MUST NOT have been called
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("missing actId returns 400", async () => {
    const { POST } = await import("@/app/api/dv/summarize/route");
    const res = await POST(mkRequest({}));
    expect(res.status).toBe(400);
  });

  it("act not found returns 404", async () => {
    mockSelect.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
    const { POST } = await import("@/app/api/dv/summarize/route");
    const res = await POST(mkRequest({ actId: "uuid-missing" }));
    expect(res.status).toBe(404);
  });

  it("empty full_text returns 422", async () => {
    mockSelect.mockResolvedValueOnce({
      data: { id: "uuid-1", title: "Test", act_type: "Указ", full_text: "", summary_ai: null },
      error: null,
    });
    const { POST } = await import("@/app/api/dv/summarize/route");
    const res = await POST(mkRequest({ actId: "uuid-1" }));
    expect(res.status).toBe(422);
  });
});
