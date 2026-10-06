"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { MOCK_ACTIVE_CONTEST_COUNT, MOCK_ME } from "@/lib/mock/dashboard";
import { EXPERIENCE_LABEL } from "@/lib/types/dashboard";
import { CATEGORIES } from "@/lib/types/problem";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  badge?: number;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/problems", label: "Problems", icon: "problems" },
  { href: "/contests", label: "Contests", icon: "trophy", badge: MOCK_ACTIVE_CONTEST_COUNT },
  { href: `/profile/${MOCK_ME.username}`, label: "My profile", icon: "user" },
];

const goalRoleName = CATEGORIES.find((c) => c.slug === MOCK_ME.goalRole)?.name ?? "";

function Avatar({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-action font-medium text-canvas ${className}`}
    >
      {MOCK_ME.displayName[0]}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const current = NAV.find((item) => isActive(item.href));

  return (
    <div className="flex min-h-screen flex-1">
      <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r border-border bg-canvas px-3 py-4 lg:flex">
        <Link href="/dashboard" className="mb-6 px-2">
          <Image src="/logo/bugdr-logo.png" alt="Bugdr" width={447} height={126} priority className="h-10 w-auto" />
        </Link>

        <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wide text-muted">Workspace</p>
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
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span className="rounded bg-surface px-1.5 text-xs font-medium text-action">{item.badge}</span>
              ) : null}
            </Link>
          ))}
        </nav>

        <div className="mx-2 my-5 border-t border-border" />

        <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wide text-muted">Your path</p>
        <div className="px-2">
          <p className="flex items-center gap-3 text-sm font-semibold text-text">
            <Icon name="problems" className="h-5 w-5 text-action" />
            {goalRoleName}
          </p>
          <p className="mt-2 text-[11px] text-muted">
            Production experience: {EXPERIENCE_LABEL[MOCK_ME.experienceLevel]}
          </p>
        </div>

        <div className="mt-auto flex flex-col gap-1">
          {/* No routes yet for these two. */}
          <a href="#" className="flex items-center gap-3 rounded px-3 py-2 text-sm text-muted hover:text-text">
            <Icon name="settings" /> Settings
          </a>
          <a href="#" className="flex items-center gap-3 rounded px-3 py-2 text-sm text-muted hover:text-text">
            <Icon name="help" /> Help &amp; feedback
          </a>
          <div className="mt-3 flex items-center gap-3 border-t border-border px-2 pt-4">
            <Avatar className="h-9 w-9 text-sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text">{MOCK_ME.displayName}</p>
              <p className="truncate text-xs text-muted">Personal workspace</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-border px-4 py-3 sm:px-8">
          <Link href="/dashboard" className="lg:hidden">
            <Image src="/logo/bugdr-mark.png" alt="Bugdr" width={90} height={126} className="h-8 w-auto" />
          </Link>
          <nav aria-label="Breadcrumb" className="hidden items-center gap-3 text-sm sm:flex">
            <span className="text-muted">Workspace</span>
            <Icon name="chevronRight" className="h-3.5 w-3.5 text-muted" />
            <span className="text-text">
              {pathname.startsWith("/problems/")
                ? "Problem details"
                : pathname.startsWith("/contests/")
                  ? "Contest details"
                  : current?.label}
            </span>
          </nav>
          <form action="/problems" role="search" className="relative ml-auto w-full max-w-[275px]">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              name="q"
              placeholder="Search problems..."
              aria-label="Search problems"
              className="w-full rounded border border-border bg-canvas py-2 pl-9 pr-3 text-sm text-text placeholder:text-muted focus:border-action focus:outline-none"
            />
          </form>
          <button type="button" aria-label="Notifications" className="text-muted hover:text-text">
            <Icon name="bell" />
          </button>
          <Link href={`/profile/${MOCK_ME.username}`} aria-label="My profile">
            <Avatar className="h-9 w-9 text-sm" />
          </Link>
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
