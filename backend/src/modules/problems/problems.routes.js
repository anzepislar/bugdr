import { Router } from "express";
import { pool } from "../../db.js";
import { HttpError } from "../../errors.js";
import { optionalAuth, requireAuth } from "../auth/auth.service.js";

export const problemsRouter = Router();

// ponytail: the whole published list in one response, the client filters and pages it (no pagination in v1, 06).
// Add query filters + limit/offset when the list outgrows ~1000 problems.
problemsRouter.get("/", optionalAuth, async (req, res) => {
  res.json({ problems: await listProblems(req.user?.id ?? null) });
});

/**
 * ProblemListItem[] of every published problem for `userId` (null = guest: status null, saved false), also the
 * dashboard feed (U3). Order = "recommended": the user's goal role first (D19), then best rated.
 */
export async function listProblems(userId) {
  const { rows } = await pool.query(
    `SELECT p.slug, p.title, p.short_description, p.difficulty, c.slug AS category_slug,
       coalesce((SELECT array_agg(t.tag ORDER BY t.tag) FROM problem_tags t WHERE t.problem_id = p.id), '{}') AS tags,
       p.time_limit_minutes, p.average_rating::float AS average_rating, p.rating_count, p.thumbnail_url,
       nullif(a.status, 'abandoned') AS status, b.user_id IS NOT NULL AS saved
     FROM problems p
     JOIN problem_categories c ON c.id = p.category_id
     LEFT JOIN user_problem_attempts a ON a.problem_id = p.id AND a.user_id = $1
     LEFT JOIN problem_bookmarks b ON b.problem_id = p.id AND b.user_id = $1
     LEFT JOIN user_profiles up ON up.user_id = $1
     WHERE p.is_published
     ORDER BY coalesce(c.slug = up.goal_role, false) DESC, p.average_rating DESC, p.title`,
    [userId],
  );
  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    shortDescription: r.short_description,
    difficulty: r.difficulty,
    categorySlug: r.category_slug,
    tags: r.tags,
    timeLimitMinutes: r.time_limit_minutes,
    averageRating: r.average_rating,
    ratingCount: r.rating_count,
    thumbnailUrl: r.thumbnail_url,
    status: r.status,
    saved: r.saved,
  }));
}

// Never sends file contents, check commands, expected output, hidden or solution files (06 "Konvencije").
problemsRouter.get("/:slug", optionalAuth, async (req, res) => {
  const userId = req.user?.id ?? null;
  const { rows } = await pool.query(
    `SELECT p.id, p.slug, p.title, p.short_description, p.codebase_context, p.incident_report, p.difficulty, c.slug AS category_slug,
       coalesce((SELECT array_agg(t.tag ORDER BY t.tag) FROM problem_tags t WHERE t.problem_id = p.id), '{}') AS tags,
       p.time_limit_minutes, p.average_rating::float AS average_rating, p.rating_count, p.thumbnail_url, p.solve_count,
       (SELECT count(*)::int FROM problem_comments pc WHERE pc.problem_id = p.id) AS comment_count,
       coalesce((SELECT array_agg(k.description ORDER BY k.check_order) FROM problem_checks k WHERE k.problem_id = p.id),
         '{}') AS checks,
       cb.repository_name, cb.language, cb.framework, cb.repository_structure,
       nullif(a.status, 'abandoned') AS status, b.user_id IS NOT NULL AS saved,
       a.solved_at AT TIME ZONE 'UTC' AS solved_at, a.time_taken_seconds, a.lines_added, a.lines_deleted, a.points_earned,
       a.time_bonus_multiplier::float AS time_multiplier, r.rating AS my_rating,
       (SELECT json_agg(json_build_object('tryNumber', t.try_number, 'outcome', t.outcome, 'durationSeconds', t.duration_seconds)
          ORDER BY t.try_number) FROM attempt_tries t WHERE t.attempt_id = a.id) AS tries
     FROM problems p
     JOIN problem_categories c ON c.id = p.category_id
     LEFT JOIN problem_codebase cb ON cb.problem_id = p.id
     LEFT JOIN user_problem_attempts a ON a.problem_id = p.id AND a.user_id = $2
     LEFT JOIN problem_bookmarks b ON b.problem_id = p.id AND b.user_id = $2
     LEFT JOIN problem_ratings r ON r.problem_id = p.id AND r.user_id = $2
     WHERE p.slug = $1 AND p.is_published`,
    [req.params.slug, userId],
  );
  const r = rows[0];
  if (!r) throw new HttpError(404, "PROBLEM_NOT_FOUND", "Problem not found");
  if (userId) await recordOpen(userId);

  res.json({
    problem: {
      slug: r.slug,
      title: r.title,
      shortDescription: r.short_description,
      difficulty: r.difficulty,
      categorySlug: r.category_slug,
      tags: r.tags,
      timeLimitMinutes: r.time_limit_minutes,
      averageRating: r.average_rating,
      ratingCount: r.rating_count,
      thumbnailUrl: r.thumbnail_url,
      status: r.status,
      saved: r.saved,
      codebaseContext: r.codebase_context,
      incidentReport: r.incident_report,
      solveCount: r.solve_count,
      commentCount: r.comment_count,
      checks: r.checks,
      // D27: stack = language + framework + tags.
      repository: {
        name: r.repository_name ?? "",
        stack: [...new Set([r.language, r.framework, ...r.tags].filter(Boolean))],
        files: r.repository_structure ?? [],
      },
      // A solved attempt passed every check.
      result:
        r.status === "solved"
          ? {
              solvedAt: r.solved_at.toISOString(),
              timeTakenSeconds: r.time_taken_seconds,
              checksPassed: r.checks.length,
              checksTotal: r.checks.length,
              linesAdded: r.lines_added,
              linesDeleted: r.lines_deleted,
              pointsEarned: r.points_earned,
              timeMultiplier: r.time_multiplier,
              myRating: r.my_rating,
              // R4 (D56): every try; the last one is the solving try.
              tries: r.tries ?? [],
            }
          : null,
    },
  });
});

