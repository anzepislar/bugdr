import { Router } from "express";
import { pool } from "../../db.js";
import { HttpError } from "../../errors.js";
import { requireAuth } from "../auth/auth.service.js";
import { runChecks, runTerminal, stopTerminal, validateFiles } from "../runner/runner.service.js";
import { finalPoints, lineChanges, timeMultiplier } from "../scoring/scoring.js";

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
  if (r.updated) {
    await stopTerminal(req.params.id);
    return res.status(204).end();
  }
  if (r.status === "solved") throw new HttpError(409, "ALREADY_SOLVED", "A solved problem cannot be given up");
  throw notFound();
});

/**
 * R4: runs the checks on the submitted files (R3) and records every result.
 * R6: the response is an NDJSON stream - { "type": "running", "checkId" } and { "type": "result", checkId, passed,
 * output? } per check as it happens, then { "type": "done", "results", "solved" }. Errors before the first line are
 * normal JSON. The run finishes (and can solve) even if the client goes away. When every must_pass check passes, the
 * attempt is solved in one transaction (06 "Konvencije"): the open try closes, time = all tries (D56), points =
 * base × time multiplier (efficiency 1 until S3), two ledger rows (D15), user_stats, daily activity, solve_count,
 * contest entries (T2).
 * The attempt row is locked, so a double click never awards points twice.
 */
attemptsRouter.post("/:id/test", async (req, res) => {
  if (!UUID.test(req.params.id)) throw notFound();
  const files = req.body?.files;
  validateFiles(files);
  const { rows } = await pool.query(
    `SELECT a.status, p.id AS problem_id, p.base_points, p.time_limit_minutes, cb.files, cb.hidden_files, cb.setup_commands,
       coalesce((SELECT json_agg(json_build_object('id', k.id, 'checkOrder', k.check_order, 'command', k.check_command,
         'expectedOutput', k.expected_output, 'mustPass', k.must_pass) ORDER BY k.check_order)
         FROM problem_checks k WHERE k.problem_id = p.id), '[]') AS checks
     FROM user_problem_attempts a
     JOIN problems p ON p.id = a.problem_id
     JOIN problem_codebase cb ON cb.problem_id = p.id
     WHERE a.id = $1 AND a.user_id = $2`,
    [req.params.id, req.user.id],
  );
  const a = rows[0];
  if (!a) throw notFound();
  if (a.status === "solved") throw new HttpError(409, "ALREADY_SOLVED", "You have already solved this problem");
  if (a.status !== "in_progress") throw new HttpError(409, "ATTEMPT_NOT_ACTIVE", "Start the problem again to run the checks");
  // ponytail (D53): a problem without hidden checks is display-only; Add Problem (A3) makes every new one runnable.
  if (!a.checks.length || !Object.keys(a.hidden_files).length)
    throw new HttpError(409, "CHECKS_UNAVAILABLE", "Checks for this problem are not available yet");

  const line = (event) => {
    if (res.writableEnded || res.destroyed) return;
    if (!res.headersSent) res.status(200).type("application/x-ndjson").setHeader("Cache-Control", "no-store");
    res.write(JSON.stringify(event) + "\n");
  };
  const results = await runChecks(
    { files: a.files, hiddenFiles: a.hidden_files, setupCommands: a.setup_commands, checks: a.checks },
    files,
    {
      onProgress: (p) =>
        line(p.status === "running" ? { type: "running", checkId: p.checkId } : { type: "result", ...p.result }),
    },
  );
  await pool.query(
    `INSERT INTO check_results (attempt_id, check_id, passed, output)
     SELECT $1, r.check_id, r.passed, r.output FROM json_to_recordset($2) AS r (check_id UUID, passed BOOLEAN, output TEXT)`,
    [req.params.id, JSON.stringify(results.map((r) => ({ check_id: r.checkId, passed: r.passed, output: r.output ?? null })))],
  );

  const optional = new Set(a.checks.filter((c) => c.mustPass === false).map((c) => c.id));
  const solved = results.every((r) => r.passed || optional.has(r.checkId))
    ? await solve(req.params.id, req.user.id, a, { ...a.files, ...files })
    : null;
  if (solved) await stopTerminal(req.params.id);
  line({ type: "done", results, solved });
  res.end();
});

