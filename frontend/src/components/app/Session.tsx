"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { loginHref } from "@/lib/session";

// Whether a user is signed in, read from the session cookie by the (app) layout.
const SessionContext = createContext(false);

export function SessionProvider({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  return <SessionContext.Provider value={signedIn}>{children}</SessionContext.Provider>;
}

export const useSignedIn = () => useContext(SessionContext);

/** Login link that comes back to the current page. */
export function useLoginHref() {
  return loginHref(usePathname());
}

/**
 * Clears the session cookie on the server, then loads /login as a full page: that drops the client router
 * cache, so no prefetched account page (or redirect to one) survives the logout.
 */
export function useLogout() {
  return async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load is the point here
    window.location.href = "/login";
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
