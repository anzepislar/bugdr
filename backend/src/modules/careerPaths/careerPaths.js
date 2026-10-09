// K2 (D66): career path stages and unlock thresholds. Pure - tested in test/k2-thresholds.test.js.
// K3: the thresholds live in career_path_thresholds (admin-editable, same for every path); see loadThresholds.

export const STAGES = ["easy", "medium", "hard", "get_a_job"];

const EPS = 1e-9;
export const DIRECTION = { efficiency: "min", prompts: "max", firstRun: "min", timeMultiplier: "min" };

/**
 * { easy, medium, hard } → { solves, efficiency, prompts, firstRun, timeMultiplier? }. To leave a stage: at least
 * `solves` solves on it, and the averages of the last `solves` solves meet every target (min = at least, max = at
 * most). No time multiplier = no time rule. Get a job is the last stage (no row).
 */
export async function loadThresholds(db) {
  const { rows } = await db.query(
    `SELECT stage, solves, efficiency::float, prompts::float, first_run::float, time_multiplier::float
     FROM career_path_thresholds`,
  );
  return Object.fromEntries(
    rows.map((r) => [
      r.stage,
      {
        solves: r.solves,
        efficiency: r.efficiency,
        prompts: r.prompts,
        firstRun: r.first_run,
        ...(r.time_multiplier !== null && { timeMultiplier: r.time_multiplier }),
      },
    ]),
  );
}

/**
 * Progress on `stage` against its thresholds `t` (undefined on the last stage → null), from the stage's solves (newest
 * first; only the first t.solves are used) and their total count.
 * Each solve: { efficiency, prompts, firstRun (boolean), timeMultiplier }. met = enough solves and every target met.
 */
export function stageProgress(t, stage, solves, total) {
  if (!t) return null;
  const recent = solves.slice(0, t.solves);
  const avg = (pick) => (recent.length ? recent.reduce((sum, s) => sum + pick(s), 0) / recent.length : null);
  const values = {
    efficiency: avg((s) => s.efficiency),
    prompts: avg((s) => s.prompts),
    firstRun: avg((s) => (s.firstRun ? 1 : 0)),
    timeMultiplier: avg((s) => s.timeMultiplier),
  };
  const metrics = Object.keys(DIRECTION)
    .filter((key) => t[key] !== undefined)
    .map((key) => {
      const value = values[key];
      const direction = DIRECTION[key];
      // EPS: float sums (1.1 + 1.3 = 2.4000000000000004) must not decide a threshold.
      const met = value !== null && (direction === "min" ? value >= t[key] - EPS : value <= t[key] + EPS);
      // Compared unrounded; shown with two decimals.
      return { key, value: value === null ? null : Math.round(value * 100) / 100, target: t[key], direction, met };
    });
  return {
    solves: total,
    required: t.solves,
    nextStage: STAGES[STAGES.indexOf(stage) + 1],
    metrics,
    met: total >= t.solves && metrics.every((m) => m.met),
  };
}
