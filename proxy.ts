// File: proxy.ts (Next.js 16 — renamed from middleware.ts; same semantics)
//
// Phase 5 (AUTH-05..07): optimistic auth redirect for protected routes.
//
// Per Next 16 authentication.md §"Optimistic checks with Proxy":
//   - Proxy runs on every matched route *including prefetches* → must be cheap.
//   - Read the session cookie only; NEVER call getUser() (network roundtrip)
//     here. Real validation happens at the page level via requireAuth()
//     (lib/require-auth.ts), which does call getUser() and handles stale
//     cookies / expired sessions / spoofed cookies.
//
// Cookie convention: @supabase/ssr stores the session under
//   sb-<project-ref>-auth-token  (sometimes split into .0/.1 chunks for large
//   JWTs). We probe for ANY cookie matching `sb-*-auth-token` so the proxy
//   stays env-agnostic across Supabase project switches.
//
// Matcher: only protected route trees enter this proxy. Public routes never
// pay the cost (zero impact on /, /laws, /audit, /dv, /eu, /courts, etc.).

import { NextRequest, NextResponse } from "next/server";

function hasSupabaseAuthCookie(req: NextRequest): boolean {
  for (const c of req.cookies.getAll()) {
    if (c.name.startsWith("sb-") && c.name.includes("-auth-token") && c.value) {
      return true;
    }
  }
  return false;
}

export function proxy(req: NextRequest): NextResponse {
  if (hasSupabaseAuthCookie(req)) {
    return NextResponse.next();
  }

  const returnTo = req.nextUrl.pathname + req.nextUrl.search;
  const signInUrl = new URL("/sign-in", req.nextUrl);
  signInUrl.searchParams.set("returnTo", returnTo);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ["/intel/:path*", "/profile/:path*", "/admin/:path*"],
};
