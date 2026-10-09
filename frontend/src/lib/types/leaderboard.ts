export type LeaderboardPeriod = "all" | "month";

/** One row of GET /leaderboard (S4, D52): top 100 by points. */
export interface LeaderboardEntry {
  rank: number;
  username: string;
  displayName: string;
  /** Overall level, also on the monthly board. */
  level: string;
  /** Points in the period. */
  points: number;
  problemsSolved: number;
  /** Average AI efficiency (0.5-2.0) of the period's solves; null without a scored solve. */
  avgEfficiency: number | null;
  /** The signed-in user's own row. */
  you: boolean;
}
