import type { CategorySlug, Difficulty } from "@/lib/types/problem";

export const STATS_RANGES = { today: "Today", "7d": "7 days", "30d": "30 days", all: "All time" } as const;
export type StatsRange = keyof typeof STATS_RANGES;

/** A count for the selected range. `trendPct` = change vs. the previous period of the same length (null for all time). */
export interface RangedCount {
  value: number;
  trendPct: number | null;
}

/** GET /admin/stats?range= (slice A9). Charts are fixed windows, independent of the range. */
export interface AdminOverview {
  totalUsers: number;
  activeUsers: RangedCount;
  problemsPublished: number;
  solves: RangedCount;
  activeContests: number;
  /** Last 30 days, oldest first. */
  userGrowth: { date: string; signups: number; dau: number }[];
  /** Last 14 days, oldest first. */
  solvesPerDay: { date: string; solves: number }[];
  solvesByDifficulty: Record<Difficulty, number>;
  solvesByRole: { categorySlug: CategorySlug; solves: number }[];
  /** Users per current-streak bucket. */
  streaks: { range: string; users: number }[];
  topProblems: { slug: string; title: string; difficulty: Difficulty; solves: number }[];
  dropOff: { slug: string; title: string; started: number; solved: number }[];
}
