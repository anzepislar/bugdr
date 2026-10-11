// Two-axis benchmarks for the post-solve feedback: problem difficulty × the user's experience. Only the feedback uses
// them - the efficiency score and points still come from scoring.js (BENCHMARKS there, problem averages from S7).

/** @typedef {'beginner' | 'mid' | 'senior'} ExperienceLevel */
/** @typedef {'easy' | 'medium' | 'hard' | 'get_a_job'} Difficulty */
/** @typedef {{ timeMinutes: number, prompts: number, tokens: number, efficiencyFloor: number }} BenchmarkTarget */
/** @typedef {'excellent' | 'on_target' | 'below' | 'struggling'} Tier */

/** @type {Record<Difficulty, Partial<Record<ExperienceLevel, BenchmarkTarget>>>} */
export const FEEDBACK_BENCHMARKS = {
  easy: {
    beginner: { timeMinutes: 20, prompts: 5, tokens: 4000, efficiencyFloor: 1.4 },
    mid: { timeMinutes: 12, prompts: 4, tokens: 3000, efficiencyFloor: 1.6 },
    senior: { timeMinutes: 6, prompts: 2, tokens: 2000, efficiencyFloor: 2.0 },
  },
  medium: {
    beginner: { timeMinutes: 40, prompts: 10, tokens: 10000, efficiencyFloor: 1.2 },
    mid: { timeMinutes: 22, prompts: 7, tokens: 8000, efficiencyFloor: 1.5 },
    senior: { timeMinutes: 14, prompts: 5, tokens: 6000, efficiencyFloor: 1.8 },
  },
  hard: {
    beginner: { timeMinutes: 70, prompts: 18, tokens: 20000, efficiencyFloor: 1.0 },
    mid: { timeMinutes: 38, prompts: 12, tokens: 15000, efficiencyFloor: 1.3 },
    senior: { timeMinutes: 22, prompts: 8, tokens: 10000, efficiencyFloor: 1.5 },
  },
  get_a_job: {
    // No beginner benchmark - solving at any speed is an achievement.
    mid: { timeMinutes: 60, prompts: 20, tokens: 25000, efficiencyFloor: 1.1 },
    senior: { timeMinutes: 40, prompts: 15, tokens: 20000, efficiencyFloor: 1.3 },
  },
};

/** @returns {BenchmarkTarget | null} null = no benchmark for this combination (beginner + get_a_job). */
export function getBenchmark(difficulty, experienceLevel) {
  return FEEDBACK_BENCHMARKS[difficulty]?.[experienceLevel] ?? null;
}

/**
 * user_profiles.experience_level (student / junior / mid / senior, set in onboarding and /settings) → ExperienceLevel.
 * The profile has no years of experience; unknown or not set → 'mid'.
 * @returns {ExperienceLevel}
 */
export function mapUserToExperienceLevel(user) {
  const level = user?.experienceLevel ?? user?.experience_level;
  if (level === "student" || level === "junior") return "beginner";
  if (level === "senior") return "senior";
  return "mid";
}

/** @returns {Tier} ratio = target / actual, so > 1 is better than the target. */
export function tier(ratio) {
  if (ratio > 1.2) return "excellent";
  if (ratio >= 0.8) return "on_target";
  if (ratio >= 0.5) return "below";
  return "struggling";
}

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * What the solve was measured against - stored on the attempt at solve time (user_problem_attempts.benchmark_snapshot)
 * so a later switch to real percentiles keeps the history. Zero prompts/tokens count as 1 (a ratio stays finite).
 * @param {{ seconds: number, prompts: number, tokens: number }} actual
 */
export function benchmarkSnapshot(difficulty, experienceLevel, actual) {
  const targets = getBenchmark(difficulty, experienceLevel);
  const ratios = targets && {
    time: round2((targets.timeMinutes * 60) / Math.max(1, actual.seconds)),
    prompts: round2(targets.prompts / Math.max(1, actual.prompts)),
    tokens: round2(targets.tokens / Math.max(1, actual.tokens)),
  };
  return { difficulty, experienceLevel, targets, ratios };
}
