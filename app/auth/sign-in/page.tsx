import { redirect } from "next/navigation";

// Backward-compat redirect: canonical route is /sign-in (CONTEXT D-04).
// Some operators have muscle memory for /auth/sign-in — this 308s them
// to the right place. Phase 5's middleware/proxy still treats /sign-in
// as the auth surface; this page stays a thin alias.
export default function AuthSignInRedirect() {
  redirect("/sign-in");
}
