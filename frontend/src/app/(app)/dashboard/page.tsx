"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Locked, useMe } from "@/components/app/Session";
import { ProgressPanel } from "@/components/dashboard/ProgressPanel";
import { RecommendedFeed } from "@/components/dashboard/RecommendedFeed";
import { DifficultyPill } from "@/components/DifficultyPill";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { countdown } from "@/lib/format";
import { mockGetDashboard } from "@/lib/mock/dashboard";
import type { ActiveContest, Dashboard, InProgressAttempt } from "@/lib/types/dashboard";

type MockDashboard = Awaited<ReturnType<typeof mockGetDashboard>>;

const pad = (n: number) => String(n).padStart(2, "0");

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function elapsed(startedAt: string, now: number): string {
  const s = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  const h = Math.floor(s / 3600);
  const ms = `${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return h > 0 ? `${h}:${ms}` : ms;
}

export default function DashboardPage() {
  // Data only exists client-side, so time-based text never mismatches on hydration.
  const [state, setState] = useState<{ data: Dashboard; mock: MockDashboard; now: number } | "error" | null>(null);
  const me = useMe();
  const signedIn = me !== null;

  useEffect(() => {
    Promise.all([api<Dashboard>("/dashboard"), mockGetDashboard()]).then(
      ([data, mock]) => setState({ data, mock, now: Date.now() }),
      () => setState("error"),
    );
  }, []);

  if (state === "error") {
    return <p className="px-8 py-10 text-sm text-failed">The dashboard could not be loaded. Refresh to try again.</p>;
  }
  if (!state) {
    return <p className="px-8 py-10 text-sm text-muted">Loading dashboard…</p>;
  }

  const { data, mock, now } = state;
  // ponytail: live contests stay on the mock until T1.
  const contests = mock.contests;
  const date = new Date(now);

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-3xl font-semibold text-text">
            {signedIn ? `${greeting(date)}, ${me?.displayName}` : "Debug real code. Get real results."}
          </h1>
          <p className="mt-2 text-muted">
            {signedIn ? "A little progress. A stronger engineer." : "Fix real production bugs and prove your skills."}
          </p>
        </div>
        <p className="pt-3 text-xs font-medium uppercase tracking-wide text-muted">
          {date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      <section aria-labelledby="contests-heading" className="mt-8">
        <div className="flex items-center justify-between">
          <h2 id="contests-heading" className="text-xl font-semibold text-text">
            Live contests <span className="text-sm font-normal text-muted">{contests.length} active</span>
          </h2>
          <Link href="/contests" className="flex items-center gap-3 text-sm text-action hover:underline">
            View all contests <Icon name="arrowRight" />
          </Link>
        </div>
        {contests.length > 0 ? (
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            {contests.map((c) => (
              <ContestCard key={c.id} contest={c} now={now} />
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted">No contests running right now.</p>
        )}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_324px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {signedIn && data.inProgress ? <ResumeBanner attempt={data.inProgress} now={now} /> : null}
          <RecommendedFeed problems={data.feed} goalRole={me?.goalRole} experienceLevel={me?.experienceLevel} />
        </div>
        {data.stats ? (
          <ProgressPanel
            stats={data.stats}
            activity={data.activity}
            recentWins={data.recentWins}
            now={now}
            profileHref={`/profile/${me?.username}`}
          />
        ) : (
          // Sample stats under the blur: GET /dashboard sends guests none.
          <Locked label="your progress, level and streak">
            <ProgressPanel
              stats={mock.sample.stats}
              activity={mock.sample.activity}
              recentWins={mock.sample.recentWins}
              now={now}
              profileHref="/login"
            />
          </Locked>
        )}
      </div>
    </div>
  );
}

function ContestCard({ contest, now }: { contest: ActiveContest; now: number }) {
  return (
    <li>
      <Link
        href="/contests"
        className="group flex h-full flex-col rounded border border-border bg-surface p-5 hover:border-action"
      >
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-semibold uppercase tracking-wide text-action">{contest.type} contest</span>
          <span className="text-muted">Ends in {countdown(Date.parse(contest.endsAt) - now)}</span>
        </div>
        <h3 className="mt-3 text-lg font-semibold text-text">{contest.title}</h3>
        <p className="mt-1 text-sm text-muted">{contest.description}</p>
        <div className="mt-auto flex items-center gap-4 pt-5 text-xs text-muted">
          <DifficultyPill difficulty={contest.difficulty} />
          <span className="flex items-center gap-1.5">
            <Icon name="user" className="h-4 w-4" />
            {contest.participantCount.toLocaleString("en-US")} participating
          </span>
          <Icon name="arrowRight" className="ml-auto h-5 w-5 text-action" />
        </div>
      </Link>
    </li>
  );
}

function ResumeBanner({ attempt, now }: { attempt: InProgressAttempt; now: number }) {
  return (
    <section
      aria-label="Pick up where you left off"
      className="flex flex-col gap-5 rounded border border-action/20 bg-action/10 p-5 sm:flex-row sm:items-center"
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-canvas text-text">
        <Icon name="terminal" className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-action">Pick up where you left off</p>
        <h2 className="mt-1 text-xl font-semibold text-text">{attempt.title}</h2>
        <p className="mt-1 text-sm text-action">
          {attempt.language} · {attempt.checksPassed} of {attempt.checksTotal} checks passed ·{" "}
          {elapsed(attempt.startedAt, now)} elapsed
        </p>
      </div>
      <Link
        href={`/problems/${attempt.problemSlug}/solve`}
        className="inline-flex items-center justify-center gap-2 rounded bg-action px-8 py-2.5 text-sm font-semibold text-canvas hover:opacity-90"
      >
        <span aria-hidden>▶</span> Resume
      </Link>
    </section>
  );
}
