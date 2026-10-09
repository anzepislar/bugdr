import type { CategorySlug, Difficulty } from "./problem";

/** One threshold of the current stage (K2, D66 e): the average of the last solves vs. the target. */
export interface StageMetric {
  key: "efficiency" | "prompts" | "firstRun" | "timeMultiplier";
  /** null before the first solve on the stage. firstRun is a share 0-1. */
  value: number | null;
  target: number;
  /** min = at least the target, max = at most. */
  direction: "min" | "max";
  met: boolean;
}

/** One row of GET /career-paths. */
export interface CareerPath {
  role: CategorySlug;
  /** The onboarding role (listed first). */
  isGoalRole: boolean;
  /** Started = the user started a problem on it at least once. */
  started: boolean;
  stage: Difficulty;
  stageUnlockedAt: string | null;
  solvesOnStage: number;
  /** null on the last stage (Get a job). */
  progress: {
    solves: number;
    required: number;
    nextStage: Difficulty;
    metrics: StageMetric[];
    met: boolean;
  } | null;
  /** The assigned problem; null = none left on the stage right now (new ones come, or old ones rotate back). */
  nextProblem: {
    slug: string;
    title: string;
    shortDescription: string;
    difficulty: Difficulty;
    timeLimitMinutes: number;
    inProgress: boolean;
  } | null;
}
