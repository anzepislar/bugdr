import type { ActivityDay } from "@/lib/types/dashboard";

const DAY = 86_400_000;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAY_LABELS = ["M", "", "W", "", "F", "", ""];

// Days are UTC (D7).
export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Midnight UTC of the Monday of the week containing `now`. */
export function mondayOf(now: number): number {
  const midnight = now - (now % DAY);
  return midnight - ((new Date(midnight).getUTCDay() + 6) % 7) * DAY;
}

// Literal class names so Tailwind picks them up.
export function heatClass(solved: number | undefined): string {
  if (solved === undefined) return "";
  if (solved === 0) return "bg-border";
  if (solved === 1) return "bg-action/40";
  if (solved === 2) return "bg-action/70";
  return "bg-action";
}

/** Problems solved per day, one column per week ending with the current one. Scrolls sideways when narrow. */
export function ActivityGrid({
  activity,
  now,
  weeks,
  dayLabels = false,
}: {
  activity: ActivityDay[];
  now: number;
  weeks: number;
  dayLabels?: boolean;
}) {
  const byDate = new Map(activity.map((a) => [a.date, a.problemsSolved]));
  const today = isoDay(now);
  const firstDay = mondayOf(now) - (weeks - 1) * 7 * DAY;
  const columns = `${dayLabels ? "1rem " : ""}repeat(${weeks}, minmax(10px, 1fr))`;

  return (
    // row-reverse: when it has to scroll, it opens on the newest weeks.
    <div className="flex flex-row-reverse overflow-x-auto">
      {/* 10px cells + 4px gaps */}
      <div className="flex-1" style={{ minWidth: weeks * 14 + (dayLabels ? 20 : 0) }}>
        <div className="grid gap-x-1 text-[10px] text-muted" style={{ gridTemplateColumns: columns }}>
          {dayLabels ? <span /> : null}
          {Array.from({ length: weeks }, (_, w) => {
            const monthOf = (week: number) => new Date(firstDay + week * 7 * DAY).getUTCMonth();
            // A label needs ~2 columns: skip it in the last two, and at the start when the next month is that close.
            const starts = w === 0 ? monthOf(2) === monthOf(0) : monthOf(w) !== monthOf(w - 1);
            return <span key={w}>{starts && w < weeks - 2 ? MONTHS[monthOf(w)] : ""}</span>;
          })}
        </div>
        <div
          aria-label="Problems solved per day"
          role="img"
          className="mt-2 grid grid-flow-col grid-rows-7 gap-1"
          style={{ gridTemplateColumns: columns }}
        >
          {dayLabels
            ? DAY_LABELS.map((label, i) => (
                <span key={`label-${i}`} className="self-center text-[10px] leading-none text-muted">
                  {label}
                </span>
              ))
            : null}
          {Array.from({ length: weeks * 7 }, (_, i) => {
            const date = isoDay(firstDay + i * DAY);
            const solved = date > today ? undefined : (byDate.get(date) ?? 0);
            return (
              <span
                key={date}
                title={`${date}: ${solved ?? 0} solved`}
                className={`aspect-square rounded-[2px] ${heatClass(solved)}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
