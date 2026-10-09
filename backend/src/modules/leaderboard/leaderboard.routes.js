import { Router } from "express";
import { pool } from "../../db.js";
import { HttpError } from "../../errors.js";
import { optionalAuth } from "../auth/auth.service.js";
import { getLevels, levelFor } from "../levels/levels.js";

export const leaderboardRouter = Router();

const LIMIT = 100;

/**
 * S4 (D52): the top 100 by points - all time, or points earned this UTC calendar month - from the ledger
 * (point_transactions, so both periods are counted the same way). Public, also for guests. Private profiles (D34),
 * banned users and users without points are left out; ties share a rank. `you` marks the signed-in user's row.
 * Solves and average efficiency are for the same period; the level is always the overall one.
 */
leaderboardRouter.get("/", optionalAuth, async (req, res) => {
  const period = req.query.period ?? "all";
  if (period !== "all" && period !== "month") throw new HttpError(400, "INVALID_PERIOD", "period must be all or month");
  const month = period === "month";

  const [{ rows }, levels] = await Promise.all([
    pool.query(
      `WITH since AS (SELECT CASE WHEN $1 THEN date_trunc('month', now() AT TIME ZONE 'UTC') ELSE '-infinity' END AS at),
       points AS (
         SELECT t.user_id, sum(t.amount)::int AS points FROM point_transactions t
         WHERE t.created_at >= (SELECT at FROM since) GROUP BY t.user_id HAVING sum(t.amount) > 0
       )
       SELECT rank() OVER (ORDER BY p.points DESC)::int AS rank, u.id, u.username,
         coalesce(pr.display_name, u.username) AS display_name, p.points, coalesce(st.total_points, 0) AS total_points,
         (SELECT count(*)::int FROM user_problem_attempts a
          WHERE a.user_id = u.id AND a.status = 'solved' AND a.solved_at >= (SELECT at FROM since)) AS problems_solved,
         (SELECT round(avg(s.efficiency_score), 2)::float FROM user_problem_attempts a JOIN solve_sessions s ON s.attempt_id = a.id
          WHERE a.user_id = u.id AND a.status = 'solved' AND a.solved_at >= (SELECT at FROM since)) AS avg_efficiency
       FROM points p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN user_profiles pr ON pr.user_id = u.id
       LEFT JOIN user_stats st ON st.user_id = u.id
       WHERE NOT u.is_banned AND coalesce(pr.is_public, true)
       ORDER BY p.points DESC, lower(u.username)
       LIMIT ${LIMIT}`,
      [month],
    ),
    getLevels(),
  ]);

  res.json({
    period,
    entries: rows.map((r) => ({
      rank: r.rank,
      username: r.username,
      displayName: r.display_name,
      level: levelFor(r.total_points, levels).level.name,
      points: r.points,
      problemsSolved: r.problems_solved,
      // null = no scored solve in the period (solves before the AI score, S3).
      avgEfficiency: r.avg_efficiency,
      you: r.id === req.user?.id,
    })),
  });
});
