// File: lib/supabase-auth.ts
//
// Auth-aware Supabase factories for Next 16 App Router.
// Owns: per-request cookie binding (browser, Server Component, Route Handler).
// Does NOT touch lib/supabase.ts (data client, persistSession:false, 11 importers — D-07).
//
// Source: Context7 /supabase/ssr (verified 2026-05-11) + Next 16 docs in
// node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md

import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
  );
}

/** Browser-side factory — call in any "use client" component. */
export function createBrowserSupabase() {
  return createBrowserClient(SUPABASE_URL!, SUPABASE_KEY!);
}

/** Server Component factory — read-only (cannot set cookies during streaming). */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL!, SUPABASE_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      // setAll deliberately omitted — Server Components cannot set cookies.
      // Setting cookies happens only in Route Handlers and Server Actions.
    },
  });
}

/** Route Handler factory — full read+write. */
export async function createRouteHandlerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL!, SUPABASE_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}

/**
 * Server-side auth helper. Returns the verified User or null.
 * Uses getUser() (network roundtrip) NOT getSession() (cookie read) for
 * security — getSession is spoofable on the server (RESEARCH Pitfall 5).
 *
 * Naming note: AUTH-04 calls this `getSession()` for symmetry with the
 * `useSession()` client hook. Internally calls `getUser()` per Supabase's
 * security guidance ("Never trust `getSession()` inside server code").
 *
 * Phase 4 surface area: navbar auth state. Phase 5 will cache this with
 * React's `cache()` to dedupe per-render-pass.
 */
export async function getSession(): Promise<User | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
