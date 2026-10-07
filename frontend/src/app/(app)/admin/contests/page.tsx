"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { primaryButton } from "@/components/admin/problems/shared";
import { Icon } from "@/components/Icon";
import { formatUtcDateTime } from "@/lib/format";
import { getContestDates } from "@/lib/getContestDates";
import { getContestStatus, type ContestStatus } from "@/lib/getContestStatus";
import { mockGetAdminContests, mockRemoveContest, mockSetContestDates } from "@/lib/mock/adminContests";
import { REWARD_TYPES, type AdminContest } from "@/lib/types/contest";

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
const reward = (c: AdminContest) => (c.rewardType ? `${REWARD_TYPES[c.rewardType]} · ${c.rewardDescription}` : "—");

export default function AdminContestsPage() {
  const [contests, setContests] = useState<AdminContest[] | null>(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<ContestStatus>("active");

  useEffect(() => {
    mockGetAdminContests().then(setContests);
  }, []);

  async function run(action: Promise<void>) {
    await action;
    setContests(await mockGetAdminContests());
  }

  const actions = {
    schedule(c: AdminContest) {
      const { starts_at, ends_at, preview } = getContestDates(c.type);
      if (window.confirm(`Schedule "${c.title}" for ${preview}?`)) {
        run(mockSetContestDates(c.id, starts_at.toISOString(), ends_at.toISOString()));
      }
    },
    cancel(c: AdminContest) {
      if (window.confirm(`Cancel "${c.title}"? It goes back to drafts.`)) run(mockSetContestDates(c.id, null, null));
    },
    remove(c: AdminContest) {
      if (window.confirm(`Delete the draft "${c.title}"?`)) run(mockRemoveContest(c.id));
    },
    archive(c: AdminContest) {
      if (window.confirm(`Archive "${c.title}"? It disappears from this list.`)) run(mockRemoveContest(c.id));
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

type Actions = Record<"schedule" | "cancel" | "remove" | "archive", (c: AdminContest) => void>;

function ContestRow({ contest: c, status, actions }: { contest: AdminContest; status: ContestStatus; actions: Actions }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const badge = BADGE[status];
  // Same rule as step 1 + 2 of the wizard.
  const schedulable = c.description.trim() !== "" && c.problems.length > 0;
  const item = "block w-full px-3 py-2 text-left text-sm hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40";
  const act = (fn: (c: AdminContest) => void) => () => {
    setMenuOpen(false);
    fn(c);
  };

  return (
    <tr className="border-b border-border align-top">
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
              {(status === "active" || status === "ended") && (
                // ponytail: no admin results page yet (A7) - opens the public, read-only contest page.
                <Link href={`/contests/${c.id}`} className={`${item} text-text`}>
                  View results
                </Link>
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
  );
}
