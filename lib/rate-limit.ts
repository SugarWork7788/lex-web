// Per-route, per-IP sliding-window rate limiter.
//
// Scope: in-memory only — survives within a single Vercel function instance.
// Adequate to throttle scripted abuse from a single IP that would otherwise
// drain the Anthropic budget. NOT a defense against distributed attacks; for
// that you'd want a shared-state store (Redis / Vercel KV).
//
// Usage:
//   import { rateLimited } from "@/lib/rate-limit";
//   export async function POST(req: Request) {
//     const limit = rateLimited(req, "chat", { windowMs: 60_000, max: 10 });
//     if (limit) return limit;
//     // ...
//   }

type Entry = number[]; // unix-ms timestamps of recent requests

const store = new Map<string, Entry>();
let lastGc = Date.now();

export type RateLimitOptions = { windowMs: number; max: number };

export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

function gc(now: number) {
  if (now - lastGc < 60_000) return;
  lastGc = now;
  // Drop slots whose newest entry is older than 30 minutes.
  const cutoff = now - 30 * 60_000;
  for (const [k, arr] of store.entries()) {
    if (arr.length === 0 || arr[arr.length - 1] < cutoff) store.delete(k);
  }
}

/** Returns a 429 Response if the IP has exceeded the limit, else null. */
export function rateLimited(
  req: Request,
  key: string,
  opts: RateLimitOptions,
): Response | null {
  const ip = getClientIp(req);
  const now = Date.now();
  gc(now);

  const slot = `${key}:${ip}`;
  const cutoff = now - opts.windowMs;
  const arr = (store.get(slot) ?? []).filter((t) => t > cutoff);

  if (arr.length >= opts.max) {
    const oldest = arr[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + opts.windowMs - now) / 1000));
    store.set(slot, arr);
    return new Response(
      JSON.stringify({
        error: "Твърде много заявки. Моля, изчакайте.",
        retry_after: retryAfter,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Retry-After": String(retryAfter),
        },
      },
    );
  }

  arr.push(now);
  store.set(slot, arr);
  return null;
}