async function solve(attemptId, userId, problem, finalCode) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT status, points_earned, time_taken_seconds, time_bonus_multiplier::float AS multiplier
       FROM user_problem_attempts WHERE id = $1 FOR UPDATE`,
      [attemptId],
    );
    const row = rows[0];
    // Another request solved it while this one ran the checks (double click): same answer, no second award.
    if (row.status !== "in_progress") {
      await client.query("ROLLBACK");
      return row.status === "solved"
        ? { pointsEarned: row.points_earned, timeTakenSeconds: row.time_taken_seconds, timeMultiplier: row.multiplier }
        : null;
    }

    // The CTE's UPDATE is not visible to the outer SELECT, so the closed try is added separately.
    const { rows: time } = await client.query(
      `WITH closed AS (
         UPDATE attempt_tries SET ended_at = now(), outcome = 'solved',
           duration_seconds = greatest(0, extract(epoch FROM now()::timestamp - started_at))::int
         WHERE attempt_id = $1 AND ended_at IS NULL RETURNING duration_seconds
       )
       SELECT (coalesce((SELECT sum(duration_seconds) FROM attempt_tries WHERE attempt_id = $1 AND ended_at IS NOT NULL), 0)
         + coalesce((SELECT sum(duration_seconds) FROM closed), 0))::int AS total`,
      [attemptId],
    );
    const seconds = time[0].total;
    const multiplier = timeMultiplier(seconds, problem.time_limit_minutes);
    const points = finalPoints(problem.base_points, multiplier);
    const bonus = Math.max(0, points - problem.base_points);
    const lines = lineChanges(problem.files, finalCode);

    await client.query(
      `UPDATE user_problem_attempts SET status = 'solved', solved_at = now(), time_taken_seconds = $2,
         time_bonus_multiplier = $3, points_earned = $4, final_code = $5, lines_added = $6, lines_deleted = $7
       WHERE id = $1`,
      [attemptId, seconds, multiplier, points, finalCode, lines.added, lines.deleted],
    );
    // D15: the base as 'problem_solved', the time bonus as its own row (only when there is one). Sum = points.
    await client.query(
      `INSERT INTO point_transactions (user_id, amount, reason, reference_id)
       SELECT $1, v.amount, v.reason, $2 FROM (VALUES ($3::int, 'problem_solved'), ($4::int, 'time_bonus')) AS v (amount, reason)
       WHERE v.amount > 0`,
      [userId, problem.problem_id, points - bonus, bonus],
    );
    await client.query(
      `UPDATE user_stats SET total_points = total_points + $2, problems_solved = problems_solved + 1,
         current_level = (SELECT level_name FROM level_thresholds WHERE min_points <= user_stats.total_points + $2
                          ORDER BY min_points DESC LIMIT 1),
         updated_at = now()
       WHERE user_id = $1`,
      [userId, points],
    );
    await client.query(
      `INSERT INTO user_daily_activity (user_id, activity_date, problems_solved, points_earned)
       VALUES ($1, (now() AT TIME ZONE 'UTC')::date, 1, $2)
       ON CONFLICT (user_id, activity_date) DO UPDATE SET
         problems_solved = user_daily_activity.problems_solved + 1, points_earned = user_daily_activity.points_earned + $2`,
      [userId, points],
    );
    await client.query("UPDATE problems SET solve_count = solve_count + 1 WHERE id = $1", [problem.problem_id]);
    // T2 (D18): a solve while the problem's contest is live adds its points to the entry; after ends_at it does not count.
    // Upsert: an attempt started before the contest went live has no entry yet.
    await client.query(
      `INSERT INTO contest_entries AS e (contest_id, user_id, problems_solved, total_score)
       SELECT cp.contest_id, $1, 1, $3 FROM contest_problems cp JOIN contests ct ON ct.id = cp.contest_id
       WHERE cp.problem_id = $2 AND ct.starts_at <= now() AND ct.ends_at > now()
       ON CONFLICT (contest_id, user_id) DO UPDATE SET
         problems_solved = e.problems_solved + 1, total_score = e.total_score + EXCLUDED.total_score`,
      [userId, problem.problem_id, points],
    );
    await client.query("COMMIT");
    return { pointsEarned: points, timeTakenSeconds: seconds, timeMultiplier: multiplier };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * R5 (D13): runs one command in the attempt's terminal container on the user's current files and streams the
 * output as NDJSON lines: { "type": "output", "text" } …, then { "type": "exit", "code" } or
 * { "type": "stopped", "reason": "timeout" | "output" | "aborted" }. Errors before the first line are normal JSON.
 */
attemptsRouter.post("/:id/terminal", async (req, res) => {
  if (!UUID.test(req.params.id)) throw notFound();
  const { command, files } = req.body ?? {};
  const { rows } = await pool.query(
    `SELECT a.status, cb.files FROM user_problem_attempts a JOIN problem_codebase cb ON cb.problem_id = a.problem_id
     WHERE a.id = $1 AND a.user_id = $2`,
    [req.params.id, req.user.id],
  );
  const a = rows[0];
  if (!a) throw notFound();
  if (a.status !== "in_progress") throw new HttpError(409, "ATTEMPT_NOT_ACTIVE", "Start the problem again to use the terminal");

  const controller = new AbortController();
  // The client went away (Stop button, closed tab): stop the command.
  res.on("close", () => !res.writableEnded && controller.abort());
  const line = (event) => {
    if (!res.headersSent) res.status(200).type("application/x-ndjson").setHeader("Cache-Control", "no-store");
    res.write(JSON.stringify(event) + "\n");
  };
  const end = await runTerminal(req.params.id, a.files, files, command, {
    onOutput: (text) => line({ type: "output", text }),
    signal: controller.signal,
  });
  line(end.stopped ? { type: "stopped", reason: end.stopped } : { type: "exit", code: end.exitCode });
  res.end();
});
