// File: app/sign-up/page.tsx
//
// Server Component shell. Renders the hand-rolled <SignUpForm /> in the
// site's standard centered card layout. Bulgarian heading per D-10.

import type { Metadata } from "next";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = {
  title: "Регистрация",
  description: "Регистрирайте се в lex.bg, за да получите достъп до AI инструменти за анализ на българското законодателство.",
};

export default function SignUpPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <h1 className="font-serif text-2xl font-semibold tracking-tight text-center mb-6">
        Регистрирайте се
      </h1>
      <SignUpForm />
    </div>
  );
}
