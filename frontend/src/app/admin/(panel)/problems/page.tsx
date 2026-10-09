"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DifficultyBadge, primaryButton } from "@/components/admin/problems/shared";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { CATEGORIES, type AdminProblemListItem } from "@/lib/types/problem";

// Every problem incl. drafts (A2, 04 "Problems Management"). ponytail: one request, filtered here (like /problems).
const TABS = { all: "All", published: "Published", draft: "Drafts" } as const;
type Tab = keyof typeof TABS;

const inTab = (p: AdminProblemListItem, tab: Tab) => tab === "all" || p.isPublished === (tab === "published");
const roleName = (p: AdminProblemListItem) => CATEGORIES.find((c) => c.slug === p.categorySlug)?.name ?? "No role";
const rating = (p: AdminProblemListItem) => (p.ratingCount ? `${p.averageRating.toFixed(1)} (${p.ratingCount})` : "—");

export default function AdminProblemsPage() {
  const [problems, setProblems] = useState<AdminProblemListItem[] | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");

  useEffect(() => {
    api<{ problems: AdminProblemListItem[] }>("/admin/problems")
      .then((r) => setProblems(r.problems))
      .catch(() => setError(true));
  }, []);

  const query = q.trim().toLowerCase();
  const shown = (problems ?? []).filter((p) => !query || p.title.toLowerCase().includes(query));
  const rows = shown.filter((p) => inTab(p, tab));

  return (
    <div className="w-full px-6 py-8 wide:mx-auto wide:max-w-[1200px]">
      <h1 className="text-3xl font-semibold text-text">Problems</h1>
      <p className="mt-2 text-muted">Every problem on the platform, drafts included.</p>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div role="search" className="relative w-full sm:max-w-[536px]">
          <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search problems..."
            aria-label="Search problems"
            className="w-full rounded border border-border bg-surface py-2.5 pl-11 pr-3 text-sm text-text placeholder:text-muted focus:border-action focus:outline-none"
          />
        </div>
        <Link href="/admin/problems/new" className={`${primaryButton} py-2.5 sm:w-fit sm:min-w-[198px] sm:justify-start`}>
          + Add problem
        </Link>
      </div>

      <div role="tablist" aria-label="Problem status" className="mt-8 flex gap-8 overflow-x-auto border-b border-border">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={t === tab}
            onClick={() => setTab(t)}
            className={`shrink-0 border-b-2 pb-3 text-sm ${
              t === tab ? "border-action font-semibold text-action" : "border-transparent text-muted hover:text-text"
            }`}
          >
            {TABS[t]}
            {problems ? ` ${shown.filter((p) => inTab(p, t)).length}` : ""}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mt-8 text-sm text-failed">Could not load the problems. Reload the page.</p>
      ) : !problems ? (
        <p className="mt-8 text-sm text-muted">Loading problems…</p>
      ) : rows.length === 0 ? (
        <p className="mt-8 rounded border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {query ? "No problems match this search." : `Nothing in ${TABS[tab]} yet.`}
        </p>
      ) : (
        <table className="mt-7 w-full table-fixed text-left text-sm">
          <thead className="bg-surface text-[11px] font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="rounded-l px-3 py-3 sm:px-4">
                Problem
              </th>
              <th scope="col" className="hidden w-28 px-3 py-3 md:table-cell">
                Difficulty
              </th>
              <th scope="col" className="hidden w-40 px-3 py-3 lg:table-cell">
                Role
              </th>
              <th scope="col" className="w-24 px-3 py-3">
                Status
              </th>
              <th scope="col" className="hidden w-20 px-3 py-3 md:table-cell">
                Solves
              </th>
              <th scope="col" className="hidden w-24 px-3 py-3 xl:table-cell">
                Rating
              </th>
              <th scope="col" className="w-20 rounded-r px-3 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-border align-top">
                <td className="px-3 py-4 sm:px-4">
                  <p className="break-words text-[15px] text-text">{p.title}</p>
                  {/* Columns hidden at this width move here. */}
                  <p className="mt-1.5 text-xs text-muted lg:hidden">
                    <span className="md:hidden">
                      <DifficultyBadge difficulty={p.difficulty} /> · {p.solveCount} solves ·{" "}
                    </span>
                    {roleName(p)}
                  </p>
                </td>
                <td className="hidden px-3 py-4 md:table-cell">
                  <DifficultyBadge difficulty={p.difficulty} />
                </td>
                <td className="hidden truncate px-3 py-4 text-text lg:table-cell">{roleName(p)}</td>
                <td className="px-3 py-4">
                  <span
                    className={`inline-block rounded px-2 py-1 text-xs font-semibold ${
                      p.isPublished ? "bg-passed/10 text-passed" : "border border-border text-muted"
                    }`}
                  >
                    {p.isPublished ? "Published" : "Draft"}
                  </span>
                </td>
                <td className="hidden px-3 py-4 tabular-nums text-text md:table-cell">{p.solveCount}</td>
                <td className="hidden px-3 py-4 tabular-nums text-muted xl:table-cell">{rating(p)}</td>
                <td className="px-3 py-4">
                  {/* A published problem's page offers View and Unpublish (A5). */}
                  <Link href={`/admin/problems/${p.id}/edit`} className="text-action hover:underline">
                    {p.isPublished ? "Manage" : "Edit"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {problems && rows.length > 0 && (
        <p className="mt-4 text-sm text-muted">
          Showing {rows.length} of {problems.length}
        </p>
      )}
    </div>
  );
}
