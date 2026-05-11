"use client";

import { useState } from "react";

export function ProfileSignOutButton() {
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    setSubmitting(true);
    try {
      // Server route clears the cookie atomically + responds with 303.
      // Manual GET on / after the POST avoids relying on the redirect for
      // a cleaner browser-side state reset.
      await fetch("/api/auth/sign-out", { method: "POST", redirect: "manual" });
    } finally {
      window.location.href = "/";
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={submitting}
      className="rounded-md border border-red-700 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-60 dark:border-red-400 dark:text-red-400 dark:hover:bg-red-950/40"
    >
      {submitting ? "Излизане…" : "Изход"}
    </button>
  );
}
