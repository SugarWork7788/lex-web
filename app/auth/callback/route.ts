// File: app/auth/callback/route.ts
//
// PKCE code-exchange handler — used by both magic-link email confirmation
// AND Google OAuth. Both deliver `?code=xxx` here; the same exchange call
// installs the session cookie either way.
//
// Source: supabase.com/docs/guides/auth/social-login/auth-google
// Adapted to use the lex-web factory pattern.
//
// Hardening: open-redirect guard on `next` (RESEARCH Pitfall 3).

import { NextResponse } from "next/server";
import { createRouteHandlerSupabase } from "@/lib/supabase-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  let next = searchParams.get("next") ?? "/";

  // Open-redirect guard — `next` MUST be a relative path. Without this an
  // attacker could craft /auth/callback?next=https://evil.com and the cookie
  // would be set then the user shipped offsite (RESEARCH Pitfall 3).
  if (!next.startsWith("/")) next = "/";

  if (code) {
    const supabase = await createRouteHandlerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Successful exchange — cookie is now set. Redirect to `next`.
      // x-forwarded-host handling per Supabase Next.js guide (Vercel preview
      // deploys forward via the proxy host).
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) return NextResponse.redirect(`${origin}${next}`);
      if (forwardedHost) return NextResponse.redirect(`https://${forwardedHost}${next}`);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Code missing or exchange failed — bounce to sign-in with an error flag.
  return NextResponse.redirect(`${origin}/sign-in?error=callback`);
}
