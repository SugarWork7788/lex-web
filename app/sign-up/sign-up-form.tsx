// File: app/sign-up/sign-up-form.tsx
//
// Hand-rolled Bulgarian sign-up form (D-01, D-10).
// Uses the alert-form.tsx state-machine pattern: useState + onSubmit + Status enum.
// Magic-link verification (D-02): success routes to /sign-up/check-email.
// display_name (D-03) flows into raw_user_meta_data, read by the handle_new_user
// trigger from Plan 04-01.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase-browser";

type Status = "idle" | "submitting" | "ok" | "error";

export function SignUpForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit =
    email.trim().length > 0 &&
    password.length > 0 &&
    displayName.trim().length > 0 &&
    status !== "submitting";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("submitting");
    setErrorMessage(null);

    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // Magic link lands on /auth/callback?code=xxx — exchanges for session,
        // then redirects to `next` (default /). RESEARCH §Pattern 5.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,
        data: {
          // Read by handle_new_user() trigger (D-03, D-05).
          display_name: displayName.trim(),
        },
      },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(translateAuthError(error.message));
      return;
    }

    setStatus("ok");
    router.push("/sign-up/check-email");
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-md space-y-4 rounded-md border border-black/[0.08] dark:border-white/[0.08] bg-stone-50 dark:bg-stone-900 p-6"
    >
      <div className="space-y-1">
        <label htmlFor="signup-email" className="block text-sm font-medium">
          Имейл
        </label>
        <input
          id="signup-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-md border border-black/[0.12] dark:border-white/[0.12] bg-white dark:bg-stone-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="signup-password" className="block text-sm font-medium">
          Парола
        </label>
        <input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full rounded-md border border-black/[0.12] dark:border-white/[0.12] bg-white dark:bg-stone-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="signup-display-name" className="block text-sm font-medium">
          Име
        </label>
        <input
          id="signup-display-name"
          type="text"
          autoComplete="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          className="w-full rounded-md border border-black/[0.12] dark:border-white/[0.12] bg-white dark:bg-stone-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>

      {status === "error" && errorMessage ? (
        <p
          role="alert"
          className="text-sm text-red-700 dark:text-red-400"
        >
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "submitting" ? "Изпращане…" : "Регистрирай се"}
      </button>

      <p className="text-center text-sm text-black/65 dark:text-white/65">
        Имаш профил?{" "}
        <Link href="/sign-in" className="hover:underline underline-offset-4 text-red-700 dark:text-red-400">
          Влез
        </Link>
      </p>
    </form>
  );
}

function translateAuthError(msg: string): string {
  // Map common Supabase Auth error families to formal-legal Bulgarian (D-10).
  if (/already registered/i.test(msg)) return "Този имейл е вече регистриран.";
  if (/Password/i.test(msg)) return "Невалидна парола (минимум 6 символа).";
  if (/Email/i.test(msg)) return "Невалиден имейл адрес.";
  return "Грешка при регистрация. Моля, опитайте отново.";
}
