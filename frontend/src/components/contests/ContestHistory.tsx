import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { ContestHistoryEntry, ContestResult } from "@/lib/types/contest";

/** "1/1 solved · 375 pts" (D32). */
export const resultText = (r: ContestResult) =>
  `${r.problemsSolved}/${r.problemCount} solved · ${r.score.toLocaleString("en-US")} pts`;

/** contest_entries of one user, newest first. Used on /contests and on the profile. */
export function ContestHistory({ entries }: { entries: ContestHistoryEntry[] }) {
  if (entries.length === 0) return <p className="mt-4 text-sm text-muted">No contests entered yet.</p>;

  return (
    <ul className="mt-4 divide-y divide-border">
      {entries.map((e) => {
        const completed = e.problemsSolved === e.problemCount;
        return (
          <li
            key={e.contestId}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm sm:grid sm:grid-cols-[minmax(0,1fr)_8rem_10rem_7rem] sm:items-center sm:gap-6"
          >
            <Link href={`/contests/${e.contestId}`} className="w-full truncate text-text hover:text-action sm:w-auto">
              {e.title}
            </Link>
            <span
              className={`w-fit rounded px-2 py-1 text-xs font-semibold ${
                completed ? "bg-action/15 text-action" : "bg-border/60 text-muted"
              }`}
            >
              {completed ? "Completed" : "Incomplete"}
            </span>
            <span className="text-muted">{resultText(e)}</span>
            <span className="text-muted sm:text-right">{formatDate(e.endedAt)}</span>
          </li>
        );
      })}
    </ul>
  );
}
