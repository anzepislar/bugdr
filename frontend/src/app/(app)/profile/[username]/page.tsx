import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityGrid, heatClass } from "@/components/ActivityGrid";
import { secondaryButton } from "@/components/admin/problems/shared";
import { ContestHistory } from "@/components/contests/ContestHistory";
import { Icon } from "@/components/Icon";
import { ShareProfileButton } from "@/components/profile/ShareProfileButton";
import { SolvedProblems } from "@/components/profile/SolvedProblems";
import { serverFetch } from "@/lib/serverApi";
import type { PrivateProfile, Profile } from "@/lib/types/profile";

const TABS = { overview: "Overview", solved: "Solved problems", contests: "Contest history" } as const;
type Tab = keyof typeof TABS;

// Rendered per request, so "Today" and the activity grid are as of this load.
async function load(username: string) {
  const res = await serverFetch(`/users/${encodeURIComponent(username)}`);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`GET /users/${username} failed: ${res.status}`);
  const { profile } = (await res.json()) as { profile: Profile | PrivateProfile };
  return { profile, now: Date.now() };
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ username }, { tab: rawTab }] = await Promise.all([params, searchParams]);
  const { profile, now } = await load(username);

  const tab: Tab = rawTab && rawTab in TABS ? (rawTab as Tab) : "overview";
  const isMe = profile.own;
  const base = `/profile/${profile.username}`;

  return (
    <div className="w-full px-6 py-8 wide:mx-auto wide:max-w-[1200px]">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <span
          aria-hidden
          className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-action text-3xl font-semibold text-canvas"
        >
          {profile.displayName[0]}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold text-text">{profile.displayName}</h1>
          {"stats" in profile ? (
            <p className="mt-2 text-muted">
              {[profile.headline, profile.languages.join(", ")].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
        {profile.isPublic || isMe ? (
          <div className="flex flex-wrap gap-4">
            {isMe ? (
              <Link href="/settings" className={`${secondaryButton} px-6 py-2.5`}>
                Edit profile
              </Link>
            ) : null}
            {profile.isPublic ? <ShareProfileButton path={base} /> : null}
          </div>
        ) : null}
      </div>

      {!("stats" in profile) ? (
        <section
          aria-label="Profile is private"
          className="mt-8 flex items-start gap-4 rounded border border-border bg-surface p-5"
        >
          <Icon name="lock" className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
          <p className="text-sm text-text">
            <span className="font-semibold">This profile is private</span> — only {profile.displayName} can see their
            progress.
          </p>
        </section>
      ) : (
        <>
          <nav aria-label="Profile sections" className="mt-8 flex gap-8 overflow-x-auto border-b border-border">
            {(Object.keys(TABS) as Tab[]).map((t) => (
              <Link
                key={t}
                href={t === "overview" ? base : `${base}?tab=${t}`}
                aria-current={t === tab ? "page" : undefined}
                className={`shrink-0 border-b-2 pb-3 text-sm ${
                  t === tab ? "border-action font-semibold text-action" : "border-transparent text-muted hover:text-text"
                }`}
              >
                {TABS[t]}
              </Link>
            ))}
          </nav>

          {tab === "overview" ? <Overview profile={profile} now={now} base={base} /> : null}
          {tab === "solved" ? (
            <section aria-label="Solved problems" className="mt-8">
              <SolvedProblems items={profile.solved} now={now} infinite />
            </section>
          ) : null}
          {tab === "contests" ? (
            <section aria-label="Contest history" className="mt-4">
              <ContestHistory entries={profile.contests} />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function Overview({ profile, now, base }: { profile: Profile; now: number; base: string }) {
  const { stats } = profile;
  const solvedThisYear = profile.activity.reduce((sum, a) => sum + a.problemsSolved, 0);
  const statList = [
    { value: stats.problemsSolved.toLocaleString("en-US"), label: "Problems solved" },
    { value: stats.totalPoints.toLocaleString("en-US"), label: "Total points" },
    { value: stats.level.name, label: "Current level" },
    { value: `${stats.currentStreak} ${stats.currentStreak === 1 ? "day" : "days"}`, label: "Current streak" },
  ];

  return (
    <>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-8 border-b border-border py-8 md:grid-cols-4">
        {statList.map((s) => (
          <div key={s.label} className="flex min-w-0 flex-col-reverse justify-end">
            <dt className="mt-2 text-sm text-muted">{s.label}</dt>
            <dd className="text-3xl font-semibold tabular-nums text-text">{s.value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="activity-heading" className="mt-8 border-b border-border pb-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="activity-heading" className="text-xl font-semibold text-text">
            Activity
          </h2>
          <span className="text-sm text-muted">Last 12 months</span>
        </div>
        <div className="mt-6">
          <ActivityGrid activity={profile.activity} now={now} weeks={53} dayLabels />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-sm text-muted">
          <p>{solvedThisYear} problems solved in the last year</p>
          <p className="flex items-center gap-1.5 text-xs" aria-hidden>
            Less
            {[0, 1, 2, 3].map((n) => (
              <span key={n} className={`h-2.5 w-2.5 rounded-[2px] ${heatClass(n)}`} />
            ))}
            More
          </p>
        </div>
        <p className="mt-6 text-text">
          {stats.currentStreak}-day practice streak · Best: {stats.longestStreak} days
        </p>
        <p className="mt-2 text-sm text-muted">
          Opening a problem keeps your streak. The activity grid counts solved problems.
        </p>
      </section>

      <section aria-labelledby="solved-heading" className="mt-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="solved-heading" className="text-xl font-semibold text-text">
            Solved problems
          </h2>
          {profile.solved.length > 3 ? (
            <Link href={`${base}?tab=solved`} className="flex items-center gap-2 text-sm text-action hover:underline">
              View all {profile.solved.length} <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
        <SolvedProblems items={profile.solved.slice(0, 3)} now={now} />
      </section>
    </>
  );
}
