import { Router } from "express";
import { pool } from "../../db.js";
import { HttpError } from "../../errors.js";
import { getStats } from "../users/users.routes.js";

// A8: users for the admin (04 "Users Management"). The admin is not a user (D48), so it can never ban itself.
// A ban applies on the user's next request (requireAuth) and hides the public profile.
export const adminUsersRouter = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new HttpError(404, "USER_NOT_FOUND", "User not found");
const iso = (d) => d?.toISOString() ?? null;

// AdminUserListItem[], newest first; ?q= matches username or e-mail. ponytail: no paging, add it when the list grows.
adminUsersRouter.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.email, u.is_banned, u.created_at AT TIME ZONE 'UTC' AS created_at,
       u.last_active_at AT TIME ZONE 'UTC' AS last_active_at,
       (SELECT level_name FROM level_thresholds WHERE min_points <= coalesce(s.total_points, 0)
        ORDER BY min_points DESC LIMIT 1) AS level
     FROM users u LEFT JOIN user_stats s ON s.user_id = u.id
     WHERE $1 = '' OR u.username ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%'
     ORDER BY u.created_at DESC`,
    [q.replace(/[\\%_]/g, "\\$&")],
  );
  res.json({
    users: rows.map((r) => ({
      id: r.id,
      username: r.username,
      email: r.email,
      level: r.level,
      joinedAt: iso(r.created_at),
      lastActiveAt: iso(r.last_active_at),
      isBanned: r.is_banned,
    })),
  });
});

async function findUser(id) {
  if (!UUID.test(id)) throw notFound();
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.email, u.is_banned, u.created_at AT TIME ZONE 'UTC' AS created_at,
       u.last_active_at AT TIME ZONE 'UTC' AS last_active_at,
       p.display_name, p.headline, p.github_username, p.goal_role, p.experience_level, p.platform_goal,
       coalesce(p.languages, '{}') AS languages, coalesce(p.is_public, true) AS is_public,
       coalesce(p.onboarding_completed, false) AS onboarding_completed
     FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = $1`,
    [id],
  );
  if (!rows.length) throw notFound();
  return rows[0];
}

// AdminUserDetail: profile, stats and every attempt with its tries (R2b), newest first.
adminUsersRouter.get("/:id", async (req, res) => {
  const u = await findUser(req.params.id);
  const [stats, { rows: attempts }] = await Promise.all([
    getStats(u.id),
    pool.query(
      `SELECT p.slug, p.title, p.difficulty, a.status, a.points_earned, a.time_taken_seconds,
         a.solved_at AT TIME ZONE 'UTC' AS solved_at,
         coalesce((SELECT json_agg(json_build_object('tryNumber', t.try_number,
             'startedAt', to_char(t.started_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
             'endedAt', to_char(t.ended_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
             'outcome', t.outcome, 'durationSeconds', t.duration_seconds) ORDER BY t.try_number)
           FROM attempt_tries t WHERE t.attempt_id = a.id), '[]') AS tries
       FROM user_problem_attempts a JOIN problems p ON p.id = a.problem_id
       WHERE a.user_id = $1
       ORDER BY coalesce((SELECT max(t.started_at) FROM attempt_tries t WHERE t.attempt_id = a.id), a.started_at) DESC`,
      [u.id],
    ),
  ]);
  res.json({
    user: {
      id: u.id,
      username: u.username,
      email: u.email,
      isBanned: u.is_banned,
      joinedAt: iso(u.created_at),
      lastActiveAt: iso(u.last_active_at),
      profile: {
        displayName: u.display_name,
        headline: u.headline,
        githubUsername: u.github_username,
        goalRole: u.goal_role,
        experienceLevel: u.experience_level,
        platformGoal: u.platform_goal,
        languages: u.languages,
        isPublic: u.is_public,
        onboardingCompleted: u.onboarding_completed,
      },
      stats,
      attempts: attempts.map((a) => ({
        problemSlug: a.slug,
        title: a.title,
        difficulty: a.difficulty,
        status: a.status,
        pointsEarned: a.points_earned,
        timeTakenSeconds: a.time_taken_seconds,
        solvedAt: iso(a.solved_at),
        tries: a.tries,
      })),
    },
  });
});

for (const [action, banned] of [["ban", true], ["unban", false]])
  adminUsersRouter.post(`/:id/${action}`, async (req, res) => {
    await findUser(req.params.id);
    await pool.query("UPDATE users SET is_banned = $2 WHERE id = $1", [req.params.id, banned]);
    res.status(204).end();
  });
