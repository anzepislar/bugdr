import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app/AppShell";
import { SessionProvider } from "@/components/app/Session";
import { SESSION_COOKIE } from "@/lib/session";
import { serverFetch } from "@/lib/serverApi";
import type { Me } from "@/lib/types/dashboard";
import type { ProfileSettings } from "@/lib/types/profile";

// Sidebar + top bar for the app pages. The (app) group does not change URLs.
// Dashboard and problems are public; the shell switches to a guest version without a valid session.
export default async function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider me={await getMe()}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}

async function getMe(): Promise<Me | null> {
  if (!(await cookies()).has(SESSION_COOKIE)) return null;
  const res = await serverFetch("/me/profile");
  if (!res.ok) return null;
  const { username, settings } = (await res.json()) as { username: string; settings: ProfileSettings };
  return { username, displayName: settings.displayName, goalRole: settings.goalRole, experienceLevel: settings.experienceLevel };
}
