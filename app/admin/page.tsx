// File: app/admin/page.tsx
//
// LEX.BRAIN operations dashboard. Server component does the auth/admin
// gate (requireAdmin → redirects non-admins to /). The client component
// owns the 30s auto-refresh against /api/admin/stats.

import { requireAdmin } from "@/lib/require-admin";
import { AdminDashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Admin · LEX.BRAIN operations",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  await requireAdmin("/admin");
  return <AdminDashboardClient />;
}
