import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app/AppShell";
import { SessionProvider } from "@/components/app/Session";
import { SESSION_COOKIE } from "@/lib/session";
import { serverFetch } from "@/lib/serverApi";
import type { ContestList } from "@/lib/types/contest";
import type { Me } from "@/lib/types/dashboard";
import type { ProfileSettings } from "@/lib/types/profile";

// Sidebar + top bar for the app pages. The (app) group does not change URLs.
// Dashboard and problems are public; the shell switches to a guest version without a valid session.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const [me, liveContests] = await Promise.all([getMe(), getLiveContestCount()]);
  return (
    <SessionProvider me={me}>
      <AppShell liveContests={liveContests}>{children}</AppShell>
    </SessionProvider>
  );
}

async function getMe(): Promise<Me | null> {
  if (!(await cookies()).has(SESSION_COOKIE)) return null;
  const res = await serverFetch("/me/profile");
  if (!res.ok) return null;
  const { username, email, settings } = (await res.json()) as { username: string; email: string; settings: ProfileSettings };
  return { username, email, displayName: settings.displayName, goalRole: settings.goalRole, experienceLevel: settings.experienceLevel };
}

// Sidebar badge. ponytail: loads the whole contest list for one number; add a count endpoint if the list grows large.
async function getLiveContestCount(): Promise<number> {
  const res = await serverFetch("/contests");
  return res.ok ? ((await res.json()) as ContestList).live.length : 0;
}
