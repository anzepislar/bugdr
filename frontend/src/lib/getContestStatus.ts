export type ContestStatus = "draft" | "scheduled" | "active" | "ended";

/** Contest status is never stored: it always follows from the dates (04_admin.md). */
export function getContestStatus(contest: { starts_at: Date | null; ends_at: Date | null }): ContestStatus {
  if (!contest.starts_at) return "draft";
  const now = new Date();
  if (contest.starts_at > now) return "scheduled";
  if (contest.ends_at && contest.ends_at < now) return "ended";
  return "active";
}
