import { Router } from "express";
import { pool } from "../../db.js";
import { HttpError } from "../../errors.js";

// A9: GET /admin/stats?range= → AdminOverview (frontend/src/lib/types/adminStats.ts). Windows per D46: UTC days,
// "today" = the current UTC day, 7d / 30d end today; the trend compares with the period of the same length before.
// Active user = opened a problem that day (user_daily_activity, as the streak). Charts are fixed windows (30 / 14 days).
export const adminStatsRouter = Router();

const DAYS = { today: 1, "7d": 7, "30d": 30, all: null };
const STREAK_BUCKETS = ["1d", "2-7d", "8-30d", "31-90d", "90d+"];
const TODAY = "(now() AT TIME ZONE 'UTC')::date";

const trend = (cur, prev) => (prev ? Math.round(((cur - prev) / prev) * 100) : null);

adminStatsRouter.get("/", async (req, res) => {
  const range = req.query.range ?? "7d";
  if (!(range in DAYS)) throw new HttpError(400, "VALIDATION_ERROR", "range is today, 7d, 30d or all");
  const n = DAYS[range];

  const q = (sql, params = []) => pool.query(sql, params).then((r) => r.rows);
  const [[counts], [ranged], growth, perDay, byDifficulty, byRole, streaks, top, dropOff] = await Promise.all([
    q(`SELECT (SELECT count(*)::int FROM users) AS total_users,
         (SELECT count(*)::int FROM problems WHERE is_published) AS published,
         (SELECT count(*)::int FROM contests WHERE starts_at <= now() AT TIME ZONE 'UTC'
            AND ends_at > now() AT TIME ZONE 'UTC') AS active_contests`),
    // $1 NULL = all time (no previous period).
    q(
      `SELECT
         (SELECT count(DISTINCT user_id)::int FROM user_daily_activity
          WHERE problems_opened > 0 AND ($1::int IS NULL OR activity_date > ${TODAY} - $1)) AS active,
         (SELECT count(DISTINCT user_id)::int FROM user_daily_activity
          WHERE problems_opened > 0 AND activity_date > ${TODAY} - 2 * $1 AND activity_date <= ${TODAY} - $1) AS active_prev,
         (SELECT count(*)::int FROM user_problem_attempts
          WHERE status = 'solved' AND ($1::int IS NULL OR solved_at::date > ${TODAY} - $1)) AS solves,
         (SELECT count(*)::int FROM user_problem_attempts
          WHERE status = 'solved' AND solved_at::date > ${TODAY} - 2 * $1 AND solved_at::date <= ${TODAY} - $1) AS solves_prev`,
      [n],
    ),
    q(`SELECT to_char(d, 'YYYY-MM-DD') AS date,
         (SELECT count(*)::int FROM users WHERE created_at::date = d) AS signups,
         (SELECT count(DISTINCT user_id)::int FROM user_daily_activity WHERE activity_date = d AND problems_opened > 0) AS dau
       FROM generate_series(${TODAY} - 29, ${TODAY}, interval '1 day') AS g (d) ORDER BY d`),
    q(`SELECT to_char(d, 'YYYY-MM-DD') AS date,
         (SELECT count(*)::int FROM user_problem_attempts WHERE status = 'solved' AND solved_at::date = d) AS solves
       FROM generate_series(${TODAY} - 13, ${TODAY}, interval '1 day') AS g (d) ORDER BY d`),
    q(`SELECT p.difficulty, count(*)::int AS solves FROM user_problem_attempts a JOIN problems p ON p.id = a.problem_id
       WHERE a.status = 'solved' GROUP BY p.difficulty`),
    q(`SELECT c.slug, count(a.id)::int AS solves FROM problem_categories c
         LEFT JOIN problems p ON p.category_id = c.id
         LEFT JOIN user_problem_attempts a ON a.problem_id = p.id AND a.status = 'solved'
       GROUP BY c.slug ORDER BY solves DESC, c.slug`),
    // Current streak on read, as getStats (U2): no activity yesterday or today = 0.
    q(`SELECT CASE WHEN current_streak = 1 THEN '1d' WHEN current_streak <= 7 THEN '2-7d'
           WHEN current_streak <= 30 THEN '8-30d' WHEN current_streak <= 90 THEN '31-90d' ELSE '90d+' END AS range,
         count(*)::int AS users
       FROM user_stats WHERE current_streak > 0 AND last_activity_date >= ${TODAY} - 1 GROUP BY 1`),
    q(`SELECT p.slug, p.title, p.difficulty, count(*)::int AS solves FROM user_problem_attempts a
         JOIN problems p ON p.id = a.problem_id
       WHERE a.status = 'solved' GROUP BY p.id ORDER BY solves DESC, p.title LIMIT 8`),
    // Highest share of starts that never got solved.
    q(`SELECT p.slug, p.title, count(*)::int AS started, count(*) FILTER (WHERE a.status = 'solved')::int AS solved
       FROM user_problem_attempts a JOIN problems p ON p.id = a.problem_id
       GROUP BY p.id
       ORDER BY count(*) FILTER (WHERE a.status = 'solved')::float / count(*), started DESC, p.title LIMIT 8`),
  ]);

  const solvesByDifficulty = { easy: 0, medium: 0, hard: 0, get_a_job: 0 };
  for (const r of byDifficulty) solvesByDifficulty[r.difficulty] = r.solves;

  res.json({
    totalUsers: counts.total_users,
    activeUsers: { value: ranged.active, trendPct: n ? trend(ranged.active, ranged.active_prev) : null },
    problemsPublished: counts.published,
    solves: { value: ranged.solves, trendPct: n ? trend(ranged.solves, ranged.solves_prev) : null },
    activeContests: counts.active_contests,
    userGrowth: growth,
    solvesPerDay: perDay,
    solvesByDifficulty,
    solvesByRole: byRole.map((r) => ({ categorySlug: r.slug, solves: r.solves })),
    streaks: STREAK_BUCKETS.map((range) => ({ range, users: streaks.find((s) => s.range === range)?.users ?? 0 })),
    topProblems: top,
    dropOff,
  });
});
