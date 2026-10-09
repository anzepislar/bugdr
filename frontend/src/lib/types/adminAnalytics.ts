import type { Difficulty } from "@/lib/types/problem";

export interface ModelUsage {
  model: string;
  /** platform = free model on the platform key, user = the user's own key (S6). */
  keySource: "platform" | "user";
  prompts: number;
}

/** GET /admin/analytics (S5), all time. Averages are null when there is no scored solve. */
export interface AdminAnalytics {
  totals: {
    scoredSolves: number;
    avgPrompts: number | null;
    avgTokens: number | null;
    avgEfficiency: number | null;
    /** 0-100 */
    firstRunPassRate: number | null;
  };
  promptsByDifficulty: { difficulty: Difficulty; avgPrompts: number | null }[];
  /** Six buckets from 0.5 to 2.0. */
  efficiencyDistribution: { range: string; solves: number }[];
  models: ModelUsage[];
  /** Last 12 UTC weeks (Monday), the current one last. */
  efficiencyByWeek: { week: string; avgEfficiency: number | null; solves: number }[];
  problems: ProblemAnalytics[];
}

export interface ProblemAnalytics {
  id: string;
  slug: string;
  title: string;
  difficulty: Difficulty;
  /** Scored solves in the problem's benchmark (S7). */
  solves: number;
  avgPrompts: number | null;
  avgTokens: number | null;
  avgIterations: number | null;
  avgEfficiency: number | null;
  firstRunPassRate: number | null;
  /** problem = its own averages score its solves now; difficulty = the per-difficulty constants (under 5 solves). */
  benchmarkSource: "problem" | "difficulty";
}

/** GET /admin/analytics/problems/:id */
export interface ProblemAnalyticsDetail {
  models: ModelUsage[];
  benchmark: { prompts: number; tokens: number; iterations: number; source: "problem" | "difficulty" };
}
