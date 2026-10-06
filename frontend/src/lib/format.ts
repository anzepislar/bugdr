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
