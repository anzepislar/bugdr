import { Router } from "express";
import { pool } from "../../db.js";
import { HttpError } from "../../errors.js";
import { optionalAuth, requireAuth } from "../auth/auth.service.js";

export const problemsRouter = Router();

// ponytail: the whole published list in one response, the client filters and pages it (no pagination in v1, 06).
// Add query filters + limit/offset when the list outgrows ~1000 problems.
// Order = "recommended": the user's goal role first (D19), then best rated.
problemsRouter.get("/", optionalAuth, async (req, res) => {
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
    [req.user?.id ?? null],
  );
  res.json({
    problems: rows.map((r) => ({
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
    })),
  });
});

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
       a.time_bonus_multiplier::float AS time_multiplier, r.rating AS my_rating
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
