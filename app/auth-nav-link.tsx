// File: app/auth-nav-link.tsx
//
// Navbar auth state link (D-09). Reactive via useSession().
// "Влез" anonymous → /sign-in. "Профил" + tiny avatar signed-in → /profile.
//
// Avatar source priority:
//   1. avatar_id is a PRESET id (Bulgarian historical figure) → /avatars/{id}.png
//   2. avatar_id === 'google' AND user_metadata.avatar_url → Google photo
//   3. otherwise → InitialsAvatar (colored circle with first letter of display_name)

"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GOOGLE_AVATAR_ID, getPresetAvatar } from "@/lib/avatars";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { useSession } from "@/lib/use-session";
import { InitialsAvatar } from "./_components/initials-avatar";

export function AuthNavLink() {
  const { user, loading } = useSession();
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const supabase = createBrowserSupabase();
    supabase
      .from("user_profiles")
      .select("avatar_id, display_name")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        setAvatarId(data?.avatar_id ?? null);
        setDisplayName(data?.display_name ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading) return null;

  if (user) {
    const googleUrl =
      (user.user_metadata as { avatar_url?: string } | undefined)?.avatar_url ?? null;
    const preset = getPresetAvatar(avatarId);
    const useGoogle = avatarId === GOOGLE_AVATAR_ID && googleUrl;
    const fallbackName = displayName ?? user.email?.split("@")[0] ?? null;

    return (
      <Link
        href="/profile"
        className="flex items-center gap-2 hover:underline underline-offset-4"
      >
        <span aria-hidden="true">
          {preset ? (
            <span className="relative inline-block h-6 w-6 overflow-hidden rounded-full ring-1 ring-stone-300 dark:ring-stone-700">
              <Image
                src={preset.file}
                alt=""
                fill
                sizes="24px"
                className="object-cover"
              />
            </span>
          ) : useGoogle ? (
            <span className="relative inline-block h-6 w-6 overflow-hidden rounded-full ring-1 ring-stone-300 dark:ring-stone-700">
              <Image
                src={googleUrl}
                alt=""
                fill
                sizes="24px"
                unoptimized
                className="object-cover"
              />
            </span>
          ) : (
            <InitialsAvatar userId={user.id} displayName={fallbackName} size={24} />
          )}
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