/**
 * Opening a problem counts as activity for today's UTC day (D6, D7): problems_opened + 1 and the streak
 * (same day = unchanged, the day after = +1, a gap = back to 1). One UPDATE, so parallel views cannot double-count.
 */
async function recordOpen(userId) {
  await pool.query(
    `WITH today AS (SELECT (now() AT TIME ZONE 'UTC')::date AS d),
     activity AS (
       INSERT INTO user_daily_activity (user_id, activity_date, problems_opened)
       SELECT $1, d, 1 FROM today
       ON CONFLICT (user_id, activity_date) DO UPDATE SET problems_opened = user_daily_activity.problems_opened + 1
     ),
     next AS (
       SELECT CASE WHEN s.last_activity_date = t.d THEN s.current_streak
                   WHEN s.last_activity_date = t.d - 1 THEN s.current_streak + 1
                   ELSE 1 END AS streak, t.d
       FROM user_stats s, today t WHERE s.user_id = $1 FOR UPDATE OF s
     )
     UPDATE user_stats s SET current_streak = n.streak, longest_streak = greatest(s.longest_streak, n.streak),
       last_activity_date = n.d, updated_at = now()
     FROM next n WHERE s.user_id = $1`,
    [userId],
  );
}

/**
 * R1: one attempt per user and problem (UNIQUE). A new start inserts it; an attempt in progress comes back unchanged,
 * so the timer keeps running; an abandoned one reopens with a new started_at (D8); a solved one never reopens.
 * R2b (D56): a new or reopened attempt opens the next try in attempt_tries; previousSeconds = the closed tries, so the
 * clock keeps counting across tries. One statement, so it is atomic.
 * Files are the visible codebase only - never hidden_files, solution_files or check commands (D10).
 */
