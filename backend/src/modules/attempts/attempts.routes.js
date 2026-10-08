import { Router } from "express";
import { pool } from "../../db.js";
import { HttpError } from "../../errors.js";
import { requireAuth } from "../auth/auth.service.js";

export const attemptsRouter = Router();
attemptsRouter.use(requireAuth);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new HttpError(404, "ATTEMPT_NOT_FOUND", "Attempt not found");

/**
 * R2: give up = status 'abandoned'; starting again reopens the same row (D8, R1) with the next try (R2b).
 * R2b (D56): the open try is closed with its duration, measured on the server - in the same statement.
 * Only the owner's attempt (a foreign one is 404, not 403); a solved attempt never changes. Idempotent.
 */
attemptsRouter.post("/:id/give-up", async (req, res) => {
  if (!UUID.test(req.params.id)) throw notFound();
  const { rows } = await pool.query(
    `WITH done AS (
       UPDATE user_problem_attempts SET status = 'abandoned'
       WHERE id = $1 AND user_id = $2 AND status <> 'solved' RETURNING id
     ),
     closed AS (
       UPDATE attempt_tries SET ended_at = now(), outcome = 'abandoned',
         duration_seconds = greatest(0, extract(epoch FROM now()::timestamp - started_at))::int
       WHERE attempt_id IN (SELECT id FROM done) AND ended_at IS NULL
     )
     SELECT (SELECT count(*) FROM done)::int AS updated,
       (SELECT status FROM user_problem_attempts WHERE id = $1 AND user_id = $2) AS status`,
    [req.params.id, req.user.id],
  );
  const r = rows[0];
  if (r.updated) return res.status(204).end();
  if (r.status === "solved") throw new HttpError(409, "ALREADY_SOLVED", "A solved problem cannot be given up");
  throw notFound();
});
