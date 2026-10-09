// R4: pure scoring functions (03_scoring.md). No database - tested in test/r4-scoring.test.js.

/** Time bonus: under 25% of the limit → 2x, under 50% → 1.5x, under 75% → 1.25x, otherwise 1x (also past the limit, D9). */
export function timeMultiplier(seconds, limitMinutes) {
  const share = seconds / (limitMinutes * 60);
  if (share < 0.25) return 2;
  if (share < 0.5) return 1.5;
  if (share < 0.75) return 1.25;
  return 1;
}

/** final_points = base × time × efficiency, rounded. Efficiency from efficiencyScore (S3). */
export function finalPoints(basePoints, multiplier, efficiency = 1) {
  return Math.round(basePoints * multiplier * efficiency);
}

/**
 * Lines added / deleted between the original files and the submitted ones, per file as a multiset of lines.
 * ponytail: a moved line counts as unchanged and a changed line as one added + one deleted; switch to a real
 * line diff (LCS) if the profile ever shows diffs.
 */
export function lineChanges(original, submitted) {
  let added = 0;
  let deleted = 0;
  for (const path of new Set([...Object.keys(original), ...Object.keys(submitted)])) {
    const counts = new Map();
    for (const line of splitLines(original[path])) counts.set(line, (counts.get(line) ?? 0) + 1);
    for (const line of splitLines(submitted[path])) counts.set(line, (counts.get(line) ?? 0) - 1);
    for (const n of counts.values()) n > 0 ? (deleted += n) : (added -= n);
  }
  return { added, deleted };
}

const splitLines = (text) => (text ? text.replace(/\n$/, "").split("\n") : []);

/**
 * S2: solving time up to `at`, counted like the solve time (D56) - only inside tries, not the gaps between them.
 * tries = [{ startedAt, endedAt }] (endedAt null = open, runs to `at`). Whole seconds, never negative.
 */
export function activeSeconds(at, tries) {
  let ms = 0;
  for (const t of tries) {
    const start = t.startedAt.getTime();
    const end = Math.min(t.endedAt ? t.endedAt.getTime() : Infinity, at.getTime());
    if (end > start) ms += end - start;
  }
  return Math.floor(ms / 1000);
}

/**
 * S3: the AI session's benchmark per difficulty until problems have their own (S7). prompts/tokens as the solve
 * page showed them (was frontend mock/aiChat.ts); iterations (D51 a) added with S3.
 * ponytail: fixed guesses - S7 replaces them with each problem's averages.
 */
export const BENCHMARKS = {
  easy: { prompts: 4, tokens: 1500, iterations: 2 },
  medium: { prompts: 8, tokens: 3200, iterations: 3 },
  hard: { prompts: 14, tokens: 6500, iterations: 4 },
  get_a_job: { prompts: 20, tokens: 12000, iterations: 5 },
};

// D51 b: edit ratio's 15% spread proportionally over the other four (30/25/20/10 → /85).
const WEIGHTS = { prompts: 30 / 85, tokens: 25 / 85, iterations: 20 / 85, firstRun: 10 / 85 };
const clamp = (x) => Math.min(2, Math.max(0.5, x));
// Using none of something (no prompts, no iterations) is the best case.
const ratio = (benchmark, actual) => (actual > 0 ? clamp(benchmark / actual) : 2);

/**
 * S3 (D51 c): efficiency 0.5-2.0, rounded to 2 decimals (efficiency_score DECIMAL(5,2) = the value used for points).
 * session = { prompts, tokens, iterations, passedFirstRun }, benchmark = { prompts, tokens, iterations }.
 */
export function efficiencyScore(session, benchmark) {
  const score =
    WEIGHTS.prompts * ratio(benchmark.prompts, session.prompts) +
    WEIGHTS.tokens * ratio(benchmark.tokens, session.tokens) +
    WEIGHTS.iterations * ratio(benchmark.iterations, session.iterations) +
    WEIGHTS.firstRun * (session.passedFirstRun ? 2 : 0.5);
  return Math.round(clamp(score) * 100) / 100;
}

/** S7: solves a problem needs before its own averages replace the difficulty's benchmark. */
export const MIN_BENCHMARK_SOLVES = 5;

/**
 * S7: the benchmark for scoring - the problem's averages (problem_benchmarks row) once it has MIN_BENCHMARK_SOLVES
 * solves, otherwise the difficulty's constants. Averages are floored at 1: when early solvers used no AI, an average
 * of 0.2 prompts would make any single prompt score 0.5.
 */
export function pickBenchmark(row, difficulty) {
  if (!row || row.solve_count < MIN_BENCHMARK_SOLVES) return { ...BENCHMARKS[difficulty], source: "difficulty" };
  const floor = (x) => Math.max(1, Number(x));
  return {
    prompts: floor(row.avg_prompts),
    tokens: floor(row.avg_tokens),
    iterations: floor(row.avg_iterations),
    source: "problem",
  };
}
