// File: lib/use-session.ts
//
// Client-side reactive auth state hook.
// Uses getSession() (browser cookie read) — fast, no roundtrip — to drive UI.
// SECURITY: this hook is for UI display only. Authorization checks belong on
// the server (use getSession() from lib/supabase-auth.ts which calls getUser()).

"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createBrowserSupabase } from "@/lib/supabase-browser";

export function useSession(): { user: User | null; loading: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserSupabase();

    // Initial fetch — getSession reads from local cookies (fast, no roundtrip).
    // Hook is for UI reactivity; security checks happen on the server.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Subscribe to subsequent state changes (sign-in / sign-out / token-refresh).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  return { user, loading };
}
