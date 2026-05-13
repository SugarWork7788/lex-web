// File: lib/require-admin.ts
//
// Admin gate for /admin operations dashboard. Builds on requireAuth():
//   1. requireAuth() redirects to /sign-in if no verified user.
//   2. We then check user.email against ADMIN_EMAIL (case-insensitive).
//   3. Non-admin authed users are redirected to "/" — the page never renders.
//
// Why redirect (not 403): we don't want to advertise the route's existence
// to logged-in non-admins. They get the same shape of redirect they would
// for any other private area.

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/require-auth";

export async function requireAdmin(returnTo: string): Promise<User> {
  const user = await requireAuth(returnTo);
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const userEmail = user.email?.trim().toLowerCase();
  if (!adminEmail || !userEmail || adminEmail !== userEmail) {
    redirect("/");
  }
  return user;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail || !email) return false;
  return adminEmail === email.trim().toLowerCase();
}
