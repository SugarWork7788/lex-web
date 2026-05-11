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

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  DEFAULT_AVATAR_ID,
  GOOGLE_AVATAR_ID,
  getAvatarById,
} from "@/lib/avatars";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { useSession } from "@/lib/use-session";

// Renders a tiny circular avatar + "Профил" when signed in.
// Avatar source priority:
//   1. user_profiles.avatar_id ('google' → user.user_metadata.avatar_url; preset id → /avatars/{id}.png)
//   2. DEFAULT_AVATAR_ID
// Fetches avatar_id once per session via supabase.from('user_profiles')
// (anon-key client; RLS lets users read their own row).
export function AuthNavLink() {
  const { user, loading } = useSession();
  const [avatarId, setAvatarId] = useState<string>(DEFAULT_AVATAR_ID);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const supabase = createBrowserSupabase();
    supabase
      .from("user_profiles")
      .select("avatar_id")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        setAvatarId(data?.avatar_id ?? DEFAULT_AVATAR_ID);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading) return null;

  if (user) {
    const googleUrl =
      (user.user_metadata as { avatar_url?: string } | undefined)?.avatar_url ?? null;
    const useGoogle = avatarId === GOOGLE_AVATAR_ID && googleUrl;
    const presetSrc = getAvatarById(avatarId).file;
    const src = useGoogle ? googleUrl : presetSrc;

    return (
      <Link
        href="/profile"
        className="flex items-center gap-2 hover:underline underline-offset-4"
      >
        <span className="relative h-6 w-6 overflow-hidden rounded-full ring-1 ring-stone-300 dark:ring-stone-700">
          <Image
            src={src}
            alt=""
            fill
            sizes="24px"
            unoptimized={Boolean(useGoogle)}
            className="object-cover"
          />
        </span>
        <span>Профил</span>
      </Link>
    );
  }

  return (
    <Link href="/sign-in" className="hover:underline underline-offset-4">
      Влез
    </Link>
  );
}
