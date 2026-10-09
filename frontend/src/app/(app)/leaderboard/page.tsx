import Link from "next/link";
import { serverFetch } from "@/lib/serverApi";
import type { LeaderboardEntry, LeaderboardPeriod } from "@/lib/types/leaderboard";

const PERIODS: Record<LeaderboardPeriod, string> = { all: "All time", month: "This month" };
const th = "pb-2 text-left text-xs font-medium uppercase tracking-wide text-muted";
const td = "border-b border-border py-3";

// S4 (D52): public leaderboard - top 100 by points, all time or this UTC month.
export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: raw } = await searchParams;
  const period: LeaderboardPeriod = raw === "month" ? "month" : "all";
  const res = await serverFetch(`/leaderboard?period=${period}`);
  if (!res.ok) throw new Error(`GET /leaderboard failed: ${res.status}`);
  const { entries } = (await res.json()) as { entries: LeaderboardEntry[] };

  return (
    <div className="w-full px-6 py-8 wide:mx-auto wide:max-w-[1200px]">
      <h1 className="text-3xl font-semibold text-text">Leaderboard</h1>
      <p className="mt-2 text-muted">
        The top 100 engineers by points. Points reward harder problems, fast solves and efficient use of AI.
      </p>

      <nav aria-label="Leaderboard period" className="mt-8 flex gap-8 overflow-x-auto border-b border-border">
        {(Object.keys(PERIODS) as LeaderboardPeriod[]).map((p) => (
          <Link
            key={p}
            href={p === "all" ? "/leaderboard" : "/leaderboard?period=month"}
            aria-current={p === period ? "page" : undefined}
            className={`shrink-0 border-b-2 pb-3 text-sm ${
              p === period ? "border-action font-semibold text-action" : "border-transparent text-muted hover:text-text"
            }`}
          >
            {PERIODS[p]}
          </Link>
        ))}
      </nav>

      {entries.length === 0 ? (
        <p className="mt-8 rounded border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {period === "month" ? "Nobody has earned points this month yet." : "Nobody has earned points yet."}{" "}
          <Link href="/problems" className="text-action hover:underline">
            Solve a problem
          </Link>{" "}
          to get on the board.
        </p>
      ) : (
        <table className="mt-6 w-full table-fixed text-sm">
          <thead>
            <tr>
              <th className={`${th} w-14`}>Rank</th>
              <th className={th}>Engineer</th>
              <th className={`${th} hidden w-28 md:table-cell`}>Level</th>
              <th className={`${th} hidden w-20 text-right sm:table-cell`}>Solved</th>
              <th className={`${th} hidden w-32 text-right md:table-cell`}>AI efficiency</th>
              <th className={`${th} w-24 text-right`}>Points</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.username} className={e.you ? "bg-action/10" : undefined}>
                <td className={`${td} pl-2 tabular-nums ${e.rank <= 3 ? "font-semibold text-text" : "text-muted"}`}>
                  {e.rank}
                </td>
                <td className={`${td} pr-3`}>
                  <div className="flex min-w-0 items-center gap-2">
                    <Link href={`/profile/${e.username}`} className="truncate font-medium text-text hover:text-action">
                      {e.displayName}
                    </Link>
                    {e.you ? (
                      <span className="shrink-0 rounded bg-action/15 px-1.5 py-0.5 text-[11px] font-semibold text-action">
                        You
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted">@{e.username}</p>
                </td>
                <td className={`${td} hidden truncate text-muted md:table-cell`}>{e.level}</td>
                <td className={`${td} hidden text-right tabular-nums text-muted sm:table-cell`}>{e.problemsSolved}</td>
                <td className={`${td} hidden text-right tabular-nums text-muted md:table-cell`}>
                  {e.avgEfficiency === null ? "-" : `${e.avgEfficiency.toFixed(2)}x`}
                </td>
                <td className={`${td} pr-2 text-right font-semibold tabular-nums text-text`}>
                  {e.points.toLocaleString("en-US")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {entries.length > 0 ? <p className="mt-4 text-sm text-muted">Showing the top {entries.length}</p> : null}
    </div>
  );
}
