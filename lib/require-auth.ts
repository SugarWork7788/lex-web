// File: lib/require-auth.ts
//
// Phase 5 (AUTH-05..07): server-side auth gate for protected routes.
//
// Usage (Server Component or Server Action):
//
//   import { requireAuth } from "@/lib/require-auth";
//
//   export default async function ProtectedPage() {
//     const user = await requireAuth("/this-page-path");
//     // user is guaranteed non-null here; otherwise we already redirected.
//     ...
//   }
//
// Why a helper:
//   - proxy.ts only does optimistic cookie checks (per Next 16 guidance —
//     no network roundtrips on prefetched routes).
//   - This helper is the real gate: it calls getSession() (which uses
//     supabase.auth.getUser() under the hood per security pitfall 5) and
//     redirects to /sign-in?returnTo=<path> if the session is missing /
//     expired / spoofed.
//   - Centralising the redirect target keeps every protected page consistent
//     with the proxy and avoids open-redirect risk (returnTo is always the
//     caller-supplied relative path, never user input).

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSession } from "@/lib/supabase-auth";

export async function requireAuth(returnTo: string): Promise<User> {
  const user = await getSession();
  if (!user) {
    redirect(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }
  return user;
}
