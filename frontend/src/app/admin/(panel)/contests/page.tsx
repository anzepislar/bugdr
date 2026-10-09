"use client";

import Link from "next/link";
import { Fragment, useEffect, useState, useSyncExternalStore } from "react";
import { primaryButton, secondaryButton } from "@/components/admin/problems/shared";
import { Icon } from "@/components/Icon";
import { duration, formatUtcDateTime } from "@/lib/format";
import { getContestDates } from "@/lib/getContestDates";
import { getContestStatus, type ContestStatus } from "@/lib/getContestStatus";
import { api, ApiError } from "@/lib/api";
import { REWARD_TYPES, type AdminContest, type AdminContestResult } from "@/lib/types/contest";

// Tab order on the page.
const GROUPS: Record<ContestStatus, string> = {
  active: "Active",
  scheduled: "Scheduled",
  draft: "Drafts",
  ended: "Ended",
};

const BADGE: Record<ContestStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "border border-border text-muted" },
  scheduled: { label: "Scheduled", className: "bg-action/10 text-action" },
  active: { label: "Active", className: "bg-passed/10 text-passed" },
  ended: { label: "Ended", className: "border border-border text-muted" },
};

const TYPE_LABEL = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" } as const;

const toDate = (iso: string | null) => (iso ? new Date(iso) : null);
const statusOf = (c: AdminContest) => getContestStatus({ starts_at: toDate(c.startsAt), ends_at: toDate(c.endsAt) });
const dateRange = (c: AdminContest) =>
  c.startsAt && c.endsAt ? `${formatUtcDateTime(c.startsAt)} – ${formatUtcDateTime(c.endsAt)}` : "Not scheduled";
const reward = (c: AdminContest) =>
  c.rewardType ? `${REWARD_TYPES[c.rewardType]} · ${c.rewardDescription}${c.rewardSentAt ? " · sent" : ""}` : "—";

