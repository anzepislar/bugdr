import { formatUtcDateTime } from "@/lib/format";

type ContestType = "daily" | "weekly" | "monthly";

const DAY = 86_400_000;

/**
 * The next run of a contest of this type, in UTC (D7):
 * daily = next midnight for 24 hours, weekly = next Monday 00:00 to Sunday 23:59:59,
 * monthly = 1st of next month 00:00 to the last day 23:59:59.
 */
export function getContestDates(type: ContestType): { starts_at: Date; ends_at: Date; preview: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();

  let start: Date;
  let next: Date;
  if (type === "daily") {
    start = new Date(Date.UTC(y, m, d + 1));
    next = new Date(start.getTime() + DAY);
  } else if (type === "weekly") {
    // getUTCDay: Sunday 0, Monday 1. On a Monday the next Monday is a week away.
    start = new Date(Date.UTC(y, m, d + ((8 - now.getUTCDay()) % 7 || 7)));
    next = new Date(start.getTime() + 7 * DAY);
  } else {
    start = new Date(Date.UTC(y, m + 1, 1));
    next = new Date(Date.UTC(y, m + 2, 1));
  }
  const end = new Date(next.getTime() - 1000);

  return { starts_at: start, ends_at: end, preview: `${formatUtcDateTime(start.toISOString())} – ${formatUtcDateTime(end.toISOString())} UTC` };
}
