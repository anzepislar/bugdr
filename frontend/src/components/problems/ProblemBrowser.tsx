"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

// Cards per load before the window has been measured.
const DEFAULT_BATCH = 6;

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
  // Infinite scroll: the first load fills the screen plus one row (so there is something to scroll),
  // each later load adds about a screenful when the end of the list comes into view.
  const [batch, setBatch] = useState({ first: DEFAULT_BATCH, more: DEFAULT_BATCH });
  const [limit, setLimit] = useState<number | null>(null); // null = only the first load
  const listRef = useRef<HTMLUListElement>(null);
  const endRef = useRef<HTMLParagraphElement>(null);
  const loaded = problems !== null;
  // ponytail: bookmarks are UI-only and not shared with the dashboard, there is no table for them yet (see 06, D23).
  const [saved, setSaved] = useState<Set<string>>(new Set());

  useEffect(() => {
    mockGetProblems().then(setProblems);
  }, []);

  const patch = (p: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setLimit(null);
  };

  function toggleSaved(slug: string) {
    setSaved((prev) => {
      const next = new Set(prev);
      if (!next.delete(slug)) next.add(slug);
      return next;
    });
  }

  // ponytail: row height comes from the tallest card loaded at measure time; taller cards later only shift the next load slightly.
  useLayoutEffect(() => {
    if (!loaded) return;
    function fit() {
      const ul = listRef.current;
      const cards = ul ? [...ul.children].filter((c): c is HTMLElement => c instanceof HTMLElement) : [];
      if (!ul || cards.length === 0) return;

      const cols = Math.max(1, Math.round(ul.clientWidth / cards[0].offsetWidth));
      const gap = parseFloat(getComputedStyle(ul).rowGap) || 0;
      const rowHeight = Math.max(...cards.map((c) => c.offsetHeight)) + gap;
      const above = ul.getBoundingClientRect().top + window.scrollY;
      const rows = Math.max(1, Math.floor((window.innerHeight - above + gap) / rowHeight));
      setBatch({ first: (rows + 1) * cols, more: Math.max(rows, 2) * cols });
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [loaded]);

  // ponytail: filtered and sliced client-side on the mock; P1 moves this into GET /problems query params (limit + offset).
  const shown = (problems ?? []).filter((p) => matches(p, filters, saved));
  if (filters.sort === "recommended") {
    // D19-style: the user's goal role first, then best rated.
    const own = (p: ProblemListItem) => (p.categorySlug === MOCK_ME.goalRole ? 0 : 1);
    shown.sort((a, b) => own(a) - own(b) || b.averageRating - a.averageRating);
  }
  if (filters.sort === "rating") shown.sort((a, b) => b.averageRating - a.averageRating);
  if (filters.sort === "shortest") shown.sort((a, b) => a.timeLimitMinutes - b.timeLimitMinutes);

  const visible = limit ?? batch.first;
  const items = shown.slice(0, visible);
  const hasMore = visible < shown.length;

  // Re-created after every load, so a marker that is still on screen triggers the next load right away.
  useEffect(() => {
    const end = endRef.current;
    if (!end || !hasMore) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setLimit(visible + batch.more);
    });
    observer.observe(end);
    return () => observer.disconnect();
  }, [hasMore, visible, batch.more]);

  if (!problems) {
    return <p className="mt-8 text-sm text-muted">Loading problems…</p>;
  }

  const tags = [...new Set(problems.flatMap((p) => p.tags))].sort();


  return (
    <>
      <div className="mt-8">
        <div role="search" className="relative">
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
      </div>

      <div className="mt-4 flex flex-col gap-4 xl:flex-row">
        <div className="grid flex-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
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
        <button
          type="button"
          aria-pressed={filters.savedOnly}
          onClick={() => patch({ savedOnly: !filters.savedOnly })}
          className={`rounded border px-4 py-2.5 text-sm md:w-[184px] md:self-end md:text-left ${
            filters.savedOnly ? "border-action text-action" : "border-border bg-surface text-text hover:border-action"
          }`}
        >
          Saved problems{saved.size > 0 ? ` (${saved.size})` : ""}
        </button>
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

      {items.length > 0 ? (
        <ul ref={listRef} className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:gap-6 2xl:grid-cols-4">
          {items.map((p) => (
            <ProblemCard key={p.slug} problem={p} saved={saved.has(p.slug)} onToggleSaved={() => toggleSaved(p.slug)} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded border border-border px-4 py-6 text-center text-sm text-muted">
          No problems match these filters.
        </p>
      )}

      <p ref={endRef} className="mt-8 text-sm text-muted">
        Showing {items.length} of {shown.length} problems
      </p>
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
    <li className="flex min-w-0 flex-col rounded border border-border bg-surface p-4">
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
      <h3 className="mt-3 text-lg font-semibold text-balance break-words text-text">
        <Link href={`/problems/${p.slug}`} className="hover:text-action">
          {p.title}
        </Link>
      </h3>
      <p className="mt-1 text-sm text-muted">{p.shortDescription}</p>

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-6 text-xs text-muted">
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
