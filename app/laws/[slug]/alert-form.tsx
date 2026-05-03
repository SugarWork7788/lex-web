"use client";

import { useState } from "react";

type Status = "idle" | "submitting" | "ok" | "error";

export function AlertForm({
  slug,
  nameBg,
}: {
  slug: string;
  nameBg: string;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("submitting");
    setMessage(null);
    try {
      const res = await fetch("/api/alerts/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), slug, name_bg: nameBg }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setStatus("error");
        setMessage(data.error || `HTTP ${res.status}`);
        return;
      }
      setStatus("ok");
      if (data.alreadySubscribed) {
        setMessage(
          data.emailSent
            ? "Вече сте абонирани. Изпратихме нов имейл за потвърждение."
            : "Вече сте абонирани за този закон.",
        );
      } else if (data.emailSent) {
        setMessage(
          "Ще получите имейл за потвърждение. Проверете и спам папката.",
        );
      } else {
        setMessage(
          "Абонаментът е записан. (Имейл услугата е в режим на разработка — потвърждение няма да пристигне.)",
        );
      }
      setEmail("");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="mt-12 rounded-lg border border-indigo-300 bg-indigo-50/60 px-5 py-4 dark:border-indigo-800/60 dark:bg-indigo-950/30 print:hidden">
      <h2 className="font-serif text-lg font-semibold text-indigo-900 dark:text-indigo-100">
        🔔 Известия при промяна на закона
      </h2>
      <p className="mt-1 text-sm text-indigo-900/80 dark:text-indigo-100/80">
        Ще получите имейл, когато бъдат внесени значими изменения в този закон.
      </p>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "submitting"}
          placeholder="вашият@имейл.bg"
          className="flex-1 rounded-md border border-indigo-300 bg-white px-3 py-2 text-sm text-black focus:border-indigo-600 focus:outline-none disabled:opacity-60 dark:border-indigo-700 dark:bg-white/[0.04] dark:text-white"
        />
        <button
          type="submit"
          disabled={status === "submitting" || !email.trim()}
          className="rounded-md bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-500"
        >
          {status === "submitting" ? "…" : "Абонирай се"}
        </button>
      </form>
      {message && (
        <p
          className={`mt-2 text-xs ${
            status === "error"
              ? "text-red-700 dark:text-red-400"
              : "text-emerald-700 dark:text-emerald-400"
          }`}
        >
          {message}
        </p>
      )}
    </section>
  );
}
