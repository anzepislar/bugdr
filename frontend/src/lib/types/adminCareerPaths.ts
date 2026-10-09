import type { CategorySlug, Difficulty } from "./problem";

export type LeavableStage = "easy" | "medium" | "hard";

/** To leave a stage (K3, same for every path). firstRun is a share 0-1; timeMultiplier null = no time rule. */
export interface StageThreshold {
  solves: number;
  efficiency: number;
  prompts: number;
  firstRun: number;
  timeMultiplier: number | null;
}
export type Thresholds = Record<LeavableStage, StageThreshold>;

/** GET /admin/career-paths. Counts are per (engineer, path), except totals.engineers. */
export interface AdminCareerPaths {
  thresholds: Thresholds;
  stuckDays: number;
  totals: { engineers: number; reachedGetAJob: number; stuck: number };
  paths: { role: CategorySlug; engineers: number; stages: Record<Difficulty, number> }[];
  stages: {
    stage: LeavableStage;
    reached: number;
    passed: number;
    /** passed / reached; null when nobody reached it. */
    passRate: number | null;
    stuck: number;
    /** What the stuck ones still miss, most common first. */
    blockers: { key: "solves" | "efficiency" | "prompts" | "firstRun" | "timeMultiplier"; count: number }[];
  }[];
}
