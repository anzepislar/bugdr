"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DifficultyPill } from "@/components/DifficultyPill";
import { Icon } from "@/components/Icon";
import { MOCK_ME } from "@/lib/mock/dashboard";
import { mockGetProblems } from "@/lib/mock/problems";
import {
  CATEGORIES,
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  type CategorySlug,
  type Difficulty,
  type ProblemListItem,
} from "@/lib/types/problem";

const PAGE_SIZE = 6;

const STATUSES = { any: "Any", unsolved: "Unsolved", in_progress: "In progress", solved: "Solved" } as const;
const SORTS = { recommended: "Recommended", rating: "Highest rated", shortest: "Shortest" } as const;

interface Filters {
  q: string;
  category: CategorySlug | "all";
  difficulty: Difficulty | "all";
  tag: string;
  status: keyof typeof STATUSES;
  sort: keyof typeof SORTS;
  savedOnly: boolean;
}

const selectClass =
  "rounded border border-border bg-surface px-3 py-2.5 text-sm text-text focus:border-action focus:outline-none";

function matches(p: ProblemListItem, f: Filters, saved: Set<string>): boolean {
  const q = f.q.trim().toLowerCase();
  return (
    (!q || [p.title, p.shortDescription, ...p.tags].some((s) => s.toLowerCase().includes(q))) &&
    (f.category === "all" || p.categorySlug === f.category) &&
    (f.difficulty === "all" || p.difficulty === f.difficulty) &&
    (!f.tag || p.tags.includes(f.tag)) &&
    (f.status === "any" ||
      (f.status === "unsolved" ? p.status !== "solved" : p.status === f.status)) &&
    (!f.savedOnly || saved.has(p.slug))
  );
}

