import Link from "next/link";
import { ApiKeyForm, type ApiKeyStatus } from "@/components/settings/ApiKeyForm";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { serverFetch } from "@/lib/serverApi";
import type { ProfileSettings } from "@/lib/types/profile";

const TABS = { profile: "Profile", practice: "Practice preferences", account: "Account" } as const;
type Tab = keyof typeof TABS;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: rawTab } = await searchParams;
  const tab: Tab = rawTab && rawTab in TABS ? (rawTab as Tab) : "profile";
  const res = await serverFetch("/me/profile");
  if (!res.ok) throw new Error(`GET /me/profile failed: ${res.status}`);
  const { username, settings } = (await res.json()) as { username: string; settings: ProfileSettings };
  let apiKey: ApiKeyStatus | null = null;
  if (tab === "account") {
    const keyRes = await serverFetch("/me/api-key/status");
    if (!keyRes.ok) throw new Error(`GET /me/api-key/status failed: ${keyRes.status}`);
    apiKey = (await keyRes.json()) as ApiKeyStatus;
  }

  return (
    <div className="w-full px-6 py-8 wide:mx-auto wide:max-w-[1200px]">
      <h1 className="text-3xl font-semibold text-text">Settings</h1>
      <p className="mt-2 text-muted">Manage your profile and personalize your practice.</p>

      <nav aria-label="Settings sections" className="mt-8 flex gap-8 overflow-x-auto border-b border-border">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Link
            key={t}
            href={t === "profile" ? "/settings" : `/settings?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={`shrink-0 border-b-2 pb-3 text-sm ${
              t === tab ? "border-action font-semibold text-action" : "border-transparent text-muted hover:text-text"
            }`}
          >
            {TABS[t]}
          </Link>
        ))}
      </nav>

      {tab === "profile" ? (
        <ProfileForm initial={settings} profileHref={`/profile/${username}`} />
      ) : apiKey ? (
        // S6: the account tab holds only the own API key for now; email and password come with D35.
        <ApiKeyForm initial={apiKey} />
      ) : (
        // ponytail: no design for this tab yet (D35).
        <p className="mt-8 rounded border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {TABS[tab]} settings are coming soon.
        </p>
      )}
    </div>
  );
}
