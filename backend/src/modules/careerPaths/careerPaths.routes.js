import { Router } from "express";
import { pool } from "../../db.js";
import { requireAuth } from "../auth/auth.service.js";
import { VISIBLE } from "../problems/problems.routes.js";
import { loadThresholds, stageProgress } from "./careerPaths.js";

// K2 (D66): every role is a path with its own problems; a user may follow any number of them at once.
export const careerPathsRouter = Router();

// D66 (f): a path problem comes back this long after it was last finished on the same path.
const ROTATION = "3 months";

/** The user's stage on a path (no row yet = Easy, not started). Pass a client to read inside a transaction. */
export async function stageOf(db, userId, role) {
  const { rows } = await db.query(
    "SELECT current_stage, stage_unlocked_at FROM career_path_progress WHERE user_id = $1 AND role = $2",
    [userId, role],
  );
  return rows[0] ?? null;
}

/**
 * D66 (d, f): the assigned problem - the path's attempt in progress, else the oldest published problem of the stage
 * that the user never finished on this path, else the oldest finished more than ROTATION ago. null = none left.
 * Finished = solved (solved_at) or given up (the last try's start). ponytail: given up uses started_at, not the
 * moment of giving up; add attempts.ended_at if that difference ever matters.
 */
export async function nextProblem(db, userId, role, stage) {
  const select = `SELECT p.id, p.slug, p.title, p.short_description, p.difficulty, p.time_limit_minutes`;
  const { rows: open } = await db.query(
    `${select}, TRUE AS in_progress FROM user_problem_attempts a JOIN problems p ON p.id = a.problem_id
     WHERE a.user_id = $1 AND a.career_path = $2 AND a.status = 'in_progress' AND p.is_published`,
    [userId, role],
  );
  if (open.length) return open[0];
  const { rows } = await db.query(
    `${select}, FALSE AS in_progress
     FROM problems p
     JOIN problem_career_paths pcp ON pcp.problem_id = p.id AND pcp.role = $2
     LEFT JOIN LATERAL (
       SELECT max(coalesce(a.solved_at, a.started_at)) AS at FROM user_problem_attempts a
       WHERE a.user_id = $1 AND a.problem_id = p.id AND a.career_path = $2 AND a.status <> 'in_progress'
     ) finished ON TRUE
     WHERE ${VISIBLE} AND p.difficulty = $3 AND (finished.at IS NULL OR finished.at < now() - interval '${ROTATION}')
     ORDER BY finished.at IS NOT NULL, p.created_at, p.id
     LIMIT 1`,
    [userId, role, stage],
  );
  return rows[0] ?? null;
}

/** stageProgress (careerPaths.js) from the user's solves on this path and stage, newest first. */
export async function progressOn(db, userId, role, stage, thresholds) {
  const t = thresholds[stage];
  if (!t) return null;
  const { rows } = await db.query(
    `SELECT coalesce(s.efficiency_score, 1)::float AS efficiency, coalesce(s.total_prompts, 0) AS prompts,
       coalesce(s.tests_passed_on_first_run, false) AS first_run, a.time_bonus_multiplier::float AS time_multiplier,
       count(*) OVER ()::int AS total
     FROM user_problem_attempts a
     JOIN problems p ON p.id = a.problem_id
     LEFT JOIN solve_sessions s ON s.attempt_id = a.id
     WHERE a.user_id = $1 AND a.career_path = $2 AND a.status = 'solved' AND p.difficulty = $3
     ORDER BY a.solved_at DESC
     LIMIT $4`,
    [userId, role, stage, t.solves],
  );
  return stageProgress(
    t,
    stage,
    rows.map((r) => ({ efficiency: r.efficiency, prompts: r.prompts, firstRun: r.first_run, timeMultiplier: r.time_multiplier })),
    rows[0]?.total ?? 0,
  );
}

/**
 * K2: after a solve on a path, inside the solve transaction (R4) - when the stage's threshold is met, the next stage
 * opens. The progress row is locked, so two solves at once cannot both move the stage.
 */
export async function checkUnlock(client, userId, role) {
  const { rows } = await client.query(
    "SELECT current_stage FROM career_path_progress WHERE user_id = $1 AND role = $2 FOR UPDATE",
    [userId, role],
  );
  const stage = rows[0]?.current_stage;
  if (!stage) return;
  const progress = await progressOn(client, userId, role, stage, await loadThresholds(client));
  if (!progress?.met) return;
  await client.query(
    "UPDATE career_path_progress SET current_stage = $3, stage_unlocked_at = now() WHERE user_id = $1 AND role = $2",
    [userId, role, progress.nextStage],
  );
}

// Every path with the user's stage, progress to the next stage and the assigned problem. The goal role (onboarding)
// comes first, then the categories in their usual order.
careerPathsRouter.get("/", requireAuth, async (req, res) => {
  const { rows: roles } = await pool.query(
    `SELECT c.slug, coalesce(c.slug = up.goal_role, false) AS is_goal_role
     FROM problem_categories c LEFT JOIN user_profiles up ON up.user_id = $1
     ORDER BY is_goal_role DESC, c.created_at, c.slug`,
    [req.user.id],
  );
  const thresholds = await loadThresholds(pool);
  const paths = await Promise.all(
    roles.map(async ({ slug: role, is_goal_role }) => {
      const row = await stageOf(pool, req.user.id, role);
      const stage = row?.current_stage ?? "easy";
      const [progress, next, solves] = await Promise.all([
        progressOn(pool, req.user.id, role, stage, thresholds),
        nextProblem(pool, req.user.id, role, stage),
        pool.query(
          `SELECT count(*)::int AS n FROM user_problem_attempts a JOIN problems p ON p.id = a.problem_id
           WHERE a.user_id = $1 AND a.career_path = $2 AND a.status = 'solved' AND p.difficulty = $3`,
          [req.user.id, role, stage],
        ),
      ]);
      return {
        role,
        isGoalRole: is_goal_role,
        started: Boolean(row),
        stage,
        stageUnlockedAt: row?.stage_unlocked_at ?? null,
        solvesOnStage: solves.rows[0].n,
        progress,
        nextProblem: next && {
          slug: next.slug,
          title: next.title,
          shortDescription: next.short_description,
          difficulty: next.difficulty,
          timeLimitMinutes: next.time_limit_minutes,
          inProgress: next.in_progress,
        },
      };
    }),
  );
  res.json({ paths });
});
