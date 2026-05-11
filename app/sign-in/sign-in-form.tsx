// File: app/sign-in/sign-in-form.tsx
//
// Hand-rolled Bulgarian sign-in form (D-01, D-10) with email/password +
// Google OAuth button (D-02, AUTH-02).

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase-browser";

type Status = "idle" | "submitting" | "ok" | "error";

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit =
    email.trim().length > 0 && password.length > 0 && status !== "submitting";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("submitting");
    setErrorMessage(null);

    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setStatus("error");
      setErrorMessage(translateAuthError(error.message));
      return;
    }

    setStatus("ok");
    router.push("/");
  }

  async function onGoogleSignIn() {
    setStatus("submitting");
    setErrorMessage(null);

    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // /auth/callback handles the PKCE code exchange — RESEARCH §Pattern 5.
        redirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMessage("Грешка при вход с Google. Моля, опитайте отново.");
    }
    // On success, Supabase initiates a redirect — no further code runs here.
  }

  return (
    <div className="w-full max-w-md space-y-4">
      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-md border border-black/[0.08] dark:border-white/[0.08] bg-stone-50 dark:bg-stone-900 p-6"
      >
        <div className="space-y-1">
          <label htmlFor="signin-email" className="block text-sm font-medium">
            Имейл
          </label>
          <input
            id="signin-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-md border border-black/[0.12] dark:border-white/[0.12] bg-white dark:bg-stone-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="signin-password" className="block text-sm font-medium">
            Парола
          </label>
          <input
            id="signin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-md border border-black/[0.12] dark:border-white/[0.12] bg-white dark:bg-stone-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        {status === "error" && errorMessage ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {errorMessage}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "submitting" ? "Изпращане…" : "Влез"}
        </button>
      </form>

      <div className="flex items-center gap-3 text-xs text-black/55 dark:text-white/55">
        <span className="h-px flex-1 bg-black/[0.12] dark:bg-white/[0.12]" />
        <span>или</span>
        <span className="h-px flex-1 bg-black/[0.12] dark:bg-white/[0.12]" />
      </div>

      <button
        type="button"
        onClick={onGoogleSignIn}
        disabled={status === "submitting"}
        className="w-full rounded-md border border-black/[0.12] dark:border-white/[0.12] bg-white dark:bg-stone-800 px-4 py-2 text-sm font-medium hover:bg-stone-100 dark:hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Влез с Google
      </button>

      <p className="text-center text-sm text-black/65 dark:text-white/65">
        Нямаш профил?{" "}
        <Link
          href="/sign-up"
          className="hover:underline underline-offset-4 text-red-700 dark:text-red-400"
        >
          Регистрирай се
        </Link>
      </p>
    </div>
  );
}

function translateAuthError(msg: string): string {
  if (/Invalid login credentials/i.test(msg)) return "Невалидни данни за вход.";
  if (/Email not confirmed/i.test(msg))
    return "Имейлът Ви още не е потвърден. Проверете пощата си.";
  if (/Email/i.test(msg)) return "Невалиден имейл адрес.";
  return "Грешка при вход. Моля, опитайте отново.";
}
