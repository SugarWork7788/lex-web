import { redirect } from "next/navigation";

// Backward-compat redirect: canonical route is /sign-up (CONTEXT D-04).
// Some operators have muscle memory for /auth/sign-up — this 308s them
// to the right place. The hand-rolled Bulgarian sign-up form lives at
// app/sign-up/page.tsx; this page stays a thin alias.
export default function AuthSignUpRedirect() {
  redirect("/sign-up");
}
