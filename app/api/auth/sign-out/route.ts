// File: app/api/auth/sign-out/route.ts
//
// POST /api/auth/sign-out — clears the Supabase auth cookie atomically.
//
// Why server route, not client supabase.auth.signOut(): server-side signOut
// from a Route Handler is preferred because (a) Set-Cookie headers are
// atomic with the response, (b) it works even if the browser cookie store
// is in a weird state, (c) Phase 6's audit-vote auth check will reuse the
// same Route Handler pattern for cookie writes.

import { NextResponse } from "next/server";
import { rateLimited } from "@/lib/rate-limit";
import { createRouteHandlerSupabase } from "@/lib/supabase-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // Sign-out is a no-op for anonymous users; rate-limit defends against
  // someone hammering the endpoint with botnets.
  const limit = rateLimited(req, "auth-signout", { windowMs: 60_000, max: 20 });
  if (limit) return limit;

  const supabase = await createRouteHandlerSupabase();
  await supabase.auth.signOut(); // clears cookies

  return NextResponse.redirect(new URL("/", req.url), { status: 303 });
}
