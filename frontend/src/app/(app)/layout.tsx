import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app/AppShell";
import { SessionProvider } from "@/components/app/Session";
import { SESSION_COOKIE } from "@/lib/session";

// Sidebar + top bar for the app pages. The (app) group does not change URLs.
// Dashboard and problems are public; the shell switches to a guest version without a session.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const signedIn = (await cookies()).has(SESSION_COOKIE);
  return (
    <SessionProvider signedIn={signedIn}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
