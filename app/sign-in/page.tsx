// File: app/sign-in/page.tsx

import type { Metadata } from "next";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Вход",
  description: "Влезте в профила си в lex.bg.",
};

export default function SignInPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <h1 className="font-serif text-2xl font-semibold tracking-tight text-center mb-6">
        Влезте в профила си
      </h1>
      <SignInForm />
    </div>
  );
}