problemsRouter.post("/:slug/start", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.id, p.slug, p.title, p.time_limit_minutes, cb.repository_name, cb.files,
       coalesce((SELECT json_agg(json_build_object('id', k.id, 'checkOrder', k.check_order, 'description', k.description)
         ORDER BY k.check_order) FROM problem_checks k WHERE k.problem_id = p.id), '[]') AS checks
     FROM problems p JOIN problem_codebase cb ON cb.problem_id = p.id
     WHERE p.slug = $1 AND p.is_published`,
    [req.params.slug],
  );
  const p = rows[0];
  if (!p) throw new HttpError(404, "PROBLEM_NOT_FOUND", "Problem not found");

  // DO UPDATE always returns the row; only an abandoned attempt changes. started_at = now() marks a new try
  // (a kept started_at is from an earlier transaction, so it never equals this one's now()).
  const { rows: attempts } = await pool.query(
    `WITH a AS (
       INSERT INTO user_problem_attempts AS a (user_id, problem_id) VALUES ($1, $2)
       ON CONFLICT (user_id, problem_id) DO UPDATE SET
         started_at = CASE WHEN a.status = 'abandoned' THEN now() ELSE a.started_at END,
         status = CASE WHEN a.status = 'abandoned' THEN 'in_progress' ELSE a.status END
       RETURNING a.id, a.status, a.started_at, a.started_at = now()::timestamp AS new_try
     ),
     t AS (
       INSERT INTO attempt_tries (attempt_id, try_number, started_at)
       SELECT a.id, coalesce((SELECT max(try_number) FROM attempt_tries WHERE attempt_id = a.id), 0) + 1, a.started_at
       FROM a WHERE a.new_try AND a.status = 'in_progress'
       RETURNING try_number
     )
     SELECT a.id, a.status, a.started_at AT TIME ZONE 'UTC' AS started_at,
       coalesce((SELECT try_number FROM t), (SELECT max(try_number) FROM attempt_tries WHERE attempt_id = a.id)) AS try_number,
       coalesce((SELECT sum(duration_seconds) FROM attempt_tries WHERE attempt_id = a.id AND ended_at IS NOT NULL), 0)::int
         AS previous_seconds
     FROM a`,
    [req.user.id, p.id],
  );
  const a = attempts[0];
  if (a.status === "solved") throw new HttpError(409, "ALREADY_SOLVED", "You have already solved this problem");

  res.json({
    attempt: {
      id: a.id,
      problemSlug: p.slug,
      problemTitle: p.title,
      repositoryName: p.repository_name ?? "",
      startedAt: a.started_at.toISOString(),
      tryNumber: a.try_number,
      previousSeconds: a.previous_seconds,
      timeLimitMinutes: p.time_limit_minutes,
      files: p.files,
      checks: p.checks,
    },
  });
});

async function publishedId(slug) {
  const { rows } = await pool.query("SELECT id FROM problems WHERE slug = $1 AND is_published", [slug]);
  if (!rows[0]) throw new HttpError(404, "PROBLEM_NOT_FOUND", "Problem not found");
  return rows[0].id;
}

// D23. Both are idempotent.
problemsRouter.put("/:slug/bookmark", requireAuth, async (req, res) => {
  await pool.query("INSERT INTO problem_bookmarks (user_id, problem_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [
    req.user.id,
    await publishedId(req.params.slug),
  ]);
  res.status(204).end();
});

problemsRouter.delete("/:slug/bookmark", requireAuth, async (req, res) => {
  await pool.query("DELETE FROM problem_bookmarks WHERE user_id = $1 AND problem_id = $2", [
    req.user.id,
    await publishedId(req.params.slug),
  ]);
  res.status(204).end();
});

/**
 * O1: one rating per user and problem, only after solving. The average is always recomputed from problem_ratings (D57).
 * The problem row is locked first, so two parallel ratings cannot both compute the average without the other.
 */
problemsRouter.put("/:slug/rating", requireAuth, async (req, res) => {
  const rating = req.body?.rating;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT p.id, a.status = 'solved' AS solved FROM problems p
       LEFT JOIN user_problem_attempts a ON a.problem_id = p.id AND a.user_id = $2
       WHERE p.slug = $1 AND p.is_published FOR UPDATE OF p`,
      [req.params.slug, req.user.id],
    );
    const p = rows[0];
    if (!p) throw new HttpError(404, "PROBLEM_NOT_FOUND", "Problem not found");
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      throw new HttpError(400, "VALIDATION_ERROR", "Rating must be a whole number from 1 to 5");
    if (!p.solved) throw new HttpError(403, "NOT_SOLVED", "Solve the problem to rate it");

    await client.query(
      `INSERT INTO problem_ratings (user_id, problem_id, rating) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, problem_id) DO UPDATE SET rating = EXCLUDED.rating`,
      [req.user.id, p.id, rating],
    );
    const { rows: totals } = await client.query(
      `UPDATE problems SET
         average_rating = (SELECT coalesce(round(avg(rating), 2), 0) FROM problem_ratings WHERE problem_id = $1),
         rating_count = (SELECT count(*) FROM problem_ratings WHERE problem_id = $1)
       WHERE id = $1 RETURNING average_rating::float AS average_rating, rating_count`,
      [p.id],
    );
    await client.query("COMMIT");
    res.json({ averageRating: totals[0].average_rating, ratingCount: totals[0].rating_count, myRating: rating });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});
