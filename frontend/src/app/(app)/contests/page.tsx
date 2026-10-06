import Image from "next/image";
import Link from "next/link";
import { DifficultyPill } from "@/components/DifficultyPill";
import { Icon } from "@/components/Icon";
import { countdown } from "@/lib/format";
import { mockGetContests } from "@/lib/mock/contests";
import type { Contest, ContestHistoryEntry } from "@/lib/types/contest";

const TABS = { live: "Live", upcoming: "Upcoming", past: "Past contests" } as const;
type Tab = keyof typeof TABS;

const EMPTY: Record<Tab, string> = {
  live: "No contests are running right now. Check the upcoming ones.",
  upcoming: "No contests are scheduled yet.",
  past: "No contests have ended yet.",
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Rendered per request (searchParams), so the countdowns are as of this load.
async function load() {
  return { data: await mockGetContests(), now: Date.now() };
}

export default async function ContestsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: rawTab } = await searchParams;
  const tab: Tab = rawTab && rawTab in TABS ? (rawTab as Tab) : "live";
  const { data, now } = await load();
  const contests = data[tab];

  return (
    <div className="w-full px-6 py-8 wide:mx-auto wide:max-w-[1200px]">
      <h1 className="text-3xl font-semibold text-text">Put your skills to the test</h1>
      <p className="mt-2 text-muted">Daily, weekly and monthly incidents. A fresh challenge at every pace.</p>

      <nav aria-label="Contest status" className="mt-8 flex gap-8 overflow-x-auto border-b border-border">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Link
            key={t}
            href={t === "live" ? "/contests" : `/contests?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={`shrink-0 border-b-2 pb-3 text-sm ${
              t === tab ? "border-action font-semibold text-action" : "border-transparent text-muted hover:text-text"
            }`}
          >
            {TABS[t]}
          </Link>
        ))}
      </nav>

      {contests.length > 0 ? (
        <ul className="mt-8 flex flex-col gap-4">
          {contests.map((c) => (
            <ContestCard key={c.id} contest={c} tab={tab} now={now} />
          ))}
        </ul>
      ) : (
        <p className="mt-8 rounded border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {EMPTY[tab]}
        </p>
      )}

      <ContestHistory entries={data.history} />
    </div>
  );
}

function ContestCard({ contest: c, tab, now }: { contest: Contest; tab: Tab; now: number }) {
  const timing =
    tab === "live"
      ? { label: "Ends in", value: countdown(Date.parse(c.endsAt) - now) }
      : tab === "upcoming"
        ? { label: "Starts in", value: countdown(Date.parse(c.startsAt) - now) }
        : { label: "Ended", value: formatDate(c.endsAt) };

  return (
    <li className="flex flex-col gap-5 rounded border border-border bg-surface p-4 md:flex-row">
      <div className="aspect-[15/7] shrink-0 overflow-hidden rounded bg-canvas md:w-[250px] md:self-center">
        {c.thumbnailUrl ? (
          <Image src={c.thumbnailUrl} alt="" width={240} height={112} unoptimized className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-border">
            <Icon name={tab === "upcoming" ? "lock" : "terminal"} className="h-8 w-8" />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-5 xl:flex-row xl:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-action">{c.type} contest</p>
          {c.difficulty ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <DifficultyPill difficulty={c.difficulty} />
              <span className="truncate text-xs text-muted">{c.tags.join(" · ")}</span>
            </div>
          ) : null}
          <h2 className="mt-2 text-xl font-semibold text-text">{c.title}</h2>
          <p className="mt-1 text-sm text-muted">{c.description}</p>
          <p className="mt-3 text-xs text-muted">
            {tab === "upcoming"
              ? "Problems are revealed when the contest starts."
              : `${c.participantCount.toLocaleString("en-US")} engineers`}
          </p>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 xl:w-52 xl:flex-col xl:items-stretch">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{timing.label}</p>
            <p className="mt-1 text-2xl font-semibold text-text">{timing.value}</p>
          </div>
          <Link
            href={`/contests/${c.id}`}
            className="inline-flex items-center justify-center gap-2 rounded bg-action px-6 py-2.5 text-sm font-semibold text-canvas hover:opacity-90"
          >
            View contest <Icon name="arrowRight" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </li>
  );
}

function ContestHistory({ entries }: { entries: ContestHistoryEntry[] }) {
  return (
    <section aria-labelledby="history-heading" className="mt-12 border-t border-border pt-8">
      <h2 id="history-heading" className="text-xl font-semibold text-text">
        Your contest history
      </h2>
      {entries.length > 0 ? (
        <ul className="mt-4 divide-y divide-border">
          {entries.map((e) => {
            const completed = e.checksPassed === e.checksTotal;
            return (
              <li
                key={e.contestId}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm sm:grid sm:grid-cols-[minmax(0,1fr)_8rem_10rem_7rem] sm:items-center sm:gap-6"
              >
                <span className="w-full truncate text-text sm:w-auto">{e.title}</span>
                <span
                  className={`w-fit rounded px-2 py-1 text-xs font-semibold ${
                    completed ? "bg-action/15 text-action" : "bg-border/60 text-muted"
                  }`}
                >
                  {completed ? "Completed" : "Incomplete"}
                </span>
                <span className="text-muted">
                  {e.checksPassed}/{e.checksTotal} checks passed
                </span>
                <span className="text-muted sm:text-right">{formatDate(e.endedAt)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">You haven&apos;t entered a contest yet.</p>
      )}
    </section>
  );
}
