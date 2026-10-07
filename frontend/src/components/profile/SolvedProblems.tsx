"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isoDay } from "@/components/ActivityGrid";
import { DifficultyPill } from "@/components/DifficultyPill";
import { Icon } from "@/components/Icon";
import { duration, formatDate } from "@/lib/format";
import type { SolvedProblem } from "@/lib/types/profile";

const DAY = 86_400_000;

/**
 * Solved problems as a table. `infinite` loads the screen plus one row first and about a screenful
 * each time the end comes into view; otherwise every row passed in is shown.
 */
export function SolvedProblems({ items, now, infinite = false }: { items: SolvedProblem[]; now: number; infinite?: boolean }) {
  const [batch, setBatch] = useState({ first: 20, more: 20 });
  const [limit, setLimit] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const endRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    if (!infinite) return;
    function fit() {
      const ul = listRef.current;
      const row = ul?.firstElementChild as HTMLElement | null;
      if (!ul || !row) return;
      const above = ul.getBoundingClientRect().top + window.scrollY;
      const rows = Math.ceil(window.innerHeight / row.offsetHeight);
      setBatch({ first: Math.max(1, Math.ceil((window.innerHeight - above) / row.offsetHeight)) + 1, more: rows });
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [infinite]);

  const visible = infinite ? (limit ?? batch.first) : items.length;
  const hasMore = visible < items.length;

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

  if (items.length === 0) return <p className="mt-4 text-sm text-muted">No problems solved yet.</p>;

  const today = isoDay(now);
  const yesterday = isoDay(now - DAY);
  const when = (iso: string) => {
    const day = isoDay(Date.parse(iso));
    return day === today ? "Today" : day === yesterday ? "Yesterday" : formatDate(iso);
  };
  const columns = "sm:grid sm:grid-cols-[minmax(0,1fr)_6rem_5rem_7rem] sm:gap-6 md:grid-cols-[minmax(0,1fr)_8rem_6rem_8rem]";

  return (
    <>
      <div
        aria-hidden
        className={`mt-4 hidden rounded bg-surface px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted ${columns}`}
      >
        <span>Problem</span>
        <span>Difficulty</span>
        <span>Time</span>
        <span>Solved</span>
      </div>
      <ul ref={listRef} className="mt-2 divide-y divide-border sm:mt-0">
        {items.slice(0, visible).map((p, i) => (
          <li key={i} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 text-sm sm:items-center ${columns}`}>
            <span className="flex w-full min-w-0 items-center gap-3 sm:w-auto">
              <Icon name="check" className="h-4 w-4 shrink-0 text-action" />
              <Link href={`/problems/${p.problemSlug}`} className="truncate text-text hover:text-action">
                {p.title}
              </Link>
            </span>
            <span>
              <DifficultyPill difficulty={p.difficulty} />
            </span>
            <span className="tabular-nums text-muted">
              <span className="sr-only">Time </span>
              {duration(p.timeTakenSeconds)}
            </span>
            <span className="text-muted">{when(p.solvedAt)}</span>
          </li>
        ))}
      </ul>
      {infinite ? (
        <p ref={endRef} className="mt-4 text-sm text-muted">
          Showing {Math.min(visible, items.length)} of {items.length}
        </p>
      ) : null}
    </>
  );
}
