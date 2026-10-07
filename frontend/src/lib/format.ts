const pad = (n: number) => String(n).padStart(2, "0");

/** Time left until a contest boundary: "08h 42m", "3d 08h", or "26d" from a week out. */
export function countdown(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days >= 7) return `${days}d`;
  if (days > 0) return `${days}d ${pad(hours)}h`;
  return `${pad(hours)}h ${pad(minutes % 60)}m`;
}

/** Solve time from seconds: "32:18", or "1:04:09" from an hour up. */
export const duration = (s: number) =>
  s >= 3600
    ? `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
    : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;

/** "Sep 28, 2026" */
export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