export default function AdminContestsPage() {
  const [contests, setContests] = useState<AdminContest[] | null>(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<ContestStatus>("active");
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api<{ contests: AdminContest[] }>("/admin/contests")
      .then((r) => setContests(r.contests))
      .catch(() => setError("Could not load the contests. Reload the page."));

  useEffect(() => {
    load();
  }, []);

  // Every action reloads the list; a refused one (e.g. a draft that cannot be scheduled yet) says why.
  async function run(action: Promise<unknown>) {
    setError(null);
    try {
      await action;
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : "That did not work. Try again.");
    }
    await load();
  }
  const setDates = (c: AdminContest, startsAt: string | null, endsAt: string | null) =>
    api(`/admin/contests/${c.id}/dates`, { method: "PUT", body: JSON.stringify({ startsAt, endsAt }) });

  const actions = {
    schedule(c: AdminContest) {
      const { starts_at, ends_at, preview } = getContestDates(c.type);
      if (window.confirm(`Schedule "${c.title}" for ${preview}?`)) {
        run(setDates(c, starts_at.toISOString(), ends_at.toISOString()));
      }
    },
    cancel(c: AdminContest) {
      if (window.confirm(`Cancel "${c.title}"? It goes back to drafts.`)) run(setDates(c, null, null));
    },
    remove(c: AdminContest) {
      if (window.confirm(`Delete the draft "${c.title}"?`)) run(api(`/admin/contests/${c.id}`, { method: "DELETE" }));
    },
    archive(c: AdminContest) {
      if (window.confirm(`Archive "${c.title}"? It disappears from this list.`))
        run(api(`/admin/contests/${c.id}/archive`, { method: "POST" }));
    },
    rewardSent(c: AdminContest) {
      const sent = !c.rewardSentAt;
      run(api(`/admin/contests/${c.id}/reward-sent`, { method: "PUT", body: JSON.stringify({ sent }) }));
    },
  };

  const query = q.trim().toLowerCase();
  const shown = (contests ?? []).filter((c) => !query || c.title.toLowerCase().includes(query));
  const rows = shown.filter((c) => statusOf(c) === tab);

  return (
    <div className="w-full px-6 py-8 wide:mx-auto wide:max-w-[1200px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold text-text">Contest management</h1>
          <p className="mt-2 text-muted">Schedule and manage the problems featured in each contest.</p>
        </div>
        <span className="rounded bg-surface px-2 py-1 text-xs font-semibold tracking-wide text-action">ADMIN</span>
      </div>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div role="search" className="relative w-full sm:max-w-[536px]">
          <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search contests..."
            aria-label="Search contests"
            className="w-full rounded border border-border bg-surface py-2.5 pl-11 pr-3 text-sm text-text placeholder:text-muted focus:border-action focus:outline-none"
          />
        </div>
        <Link href="/admin/contests/new" className={`${primaryButton} py-2.5 sm:w-fit sm:min-w-[198px] sm:justify-start`}>
          + Create contest
        </Link>
      </div>

      <div role="tablist" aria-label="Contest status" className="mt-8 flex gap-8 overflow-x-auto border-b border-border">
        {(Object.keys(GROUPS) as ContestStatus[]).map((status) => (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={status === tab}
            onClick={() => setTab(status)}
            className={`shrink-0 border-b-2 pb-3 text-sm ${
              status === tab ? "border-action font-semibold text-action" : "border-transparent text-muted hover:text-text"
            }`}
          >
            {GROUPS[status]}
            {contests ? ` ${shown.filter((c) => statusOf(c) === status).length}` : ""}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded border border-failed/40 px-3 py-2 text-sm text-failed">
          {error}
        </p>
      )}

      {!contests ? (
        <p className="mt-8 text-sm text-muted">Loading contests…</p>
      ) : rows.length === 0 ? (
        <p className="mt-8 rounded border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {query ? "No contests match this search." : `Nothing in ${GROUPS[tab]} yet.`}
        </p>
      ) : (
        <table className="mt-7 w-full table-fixed text-left text-sm">
          <thead className="bg-surface text-[11px] font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="rounded-l px-3 py-3 sm:px-4">
                Contest
              </th>
              <th scope="col" className="hidden w-24 px-3 py-3 md:table-cell">
                Type
              </th>
              <th scope="col" className="w-28 px-3 py-3">
                Status
              </th>
              <th scope="col" className="hidden w-56 px-3 py-3 lg:table-cell">
                Dates (UTC)
              </th>
              <th scope="col" className="hidden w-24 px-3 py-3 md:table-cell">
                Problems
              </th>
              <th scope="col" className="hidden w-52 px-3 py-3 xl:table-cell">
                Reward
              </th>
              <th scope="col" className="w-12 rounded-r px-3 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <ContestRow key={c.id} contest={c} status={tab} actions={actions} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

type Actions = Record<"schedule" | "cancel" | "remove" | "archive" | "rewardSent", (c: AdminContest) => void>;

function ContestRow({ contest: c, status, actions }: { contest: AdminContest; status: ContestStatus; actions: Actions }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const columns = useVisibleColumns();
  const badge = BADGE[status];
  // Same rule as step 1 + 2 of the wizard.
  const schedulable = c.description.trim() !== "" && c.problems.length > 0;
  const item = "block w-full px-3 py-2 text-left text-sm hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40";
  const act = (fn: (c: AdminContest) => void) => () => {
    setMenuOpen(false);
    fn(c);
  };

  return (
    <Fragment>
      <tr className={`align-top ${resultsOpen ? "" : "border-b border-border"}`}>
        <td className="px-3 py-4 sm:px-4">
          <p className="break-words text-[15px] text-text">{c.title}</p>
          {/* Columns hidden at this width move here. */}
          <p className="mt-1.5 text-xs text-muted md:hidden">
            {TYPE_LABEL[c.type]} · {c.problems.length} {c.problems.length === 1 ? "problem" : "problems"}
          </p>
          <p className="mt-1.5 text-xs text-muted lg:hidden">{dateRange(c)}</p>
          <p className="mt-1.5 truncate text-xs text-muted xl:hidden">{c.rewardType ? reward(c) : "No reward"}</p>
        </td>
        <td className="hidden px-3 py-4 text-text md:table-cell">{TYPE_LABEL[c.type]}</td>
        <td className="px-3 py-4">
          <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold ${badge.className}`}>
            {status === "active" && (
              <span aria-hidden className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-passed opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-passed" />
              </span>
            )}
            {badge.label}
          </span>
        </td>
        <td className="hidden px-3 py-4 text-[13px] text-muted lg:table-cell">{dateRange(c)}</td>
        <td className="hidden px-3 py-4 text-text md:table-cell">{c.problems.length}</td>
        <td className="hidden truncate px-3 py-4 text-[13px] text-muted xl:table-cell" title={reward(c)}>
          {reward(c)}
        </td>
        <td className="px-3 py-3">
          <div
            className="relative"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setMenuOpen(false);
            }}
          >
            <button
              type="button"
              aria-label={`Actions for ${c.title}`}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
              className="rounded p-1 text-muted hover:text-text"
            >
              <Icon name="more" className="h-5 w-5 stroke-[3]" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-10 mt-1 w-52 rounded border border-border bg-surface py-1 shadow-lg">
                {(status === "draft" || status === "scheduled") && (
                  <Link href={`/admin/contests/${c.id}/edit`} className={`${item} text-text`}>
                    Edit
                  </Link>
                )}
                {status === "draft" && (
                  <>
                    <button type="button" onClick={act(actions.schedule)} disabled={!schedulable} className={`${item} text-text`}>
                      Schedule
                      {!schedulable && <span className="block text-xs text-muted">Add a description and a problem first</span>}
                    </button>
                    <button type="button" onClick={act(actions.remove)} className={`${item} text-failed`}>
                      Delete
                    </button>
                  </>
                )}
                {status === "scheduled" && (
                  <button type="button" onClick={act(actions.cancel)} className={`${item} text-failed`}>
                    Cancel
                  </button>
                )}
                {/* Inline, not the public contest page: that one needs a user account, which the admin is not (D48). */}
                {(status === "active" || status === "ended") && (
                  <button type="button" onClick={act(() => setResultsOpen((o) => !o))} className={`${item} text-text`}>
                    {resultsOpen ? "Hide results" : "View results"}
                  </button>
                )}
                {status === "ended" && (
                  <button type="button" onClick={act(actions.archive)} className={`${item} text-text`}>
                    Archive
                  </button>
                )}
              </div>
            )}
          </div>
        </td>
      </tr>
      {resultsOpen && (
        <tr className="border-b border-border">
          <td colSpan={columns} className="px-3 pb-6 sm:px-4">
            <ContestResults contest={c} status={status} onRewardSent={() => actions.rewardSent(c)} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

// Columns shown at the current width (md: Type + Problems, lg: Dates, xl: Reward). A fixed-layout table gets one
// column per spanned cell, so the results row must span exactly the visible ones.
const WIDER = ["(min-width: 768px)", "(min-width: 768px)", "(min-width: 1024px)", "(min-width: 1280px)"];
function useVisibleColumns() {
  return useSyncExternalStore(
    (onChange) => {
      const lists = WIDER.map((q) => window.matchMedia(q));
      lists.forEach((l) => l.addEventListener("change", onChange));
      return () => lists.forEach((l) => l.removeEventListener("change", onChange));
    },
    () => 3 + WIDER.filter((q) => window.matchMedia(q).matches).length,
    () => 7,
  );
}

// A7: ranking by solved, score, then total solve time (03). Read only; a live contest can still change.
function ContestResults({
  contest: c,
  status,
  onRewardSent,
}: {
  contest: AdminContest;
  status: ContestStatus;
  onRewardSent: () => void;
}) {
  const [results, setResults] = useState<AdminContestResult[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api<{ results: AdminContestResult[] }>(`/admin/contests/${c.id}/results`)
      .then((r) => setResults(r.results))
      .catch(() => setError(true));
  }, [c.id]);

  return (
    <div className="rounded border border-border bg-surface p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-text">
          Results{status === "active" ? " so far" : ""}
          {results && <span className="ml-2 text-sm font-normal text-muted">{results.length} engineers</span>}
        </h2>
        <div className="flex flex-wrap gap-2">
          {status === "ended" && c.rewardType && (
            <button type="button" onClick={onRewardSent} className={`${secondaryButton} sm:w-fit`}>
              {c.rewardSentAt ? "Mark reward as not sent" : "Mark reward as sent"}
            </button>
          )}
          <a href={`/api/v1/admin/contests/${c.id}/results?format=csv`} download className={`${secondaryButton} sm:w-fit`}>
            Export CSV
          </a>
        </div>
      </div>
      {c.rewardSentAt && <p className="mt-2 text-xs text-muted">Reward sent {formatUtcDateTime(c.rewardSentAt)} (UTC)</p>}

      {error ? (
        <p className="mt-4 text-sm text-failed">Could not load the results. Try again.</p>
      ) : !results ? (
        <p className="mt-4 text-sm text-muted">Loading results…</p>
      ) : results.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nobody has entered this contest.</p>
      ) : (
        <table className="mt-4 w-full table-fixed text-left text-sm">
          <thead className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="w-12 py-2 pr-2">
                Rank
              </th>
              <th scope="col" className="py-2 pr-2">
                Engineer
              </th>
              <th scope="col" className="hidden w-20 py-2 pr-2 sm:table-cell">
                Solved
              </th>
              <th scope="col" className="w-20 py-2 pr-2">
                Score
              </th>
              <th scope="col" className="hidden w-24 py-2 sm:table-cell">
                Solve time
              </th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.username} className="border-t border-border align-top">
                <td className="py-2 pr-2 text-text">{r.rank}</td>
                <td className="min-w-0 py-2 pr-2">
                  <p className="truncate text-text">{r.username}</p>
                  <p className="truncate text-xs text-muted">{r.email}</p>
                  <p className="text-xs text-muted sm:hidden">
                    {r.problemsSolved}/{c.problems.length} solved · {duration(r.solveTimeSeconds)}
                  </p>
                </td>
                <td className="hidden py-2 pr-2 text-text sm:table-cell">
                  {r.problemsSolved}/{c.problems.length}
                </td>
                <td className="py-2 pr-2 text-text">{r.score}</td>
                <td className="hidden py-2 text-muted sm:table-cell">{duration(r.solveTimeSeconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
