// File: app/sign-up/check-email/page.tsx
//
// Magic-link landing — D-02 (no OTP UI). User arrives here after a successful
// supabase.auth.signUp(). Reads the email, clicks the link, lands on
// /auth/callback which exchanges the code → session cookie → home.

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Потвърдете имейла си",
  description: "Изпратихме потвърждение на имейла Ви. Натиснете върху линка в имейла, за да завършите регистрацията.",
};

export default function CheckEmailPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6 text-center">
      <h1 className="font-serif text-2xl font-semibold tracking-tight mb-4">
        Изпратихме потвърждение на имейла Ви
      </h1>
      <p className="text-sm text-black/75 dark:text-white/75 mb-6">
        Натиснете върху линка в имейла, за да завършите регистрацията.
        Ако не виждате имейла, проверете и спам папката.
      </p>
      <Link
        href="/sign-in"
        className="text-sm hover:underline underline-offset-4 text-red-700 dark:text-red-400"
      >
        Към вход
      </Link>
    </div>
  );
}