export function ProblemBrowser({ initialQuery }: { initialQuery: string }) {
  const [problems, setProblems] = useState<ProblemListItem[] | null>(null);
  const [filters, setFilters] = useState<Filters>({
    q: initialQuery,
    category: "all",
    difficulty: "all",
    tag: "",
    status: "unsolved",
    sort: "recommended",
    savedOnly: false,
  });
  const [page, setPage] = useState(0);
  // ponytail: bookmarks are UI-only and not shared with the dashboard, there is no table for them yet (see 06, D23).
  const [saved, setSaved] = useState<Set<string>>(new Set());

  useEffect(() => {
    mockGetProblems().then(setProblems);
  }, []);

  const patch = (p: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setPage(0);
  };

  function toggleSaved(slug: string) {
    setSaved((prev) => {
      const next = new Set(prev);
      if (!next.delete(slug)) next.add(slug);
      return next;
    });
  }

  if (!problems) {
    return <p className="mt-8 text-sm text-muted">Loading problems…</p>;
  }

  const tags = [...new Set(problems.flatMap((p) => p.tags))].sort();

  // ponytail: filtered and paged client-side on the mock; P1 moves this into GET /problems query params.
  const shown = problems.filter((p) => matches(p, filters, saved));
  if (filters.sort === "recommended") {
    // D19-style: the user's goal role first, then best rated.
    const own = (p: ProblemListItem) => (p.categorySlug === MOCK_ME.goalRole ? 0 : 1);
    shown.sort((a, b) => own(a) - own(b) || b.averageRating - a.averageRating);
  }
  if (filters.sort === "rating") shown.sort((a, b) => b.averageRating - a.averageRating);
  if (filters.sort === "shortest") shown.sort((a, b) => a.timeLimitMinutes - b.timeLimitMinutes);

  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const pageItems = shown.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <>
      <div className="mt-8 flex flex-col gap-4 sm:flex-row">
        <div role="search" className="relative flex-1 sm:max-w-[760px]">
          <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={filters.q}
            onChange={(e) => patch({ q: e.target.value })}
            placeholder="Search by title, technology or incident..."
            aria-label="Search by title, technology or incident"
            className="w-full rounded border border-border bg-surface py-2.5 pl-11 pr-3 text-sm text-text placeholder:text-muted focus:border-action focus:outline-none"
          />
        </div>
        <button
          type="button"
          aria-pressed={filters.savedOnly}
          onClick={() => patch({ savedOnly: !filters.savedOnly })}
          className={`rounded border px-4 py-2.5 text-sm sm:ml-auto sm:w-[184px] sm:text-left ${
            filters.savedOnly ? "border-action text-action" : "border-border bg-surface text-text hover:border-action"
          }`}
        >
          Saved problems{saved.size > 0 ? ` (${saved.size})` : ""}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4 xl:max-w-[832px]">
        <select
          aria-label="Role"
          value={filters.category}
          onChange={(e) => patch({ category: e.target.value as Filters["category"] })}
          className={selectClass}
        >
          <option value="all">Role: All roles</option>
          {CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>
              Role: {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Difficulty"
          value={filters.difficulty}
          onChange={(e) => patch({ difficulty: e.target.value as Filters["difficulty"] })}
          className={selectClass}
        >
          <option value="all">Difficulty: Any</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              Difficulty: {DIFFICULTY_LABEL[d]}
            </option>
          ))}
        </select>
        <select aria-label="Topic" value={filters.tag} onChange={(e) => patch({ tag: e.target.value })} className={selectClass}>
          <option value="">Topic: All topics</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              Topic: {t}
            </option>
          ))}
        </select>
        <select
          aria-label="Status"
          value={filters.status}
          onChange={(e) => patch({ status: e.target.value as Filters["status"] })}
          className={selectClass}
        >
          {Object.entries(STATUSES).map(([value, label]) => (
            <option key={value} value={value}>
              Status: {label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-8 flex items-center justify-between gap-4">
        <p className="font-semibold text-text">{shown.length} problems</p>
        <select
          aria-label="Sort"
          value={filters.sort}
          onChange={(e) => patch({ sort: e.target.value as Filters["sort"] })}
          className="bg-transparent text-sm text-muted focus:text-text focus:outline-none"
        >
          {Object.entries(SORTS).map(([value, label]) => (
            <option key={value} value={value}>
              Sort: {label}
            </option>
          ))}
        </select>
      </div>

      {pageItems.length > 0 ? (
        <ul className="mt-4 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {pageItems.map((p) => (
            <ProblemCard key={p.slug} problem={p} saved={saved.has(p.slug)} onToggleSaved={() => toggleSaved(p.slug)} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded border border-border px-4 py-6 text-center text-sm text-muted">
          No problems match these filters.
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <p className="text-sm text-muted">
          Showing {pageItems.length} of {shown.length} problems
        </p>
        <div className="ml-auto flex gap-3">
          {page > 0 ? (
            <button
              type="button"
              onClick={() => setPage(page - 1)}
              className="rounded border border-border bg-surface px-4 py-2.5 text-sm text-text hover:border-action"
            >
              ← Previous page
            </button>
          ) : null}
          {page < pageCount - 1 ? (
            <button
              type="button"
              onClick={() => setPage(page + 1)}
              className="flex items-center gap-2 rounded border border-border bg-surface px-4 py-2.5 text-sm text-text hover:border-action"
            >
              Next page <Icon name="arrowRight" className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}

function ProblemCard({
  problem: p,
  saved,
  onToggleSaved,
}: {
  problem: ProblemListItem;
  saved: boolean;
  onToggleSaved: () => void;
}) {
  return (
    <li className="flex flex-col rounded border border-border bg-surface p-4">
      <div className="aspect-[15/7] overflow-hidden rounded bg-canvas">
        {p.thumbnailUrl ? (
          <Image src={p.thumbnailUrl} alt="" width={240} height={112} unoptimized className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-border">
            <Icon name="terminal" className="h-8 w-8" />
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <DifficultyPill difficulty={p.difficulty} />
        <span className="min-w-0 flex-1 truncate text-xs text-muted">{p.tags.join(" · ")}</span>
        <button
          type="button"
          aria-label={saved ? "Remove from saved" : "Save problem"}
          aria-pressed={saved}
          onClick={onToggleSaved}
          className={saved ? "text-action" : "text-muted hover:text-text"}
        >
          <Icon name="bookmark" className={`h-5 w-5 ${saved ? "fill-current" : ""}`} />
        </button>
      </div>
      <h3 className="mt-3 text-lg font-semibold text-text">
        <Link href={`/problems/${p.slug}`} className="hover:text-action">
          {p.title}
        </Link>
      </h3>
      <p className="mt-1 text-sm text-muted">{p.shortDescription}</p>

      <div className="mt-auto flex items-center gap-x-6 pt-6 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <Icon name="clock" className="h-4 w-4" /> {p.timeLimitMinutes} min
        </span>
        <span>
          <span className="text-medium">★</span> {p.averageRating.toFixed(1)}
        </span>
        {p.status === "solved" ? <span className="font-medium text-passed">Solved</span> : null}
        {p.status === "in_progress" ? <span className="font-medium text-pending">In progress</span> : null}
        <Link href={`/problems/${p.slug}`} aria-label={`Open ${p.title}`} className="ml-auto text-action">
          <Icon name="arrowRight" className="h-5 w-5" />
        </Link>
      </div>
    </li>
  );
}
