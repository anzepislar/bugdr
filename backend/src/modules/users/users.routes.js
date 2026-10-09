import { Router } from "express";
import { pool } from "../../db.js";
import { HttpError } from "../../errors.js";
import { optionalAuth } from "../auth/auth.service.js";
import { getLevels, levelFor } from "../levels/levels.js";

export const usersRouter = Router();

/** DashboardStats (03) for the profile and the dashboard. */
export async function getStats(userId) {
  const [{ rows }, levels] = await Promise.all([
    pool.query(
      `SELECT coalesce(s.total_points, 0) AS total_points,
         -- Streak on read (U2): no activity yesterday or today = broken, without a nightly job.
         CASE WHEN s.last_activity_date >= (now() AT TIME ZONE 'UTC')::date - 1 THEN s.current_streak ELSE 0 END
           AS current_streak,
         coalesce(s.longest_streak, 0) AS longest_streak,
         -- Counted from the attempts, so it always matches the solved list.
         (SELECT count(*)::int FROM user_problem_attempts a WHERE a.user_id = $1 AND a.status = 'solved') AS problems_solved
       FROM (SELECT $1::uuid AS user_id) me LEFT JOIN user_stats s ON s.user_id = me.user_id`,
      [userId],
    ),
    getLevels(),
  ]);
  const s = rows[0];
  return {
    totalPoints: s.total_points,
    problemsSolved: s.problems_solved,
    currentStreak: s.current_streak,
    longestStreak: s.longest_streak,
    ...levelFor(s.total_points, levels),
  };
}

/**
 * ActivityDay[] from the Monday 52 weeks ago (the profile grid has 53 columns), UTC days (D7).
 * Only days with a row; the grid fills the rest with 0.
 */
export async function getActivity(userId) {
  const { rows } = await pool.query(
    `SELECT to_char(activity_date, 'YYYY-MM-DD') AS date, problems_opened, problems_solved
     FROM user_daily_activity
     WHERE user_id = $1 AND activity_date >= date_trunc('week', now() AT TIME ZONE 'UTC')::date - 364
     ORDER BY activity_date`,
    [userId],
  );
  return rows.map((r) => ({ date: r.date, problemsOpened: r.problems_opened, problemsSolved: r.problems_solved }));
}

/** Solved problems, newest first; `limit` null = all. */
export async function getSolved(userId, limit = null) {
  const { rows } = await pool.query(
    `SELECT pr.slug, pr.title, pr.difficulty, a.time_taken_seconds, a.solved_at AT TIME ZONE 'UTC' AS solved_at
     FROM user_problem_attempts a JOIN problems pr ON pr.id = a.problem_id
     WHERE a.user_id = $1 AND a.status = 'solved'
     ORDER BY a.solved_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  return rows.map((r) => ({
    problemSlug: r.slug,
    title: r.title,
    difficulty: r.difficulty,
    timeTakenSeconds: r.time_taken_seconds,
    solvedAt: r.solved_at.toISOString(),
  }));
}

// GET /users/:username → Profile or PrivateProfile (frontend/src/lib/types/profile.ts). Never the e-mail.
// Unknown or banned → 404. A private profile (D34) shows others only the username.
usersRouter.get("/:username", optionalAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, coalesce(p.display_name, u.username) AS display_name, coalesce(p.headline, '') AS headline,
       coalesce(p.languages, '{}') AS languages, coalesce(p.is_public, true) AS is_public
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.id
     WHERE lower(u.username) = lower($1) AND NOT u.is_banned`,
    [req.params.username],
  );
  const u = rows[0];
  if (!u) throw new HttpError(404, "USER_NOT_FOUND", "User not found");

  const own = req.user?.id === u.id;
  if (!u.is_public && !own) {
    return res.json({ profile: { username: u.username, displayName: u.username, isPublic: false, own: false } });
  }

  const [stats, activity, solved] = await Promise.all([getStats(u.id), getActivity(u.id), getSolved(u.id)]);
  res.json({
    profile: {
      username: u.username,
      displayName: u.display_name,
      headline: u.headline,
      languages: u.languages,
      isPublic: u.is_public,
      own,
      stats,
      activity,
      solved,
      contests: [], // T2
    },
  });
});
