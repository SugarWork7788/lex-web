// File: app/auth-nav-link.tsx
//
// Navbar auth state link (D-09). Reactive via useSession() (Plan 04-02).
// "Влез" anonymous → /sign-in. "Профил" signed-in → /profile (basic
// view — display_name + email + созданация date + sign-out button — landed
// in Phase 4 as a follow-up; full account UX still planned for Phase 6).
// Note: ROADMAP/REQUIREMENTS Phase 6 still uses "/account" naming —
// when Phase 6 starts, decide whether to rename Phase 6 spec to /profile
// or alias /account → /profile (FAV-05 backlog already uses /profile/saved).
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
        href="/profile"
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
