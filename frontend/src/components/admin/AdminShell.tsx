"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { api } from "@/lib/api";

// Sidebar + top bar for /admin (D48): the admin is not a user, so no avatar, level, search or user links.

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/admin", label: "Overview", icon: "dashboard" },
  { href: "/admin/problems", label: "Problems", icon: "problems" },
  { href: "/admin/contests", label: "Contests", icon: "trophy" },
  { href: "/admin/users", label: "Users", icon: "user" },
  { href: "/admin/analytics", label: "Analytics", icon: "ranking" },
  { href: "/admin/career-paths", label: "Career paths", icon: "stairs" },
];

const CRUMB: [RegExp, string][] = [
  [/^\/admin$/, "Overview"],
  [/^\/admin\/problems\/new$/, "Add problem"],
  [/^\/admin\/problems\/[^/]+\/edit$/, "Edit problem"],
  [/^\/admin\/problems$/, "Problems"],
  [/^\/admin\/contests\/new$/, "New contest"],
  [/^\/admin\/contests\/[^/]+\/edit$/, "Edit contest"],
  [/^\/admin\/contests/, "Contests"],
  [/^\/admin\/users\/[^/]+$/, "User"],
  [/^\/admin\/users$/, "Users"],
];

/** Full page load to /admin/login, so no cached admin page survives the logout (as useLogout does for users). */
async function logout() {
  await api("/admin/logout", { method: "POST" }).catch(() => {});
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load is the point here
  window.location.href = "/admin/login";
}

export function AdminShell({ email, children }: { email: string; children: ReactNode }) {
  const pathname = usePathname();
  // Overview matches /admin only, the rest by prefix.
  const isActive = (href: string) =>
    href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const crumb = CRUMB.find(([re]) => re.test(pathname))?.[1];

  return (
    <div className="flex min-h-screen flex-1">
      <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r border-border bg-canvas px-3 py-4 lg:flex">
        <Link href="/admin" className="mb-6 px-2">
          <Image src="/logo/bugdr-logo.png" alt="Bugdr" width={447} height={126} priority className="h-10 w-auto" />
        </Link>

        <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wide text-muted">Admin</p>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`flex items-center gap-3 rounded px-3 py-2.5 text-sm ${
                isActive(item.href) ? "bg-surface font-semibold text-text" : "text-muted hover:text-text"
              }`}
            >
              <Icon name={item.icon} className={`h-5 w-5 ${isActive(item.href) ? "text-action" : ""}`} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-1">
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-3 rounded px-3 py-2 text-sm text-failed hover:opacity-80"
          >
            <Icon name="logout" /> Log out
          </button>
          <p className="mt-3 truncate border-t border-border px-2 pt-4 text-xs text-muted">{email}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-border px-4 py-3 sm:px-8">
          <Link href="/admin" className="lg:hidden">
            <Image src="/logo/bugdr-mark.png" alt="Bugdr" width={90} height={126} className="h-8 w-auto" />
          </Link>
          <nav aria-label="Breadcrumb" className="hidden items-center gap-3 text-sm sm:flex">
            <span className="text-muted">Admin</span>
            <Icon name="chevronRight" className="h-3.5 w-3.5 text-muted" />
            <span className="text-text">{crumb}</span>
          </nav>
          <button
            type="button"
            onClick={logout}
            className="ml-auto shrink-0 text-sm text-failed hover:opacity-80 lg:hidden"
          >
            Log out
          </button>
        </header>

        {/* Below lg the sidebar collapses into this strip. */}
        <nav className="flex gap-1 overflow-x-auto border-b border-border px-4 py-2 lg:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`shrink-0 rounded px-3 py-1.5 text-sm ${
                isActive(item.href) ? "bg-surface font-semibold text-text" : "text-muted"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
