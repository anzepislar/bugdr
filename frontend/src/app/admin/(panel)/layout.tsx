import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { ADMIN_COOKIE } from "@/lib/session";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000"; // same default as next.config.ts

// Admin pages (D48). The proxy has already checked the admin session; this only loads the email for the sidebar.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = (await cookies()).get(ADMIN_COOKIE);
  const res = await fetch(`${BACKEND_URL}/api/v1/admin/me`, {
    headers: session ? { Cookie: `${ADMIN_COOKIE}=${session.value}` } : {},
    cache: "no-store",
  });
  if (!res.ok) redirect("/admin/login");
  const { admin } = (await res.json()) as { admin: { email: string } };
  return <AdminShell email={admin.email}>{children}</AdminShell>;
}
