import { Router } from "express";
import { pool } from "../../db.js";
import { optionalAuth } from "../auth/auth.service.js";
import { listContests } from "../contests/contests.routes.js";
import { listProblems } from "../problems/problems.routes.js";
import { getActivity, getSolved, getStats } from "../users/users.routes.js";

export const dashboardRouter = Router();

// GET /dashboard → Dashboard (frontend/src/lib/types/dashboard.ts). Live contests (T1) for guests too.
// Feed (D19, D24): every published problem the user has not solved, in the "recommended" order of GET /problems;
// the client filters it by category / difficulty (defaults from goal_role / experience_level), like /problems.
// Guests get the feed only.
dashboardRouter.get("/", optionalAuth, async (req, res) => {
  const userId = req.user?.id ?? null;
  const [problems, { live: contests }] = await Promise.all([listProblems(userId), listContests()]);
  const feed = problems.filter((p) => p.status !== "solved");
  if (!userId) return res.json({ contests, feed, inProgress: null, stats: null, activity: [], recentWins: [] });

  const [stats, activity, recentWins, inProgress] = await Promise.all([
    getStats(userId),
    getActivity(userId),
    getSolved(userId, 3),
    getInProgress(userId),
  ]);
  res.json({ contests, feed, inProgress, stats, activity, recentWins });
});

/**
 * The latest attempt in progress (of a published problem). Checks passed = the last Test run of the current try
 * (check_results since its started_at, newest result per check).
 */
async function getInProgress(userId) {
  const { rows } = await pool.query(
    `SELECT p.slug, p.title, cb.language, a.career_path, a.started_at AT TIME ZONE 'UTC' AS started_at,
       (SELECT count(*)::int FROM problem_checks k WHERE k.problem_id = p.id) AS checks_total,
       (SELECT count(*)::int FROM (
          SELECT DISTINCT ON (r.check_id) r.passed FROM check_results r
          WHERE r.attempt_id = a.id AND r.executed_at >= a.started_at
          ORDER BY r.check_id, r.executed_at DESC) last WHERE last.passed) AS checks_passed
     FROM user_problem_attempts a
     JOIN problems p ON p.id = a.problem_id AND p.is_published
     LEFT JOIN problem_codebase cb ON cb.problem_id = p.id
     WHERE a.user_id = $1 AND a.status = 'in_progress'
     ORDER BY a.started_at DESC
     LIMIT 1`,
    [userId],
  );
  const r = rows[0];
  return r
    ? {
        problemSlug: r.slug,
        careerPath: r.career_path, // K2: a path attempt resumes with ?path=
        title: r.title,
        language: r.language ?? "",
        checksPassed: r.checks_passed,
        checksTotal: r.checks_total,
        startedAt: r.started_at.toISOString(),
      }
    : null;
}
