// File: app/auth-nav-link.tsx
//
// Navbar auth state link (D-09). Reactive via useSession() (Plan 04-02).
// "Влез" anonymous → /sign-in. "Профил" signed-in → /account (Phase 6
// will populate /account; for Phase 4 the link still works — just lands
// on a 404 until Phase 5+6 land).
//
// Renders nothing while loading to prevent SSR/CSR text flash. The layout
// is a Server Component, so the navbar renders without this link first;
// the client hook then fills in the appropriate label.

"use client";

import Link from "next/link";
import { useSession } from "@/lib/use-session";

export function AuthNavLink() {
  const { user, loading } = useSession();

  if (loading) return null;

  if (user) {
    return (
      <Link
        href="/account"
        className="hover:underline underline-offset-4"
      >
        Профил
      </Link>
    );
  }

  return (
    <Link href="/sign-in" className="hover:underline underline-offset-4">
      Влез
    </Link>
  );
}
