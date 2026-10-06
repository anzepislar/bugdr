import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { ActivityDay, DashboardStats, RecentWin } from "@/lib/types/dashboard";

const DAY = 86_400_000;
const WEEKS = 17;
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

// Days are UTC (D7).
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Midnight UTC of the Monday of the week containing `now`. */
function mondayOf(now: number): number {
  const midnight = now - (now % DAY);
  return midnight - ((new Date(midnight).getUTCDay() + 6) % 7) * DAY;
}

// Literal class names so Tailwind picks them up.
function heatClass(solved: number | undefined): string {
  if (solved === undefined) return "";
  if (solved === 0) return "bg-border";
  if (solved === 1) return "bg-action/40";
  if (solved === 2) return "bg-action/70";
  return "bg-action";
}

export function ProgressPanel({
  stats,
  activity,
  recentWins,
  now,
  profileHref,
}: {
  stats: DashboardStats;
  activity: ActivityDay[];
  recentWins: RecentWin[];
  now: number;
  profileHref: string;
}) {
  const byDate = new Map(activity.map((a) => [a.date, a]));
  const today = isoDay(now);
  const yesterday = isoDay(now - DAY);
  const monday = mondayOf(now);
  const firstDay = monday - (WEEKS - 1) * 7 * DAY;

  const { level, nextLevel, totalPoints } = stats;
  const progress = nextLevel ? (totalPoints - level.minPoints) / (nextLevel.minPoints - level.minPoints) : 1;
  const solvedThisMonth = activity
    .filter((a) => a.date.startsWith(today.slice(0, 7)))
    .reduce((sum, a) => sum + a.problemsSolved, 0);

  return (
    <aside aria-labelledby="progress-heading" className="rounded border border-border bg-surface p-6">
      <div className="flex items-center justify-between">
        <h2 id="progress-heading" className="text-xl font-semibold text-text">
          Your progress
        </h2>
        <Link href={profileHref} aria-label="Open profile" className="text-muted hover:text-action">
          <Icon name="arrowRight" />
        </Link>
      </div>

      <div className="mt-5 flex items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded bg-canvas text-2xl font-semibold text-action">
          {level.order}
        </span>
        <div>
          <p className="text-lg font-semibold text-text">{level.name}</p>
          <p className="text-sm text-muted">
            {nextLevel
              ? `${(nextLevel.minPoints - totalPoints).toLocaleString("en-US")} points to ${nextLevel.name}`
              : "Top level reached"}
          </p>
        </div>
      </div>
      <div
        role="progressbar"
        aria-label={`Progress to ${nextLevel?.name ?? level.name}`}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-5 h-1.5 overflow-hidden rounded-full bg-border"
      >
        <div className="h-full rounded-full bg-action" style={{ width: `${progress * 100}%` }} />
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 border-b border-border pb-6">
        <div>
          <dd className="text-3xl font-semibold text-text">{stats.problemsSolved.toLocaleString("en-US")}</dd>
          <dt className="mt-1 text-xs text-muted">Problems solved</dt>
        </div>
        <div>
          <dd className="text-3xl font-semibold text-text">{totalPoints.toLocaleString("en-US")}</dd>
          <dt className="mt-1 text-xs text-muted">Total points</dt>
        </div>
      </dl>

      <div className="mt-6 flex items-baseline justify-between">
        <h3 className="font-semibold text-text">{stats.currentStreak}-day streak</h3>
        <span className="text-xs text-muted">Best: {stats.longestStreak}</span>
      </div>
      <ol className="mt-4 grid grid-cols-7 gap-2 text-center">
        {WEEKDAYS.map((label, i) => {
          const date = isoDay(monday + i * DAY);
          const active = (byDate.get(date)?.problemsOpened ?? 0) > 0;
          return (
            <li key={i} className="flex flex-col items-center gap-2 text-[11px] text-muted">
              {label}
              <span
                aria-label={`${date}: ${active ? "active" : date > today ? "upcoming" : "no activity"}`}
                className={`flex h-7 w-7 items-center justify-center rounded-full ${
                  active ? "bg-action text-canvas" : date > today ? "border border-border" : "bg-border"
                }`}
              >
                {active ? <Icon name="check" className="h-4 w-4" /> : null}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-8">
        <div className="grid text-[10px] text-muted" style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}>
          {Array.from({ length: WEEKS }, (_, w) => {
            const month = new Date(firstDay + w * 7 * DAY).getUTCMonth();
            const prev = new Date(firstDay + (w - 1) * 7 * DAY).getUTCMonth();
            return <span key={w}>{w === 0 || month !== prev ? MONTHS[month] : ""}</span>;
          })}
        </div>
        <div
          aria-label="Problems solved per day"
          role="img"
          className="mt-2 grid grid-flow-col grid-rows-7 gap-1"
          style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: WEEKS * 7 }, (_, i) => {
            const date = isoDay(firstDay + i * DAY);
            const solved = date > today ? undefined : (byDate.get(date)?.problemsSolved ?? 0);
            return <span key={date} title={`${date}: ${solved ?? 0} solved`} className={`aspect-square rounded-[2px] ${heatClass(solved)}`} />;
          })}
        </div>
        <p className="mt-4 text-xs text-muted">{solvedThisMonth} solved this month</p>
      </div>

      <div className="mt-6 border-t border-border pt-6">
        <h3 className="font-semibold text-text">Recent wins</h3>
        <ul className="mt-4 flex flex-col gap-4">
          {recentWins.map((win) => {
            const day = isoDay(Date.parse(win.solvedAt));
            const when = day === today ? "Today" : day === yesterday ? "Yesterday" : day;
            return (
              <li key={win.problemSlug} className="flex gap-3">
                <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-action" />
                <div>
                  <Link href={`/problems/${win.problemSlug}`} className="text-sm text-text hover:text-action">
                    {win.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {when} · {Math.round(win.timeTakenSeconds / 60)} min
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        {recentWins.length === 0 ? <p className="mt-4 text-sm text-muted">Solve a problem to see it here.</p> : null}
      </div>
    </aside>
  );
}
