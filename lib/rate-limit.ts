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

import { createHmac } from "node:crypto";

const SALT = process.env.AUDIT_VOTE_SALT;
if (!SALT) {
  // Match SEC-06: AUDIT_VOTE_SALT is mandatory. Throw at module load so a
  // missing env var is caught in CI / first deploy, not silently weakened.
  throw new Error("AUDIT_VOTE_SALT is required");
}

/** HMAC-SHA-256 of the IP, keyed with AUDIT_VOTE_SALT, truncated to 16 hex
 *  chars (D-10). 8 bytes is plenty for log scanning; HMAC (not concat-hash
 *  per the existing audit/vote pattern) resists length-extension and
 *  rainbow-table attacks. The audit/vote concat-hash divergence is
 *  documented as a known finding, out of Phase 1 scope. */
function hashIp(ip: string): string {
  return createHmac("sha256", SALT!).update(ip).digest("hex").slice(0, 16);
}

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
    // D-08, D-09, D-11: emit one JSON-shaped throttle log line per event.
    // Vercel auto-parses single-line console.log JSON into structured logs.
    // Strict 5-key shape — extending the shape without re-evaluating the
    // 256 KB Vercel log line cap is a regression risk (RESEARCH Pitfall 4).
    console.log(JSON.stringify({
      event: "rate_limit_throttled",
      route: key,
      ip_hash: hashIp(ip),
      retry_after: retryAfter,
      ts: new Date().toISOString(),
    }));
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
