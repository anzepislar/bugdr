"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLoginHref, useSignedIn } from "@/components/app/Session";
import { DifficultyPill } from "@/components/DifficultyPill";
import { Icon } from "@/components/Icon";
import { STARTING_DIFFICULTY, type ExperienceLevel, type FeedProblem } from "@/lib/types/dashboard";
import { CATEGORIES, DIFFICULTIES, DIFFICULTY_LABEL, type CategorySlug, type Difficulty } from "@/lib/types/problem";

const SORTS = { best: "Best match", rating: "Highest rated", shortest: "Shortest" } as const;

interface Filters {
  category: CategorySlug | "all";
  difficulty: Difficulty | "all";
  hideSolved: boolean;
  sort: keyof typeof SORTS;
}

const selectClass =
  "rounded border border-border bg-canvas px-3 py-2.5 text-sm text-text focus:border-action focus:outline-none";

export function RecommendedFeed({
  problems,
  goalRole,
  experienceLevel,
}: {
  problems: FeedProblem[];
  /** Missing for guests: the feed starts unfiltered. */
  goalRole?: CategorySlug;
  experienceLevel?: ExperienceLevel;
}) {
  const signedIn = useSignedIn();
  const router = useRouter();
  const loginHref = useLoginHref();
  const defaults: Filters = {
    category: goalRole ?? "all",
    difficulty: experienceLevel ? STARTING_DIFFICULTY[experienceLevel] : "all",
    hideSolved: true,
    sort: "best",
  };
  const [filters, setFilters] = useState<Filters>(defaults);
  // ponytail: bookmarks are UI-only, there is no table for them yet (see 06, D23).
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());

  // ponytail: filtered client-side on the mock; U3 moves this into GET /dashboard query params.
  const shown = problems.filter(
    (p) =>
      (filters.category === "all" || p.categorySlug === filters.category) &&
      (filters.difficulty === "all" || p.difficulty === filters.difficulty) &&
      !(filters.hideSolved && p.solved),
  );
  if (filters.sort === "rating") shown.sort((a, b) => b.averageRating - a.averageRating);
  if (filters.sort === "shortest") shown.sort((a, b) => a.timeLimitMinutes - b.timeLimitMinutes);

  const patch = (p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p }));

  function toggleBookmark(slug: string) {
    if (!signedIn) return router.push(loginHref);
    setBookmarked((prev) => {
      const next = new Set(prev);
      if (!next.delete(slug)) next.add(slug);
      return next;
    });
  }

  return (
    <section aria-labelledby="recommended-heading">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <h2 id="recommended-heading" className="text-xl font-semibold text-text">
          {goalRole ? "Recommended for you" : "Start with these problems"}
        </h2>
        <span className="text-sm text-muted">{shown.length} problems</span>
        <select
          aria-label="Sort"
          value={filters.sort}
          onChange={(e) => patch({ sort: e.target.value as Filters["sort"] })}
          className={`${selectClass} ml-auto`}
        >
          {Object.entries(SORTS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select
          aria-label="Category"
          value={filters.category}
          onChange={(e) => patch({ category: e.target.value as Filters["category"] })}
          className={`${selectClass} min-w-[184px]`}
        >
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Difficulty"
          value={filters.difficulty}
          onChange={(e) => patch({ difficulty: e.target.value as Filters["difficulty"] })}
          className={`${selectClass} min-w-[130px]`}
        >
          <option value="all">All levels</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY_LABEL[d]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 px-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={filters.hideSolved}
            onChange={(e) => patch({ hideSolved: e.target.checked })}
            className="h-4 w-4 accent-action"
          />
          Hide solved
        </label>
        <button type="button" onClick={() => setFilters(defaults)} className="text-sm text-action hover:underline">
          Reset
        </button>
      </div>

      <ul className="mt-5 flex flex-col gap-3">
        {shown.map((p) => (
          <li key={p.slug} className="relative flex flex-col gap-4 rounded border border-border bg-surface p-3 sm:flex-row">
            <div className="h-28 shrink-0 overflow-hidden rounded bg-canvas sm:w-[230px]">
              {p.thumbnailUrl ? (
                <Image
                  src={p.thumbnailUrl}
                  alt=""
                  width={240}
                  height={112}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-border">
                  <Icon name="terminal" className="h-8 w-8" />
                </div>
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col pr-8">
              <div className="flex flex-wrap items-center gap-3">
                <DifficultyPill difficulty={p.difficulty} />
                <span className="text-xs text-muted">{p.tags.join(" · ")}</span>
                {p.solved ? <span className="text-xs font-medium text-passed">Solved</span> : null}
              </div>
              <h3 className="mt-2 font-semibold text-text">
                <Link href={`/problems/${p.slug}`} className="hover:text-action">
                  {p.title}
                </Link>
              </h3>
              <p className="mt-1 text-sm text-muted">{p.shortDescription}</p>
              <div className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-2 pt-3 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <Icon name="clock" className="h-4 w-4" /> {p.timeLimitMinutes} min
                </span>
                <span>
                  <span className="text-medium">★</span> {p.averageRating.toFixed(1)} ({p.ratingCount})
                </span>
              </div>
            </div>

            <button
              type="button"
              aria-label={bookmarked.has(p.slug) ? "Remove bookmark" : "Bookmark"}
              aria-pressed={bookmarked.has(p.slug)}
              onClick={() => toggleBookmark(p.slug)}
              className={`absolute right-3 top-3 ${bookmarked.has(p.slug) ? "text-action" : "text-muted hover:text-text"}`}
            >
              <Icon name="bookmark" className={`h-5 w-5 ${bookmarked.has(p.slug) ? "fill-current" : ""}`} />
            </button>
            <Link
              href={`/problems/${p.slug}`}
              className="flex items-center justify-center gap-3 self-end rounded border border-border px-3 py-1.5 text-xs font-medium text-text hover:border-action hover:text-action"
            >
              Open problem <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
          </li>
        ))}
      </ul>
      {shown.length === 0 ? (
        <p className="mt-5 rounded border border-border px-4 py-6 text-center text-sm text-muted">
          No problems match these filters.
        </p>
      ) : null}
    </section>
  );
}
