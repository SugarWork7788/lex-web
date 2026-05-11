// File: lib/supabase-browser.ts
//
// Browser-only Supabase factory. Split from lib/supabase-auth.ts so that
// "use client" modules (lib/use-session.ts, app/sign-in/sign-in-form.tsx,
// app/sign-up/sign-up-form.tsx, app/auth-nav-link.tsx) can import a
// Supabase browser client WITHOUT transitively pulling lib/supabase-auth.ts
// — which imports `next/headers`, a server-only API. Importing
// `next/headers` from a Client Component fails Next 16 build (Turbopack:
// "You're importing a module that depends on 'next/headers'. This API is
// only available in Server Components in the App Router…").
//
// Discovered during Plan 04-03 Task 2 build. Plan 04-02's build passed only
// because no production-graph component yet consumed useSession()/the
// browser factory. Once <AuthNavLink /> landed in app/layout.tsx, the
// latent bundling bug surfaced. Smallest fix: extract createBrowserSupabase
// into its own file with zero server-only imports.
//
// Source: Context7 /supabase/ssr (2026-05-11) — official pattern is to
// keep browser and server clients in separate files for App Router.

"use client";

import { createBrowserClient } from "@supabase/ssr";

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
