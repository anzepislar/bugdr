import type { ReactNode } from "react";
import { AppShell } from "@/components/app/AppShell";

// Sidebar + top bar for the signed-in user pages. The (app) group does not change URLs.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
