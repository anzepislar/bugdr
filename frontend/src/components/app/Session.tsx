"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { loginHref } from "@/lib/session";
import type { Me } from "@/lib/types/dashboard";

// The signed-in user (null = guest), loaded by the (app) layout.
const SessionContext = createContext<Me | null>(null);

export function SessionProvider({ me, children }: { me: Me | null; children: ReactNode }) {
  return <SessionContext.Provider value={me}>{children}</SessionContext.Provider>;
}

export const useSignedIn = () => useContext(SessionContext) !== null;
export const useMe = () => useContext(SessionContext);

/** Login link that comes back to the current page. */
export function useLoginHref() {
  return loginHref(usePathname());
}

/**
 * Clears the session cookie on the server, then reloads the current page as a full load: that drops the client
 * router cache, so no prefetched account page survives the logout. Account-only pages go to login via the proxy.
 */
export function useLogout() {
  return async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    window.location.reload();
  };
}

/** Account-only content: blurred, not interactive, with a "Log in to unlock" card on top. */
export function Locked({ label, children }: { label: string; children: ReactNode }) {
  const login = useLoginHref();
  return (
    <div className="relative">
      <div aria-hidden inert className="pointer-events-none select-none blur-sm">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="flex max-w-xs flex-col items-center rounded border border-border bg-surface p-5 text-center">
          <Icon name="lock" className="h-5 w-5 text-muted" />
          <p className="mt-3 text-sm text-text">Log in to unlock {label}.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link href={login} className="rounded bg-action px-4 py-2 text-sm font-medium text-canvas hover:opacity-90">
              Log in
            </Link>
            <Link href="/signup" className="rounded border border-border px-4 py-2 text-sm text-text hover:border-action">
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
