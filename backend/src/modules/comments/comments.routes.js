import { Router } from "express";
import { pool } from "../../db.js";
import { HttpError } from "../../errors.js";
import { optionalAuth, requireAuth } from "../auth/auth.service.js";
import { VISIBLE } from "../problems/problems.routes.js";

// O2. Mounted at /api/v1: the list and posting live under the problem, the rest under the comment's id.
export const commentsRouter = Router();

const MAX_LENGTH = 2000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const problemNotFound = () => new HttpError(404, "PROBLEM_NOT_FOUND", "Problem not found");
const commentNotFound = () => new HttpError(404, "COMMENT_NOT_FOUND", "Comment not found");
const notSolved = () => new HttpError(403, "NOT_SOLVED", "Solve the problem to join the discussion");

/** The published problem and whether this user solved it (false for a guest). */
async function problemFor(slug, userId) {
  const { rows } = await pool.query(
    `SELECT p.id, EXISTS (SELECT 1 FROM user_problem_attempts a
         WHERE a.problem_id = p.id AND a.user_id = $2 AND a.status = 'solved') AS solved
     FROM problems p
     WHERE p.slug = $1 AND ${VISIBLE}`,
    [slug, userId],
  );
  if (!rows[0]) throw problemNotFound();
  return rows[0];
}

/** The comment, whether its problem is solved by this user, and whether the user wrote it. */
async function commentFor(id, userId) {
  if (!UUID.test(id)) throw commentNotFound();
  const { rows } = await pool.query(
    `SELECT c.id, c.user_id = $2 AS own, coalesce(a.status = 'solved', false) AS solved FROM problem_comments c
     JOIN problems p ON p.id = c.problem_id AND ${VISIBLE}
     LEFT JOIN user_problem_attempts a ON a.problem_id = c.problem_id AND a.user_id = $2
     WHERE c.id = $1`,
    [id, userId],
  );
  if (!rows[0]) throw commentNotFound();
  return rows[0];
}

// One shape for the list and for a new post (ProblemComment in frontend/src/lib/types/problem.ts).
// displayName falls back to the username (D34).
const SELECT_COMMENTS = `
  SELECT c.id, c.parent_id, c.content, c.created_at AT TIME ZONE 'UTC' AS created_at, u.username, coalesce(up.display_name, u.username) AS display_name, up.goal_role,
    (SELECT count(*)::int FROM comment_helpful h WHERE h.comment_id = c.id) AS helpful_count,
    EXISTS (SELECT 1 FROM comment_helpful h WHERE h.comment_id = c.id AND h.user_id = $2) AS marked_helpful,
    c.user_id = $2 AS own
  FROM problem_comments c
  JOIN users u ON u.id = c.user_id
  LEFT JOIN user_profiles up ON up.user_id = c.user_id`;

const toComment = (r) => ({
  id: r.id,
  author: { username: r.username, displayName: r.display_name, goalRole: r.goal_role },
  content: r.content,
  createdAt: r.created_at.toISOString(),
  helpfulCount: r.helpful_count,
  markedHelpful: r.marked_helpful,
  own: r.own,
  replies: [],
});

// Not solved (or a guest): only the count, never the content. Sorting is done by the client (all comments in one response).
commentsRouter.get("/problems/:slug/comments", optionalAuth, async (req, res) => {
  const userId = req.user?.id ?? null;
  const problem = await problemFor(req.params.slug, userId);
  if (!problem.solved) {
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM problem_comments WHERE problem_id = $1", [problem.id]);
    return res.json({ count: rows[0].n, locked: true });
  }
  // ponytail: every comment of the problem in one response; page it when a problem gets thousands.
  const { rows } = await pool.query(`${SELECT_COMMENTS} WHERE c.problem_id = $1 ORDER BY c.created_at`, [problem.id, userId]);
  const byId = new Map(rows.map((r) => [r.id, toComment(r)]));
  // Oldest first, so replies come in the order they were written.
  for (const r of rows) if (r.parent_id) byId.get(r.parent_id)?.replies.push(byId.get(r.id));
  res.json({ comments: rows.filter((r) => !r.parent_id).map((r) => byId.get(r.id)) });
});

commentsRouter.post("/problems/:slug/comments", requireAuth, async (req, res) => {
  const problem = await problemFor(req.params.slug, req.user.id);
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!content || content.length > MAX_LENGTH)
    throw new HttpError(400, "VALIDATION_ERROR", `A comment must be 1 to ${MAX_LENGTH} characters`);
  const parentId = req.body?.parentId ?? null;
  if (!problem.solved) throw notSolved();

  // A reply goes to a top-level comment of the same problem (one level, D30).
  if (parentId !== null) {
    const { rows } = UUID.test(parentId)
      ? await pool.query("SELECT 1 FROM problem_comments WHERE id = $1 AND problem_id = $2 AND parent_id IS NULL", [
          parentId,
          problem.id,
        ])
      : { rows: [] };
    if (!rows[0]) throw new HttpError(400, "INVALID_PARENT", "You can only reply to a comment on this problem");
  }

  const { rows } = await pool.query(
    `WITH c AS (
       INSERT INTO problem_comments (user_id, problem_id, content, parent_id) VALUES ($2, $1, $3, $4) RETURNING *
     )
     ${SELECT_COMMENTS.replace("FROM problem_comments c", "FROM c")}`,
    [problem.id, req.user.id, content, parentId],
  );
  res.status(201).json({ comment: toComment(rows[0]) });
});

// Only the author; replies and helpful marks go with it (D58).
commentsRouter.delete("/comments/:id", requireAuth, async (req, res) => {
  const comment = await commentFor(req.params.id, req.user.id);
  if (!comment.own) throw new HttpError(403, "NOT_AUTHOR", "You can only delete your own comments");
  await pool.query("DELETE FROM problem_comments WHERE id = $1", [comment.id]);
  res.status(204).end();
});

// D30: only someone who solved the problem, never on one's own comment. Both are idempotent.
async function helpfulTarget(req) {
  const comment = await commentFor(req.params.id, req.user.id);
  if (!comment.solved) throw notSolved();
  if (comment.own) throw new HttpError(403, "OWN_COMMENT", "You can't mark your own comment as helpful");
  return comment.id;
}

commentsRouter.put("/comments/:id/helpful", requireAuth, async (req, res) => {
  await pool.query("INSERT INTO comment_helpful (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [
    await helpfulTarget(req),
    req.user.id,
  ]);
  res.status(204).end();
});

commentsRouter.delete("/comments/:id/helpful", requireAuth, async (req, res) => {
  await pool.query("DELETE FROM comment_helpful WHERE comment_id = $1 AND user_id = $2", [await helpfulTarget(req), req.user.id]);
  res.status(204).end();
});
