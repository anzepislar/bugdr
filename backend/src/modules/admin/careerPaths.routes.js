import { Router } from "express";
import { pool } from "../../db.js";
import { HttpError } from "../../errors.js";
import { loadThresholds, STAGES } from "../careerPaths/careerPaths.js";
import { progressOn } from "../careerPaths/careerPaths.routes.js";

// K3: career path thresholds (same for every path) and path metrics (04 "Career path metrics") for the admin.
export const adminCareerPathsRouter = Router();

const LEAVABLE = ["easy", "medium", "hard"];
// "Stuck" = no solve on that path for this long (user, 10. 10. 2026); Get a job is never stuck.
const STUCK_DAYS = 30;

const thresholdsOut = (t) =>
  Object.fromEntries(LEAVABLE.map((s) => [s, { ...t[s], timeMultiplier: t[s].timeMultiplier ?? null }]));

/**
 * Thresholds + metrics. One row per (engineer, path): an engineer on two paths counts on both, except in
 * totals.engineers. Pass rate of a stage = rows past it / rows that reached it (no stage history is kept).
 * Blockers = what the stuck rows on a stage still miss (not enough solves, or an average under its target).
 */
adminCareerPathsRouter.get("/", async (req, res) => {
  const thresholds = await loadThresholds(pool);
  const { rows } = await pool.query(
    `SELECT cp.user_id, cp.role, cp.current_stage,
       cp.current_stage <> 'get_a_job' AND coalesce(
         (SELECT max(a.solved_at) FROM user_problem_attempts a WHERE a.user_id = cp.user_id AND a.career_path = cp.role),
         cp.started_at) < now() - make_interval(days => $1) AS stuck
     FROM career_path_progress cp`,
    [STUCK_DAYS],
  );
  const { rows: roles } = await pool.query("SELECT slug FROM problem_categories ORDER BY created_at, slug");
  const at = (r) => STAGES.indexOf(r.current_stage);

  // ponytail: one progress query per stuck row; fine for hundreds, aggregate in SQL if it grows.
  const blockers = Object.fromEntries(LEAVABLE.map((s) => [s, {}]));
  for (const r of rows.filter((r) => r.stuck)) {
    const p = await progressOn(pool, r.user_id, r.role, r.current_stage, thresholds);
    const missing = [...(p.solves < p.required ? ["solves"] : []), ...p.metrics.filter((m) => !m.met).map((m) => m.key)];
    for (const key of missing) blockers[r.current_stage][key] = (blockers[r.current_stage][key] ?? 0) + 1;
  }

  res.json({
    thresholds: thresholdsOut(thresholds),
    stuckDays: STUCK_DAYS,
    totals: {
      engineers: new Set(rows.map((r) => r.user_id)).size,
      reachedGetAJob: new Set(rows.filter((r) => r.current_stage === "get_a_job").map((r) => r.user_id)).size,
      stuck: rows.filter((r) => r.stuck).length,
    },
    paths: roles.map(({ slug }) => {
      const mine = rows.filter((r) => r.role === slug);
      return {
        role: slug,
        engineers: mine.length,
        stages: Object.fromEntries(STAGES.map((s) => [s, mine.filter((r) => r.current_stage === s).length])),
      };
    }),
    stages: LEAVABLE.map((stage, i) => {
      const reached = rows.filter((r) => at(r) >= i).length;
      const passed = rows.filter((r) => at(r) > i).length;
      return {
        stage,
        reached,
        passed,
        passRate: reached ? passed / reached : null,
        stuck: rows.filter((r) => r.stuck && r.current_stage === stage).length,
        blockers: Object.entries(blockers[stage])
          .map(([key, count]) => ({ key, count }))
          .sort((a, b) => b.count - a.count),
      };
    }),
  });
});

// Field → [min, max] (inclusive; prompts > 0), same as the CHECKs of migration 0025.
const LIMITS = { solves: [1, 50], efficiency: [0.5, 2], prompts: [0.1, 100], firstRun: [0, 1], timeMultiplier: [1, 2] };

/** Replaces all three stages at once; timeMultiplier null = no time rule. Applies from each engineer's next solve. */
adminCareerPathsRouter.put("/thresholds", async (req, res) => {
  const details = {};
  for (const stage of LEAVABLE) {
    const t = req.body?.[stage];
    for (const [key, [min, max]] of Object.entries(LIMITS)) {
      const v = t?.[key];
      if (key === "timeMultiplier" && v === null) continue;
      const ok = typeof v === "number" && Number.isFinite(v) && v >= min && v <= max && (key !== "solves" || Number.isInteger(v));
      if (!ok) details[`${stage}.${key}`] = key === "solves" ? `A whole number ${min}-${max}` : `${min}-${max}`;
    }
  }
  if (Object.keys(details).length) throw new HttpError(400, "VALIDATION_ERROR", "Check the highlighted fields", details);

  await pool.query(
    `UPDATE career_path_thresholds t SET solves = v.solves, efficiency = v.efficiency, prompts = v.prompts,
       first_run = v.first_run, time_multiplier = v.time_multiplier, updated_at = now()
     FROM json_to_recordset($1) AS v (stage TEXT, solves INT, efficiency NUMERIC, prompts NUMERIC, first_run NUMERIC,
       time_multiplier NUMERIC)
     WHERE t.stage = v.stage`,
    [
      JSON.stringify(
        LEAVABLE.map((stage) => {
          const t = req.body[stage];
          return {
            stage,
            solves: t.solves,
            efficiency: t.efficiency,
            prompts: t.prompts,
            first_run: t.firstRun,
            time_multiplier: t.timeMultiplier,
          };
        }),
      ),
    ],
  );
  res.json({ thresholds: thresholdsOut(await loadThresholds(pool)) });
});
