import Link from "next/link";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { MOCK_ME } from "@/lib/mock/dashboard";
import { MOCK_SETTINGS } from "@/lib/mock/profile";

const TABS = { profile: "Profile", practice: "Practice preferences", account: "Account" } as const;
type Tab = keyof typeof TABS;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: rawTab } = await searchParams;
  const tab: Tab = rawTab && rawTab in TABS ? (rawTab as Tab) : "profile";

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
        <ProfileForm initial={MOCK_SETTINGS} profileHref={`/profile/${MOCK_ME.username}`} />
      ) : (
        // ponytail: no design for these two tabs yet (D35).
        <p className="mt-8 rounded border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {TABS[tab]} settings are coming soon.
        </p>
      )}
    </div>
  );
}
