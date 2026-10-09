import { Router } from "express";
import { config } from "../../config.js";
import { pool } from "../../db.js";
import { HttpError } from "../../errors.js";
import { connectedKey, loadUserKey } from "../ai/apiKeys.js";
import { chat, platformModel, systemPrompt } from "../ai/chat.service.js";
import { feedback } from "../ai/feedback.service.js";
import { requireAuth } from "../auth/auth.service.js";
import { checkUnlock } from "../careerPaths/careerPaths.routes.js";
import { runChecks, runTerminal, stopTerminal, validateFiles } from "../runner/runner.service.js";
import { activeSeconds, efficiencyScore, finalPoints, lineChanges, pickBenchmark, timeMultiplier } from "../scoring/scoring.js";

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
 * base × time multiplier × AI efficiency (S3), two ledger rows (D15), user_stats, daily activity, solve_count,
 * contest entries (T2).
 * The attempt row is locked, so a double click never awards points twice.
 */
attemptsRouter.post("/:id/test", async (req, res) => {
  if (!UUID.test(req.params.id)) throw notFound();
  const files = req.body?.files;
  validateFiles(files);
  const { rows } = await pool.query(
    `SELECT a.status, a.career_path, p.id AS problem_id, p.base_points, p.difficulty, p.time_limit_minutes, cb.files, cb.hidden_files, cb.setup_commands,
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
  const allPassed = results.every((r) => r.passed || optional.has(r.checkId));
  await recordTestRun(req.params.id, results, allPassed);
  const solved = allPassed ? await solve(req.params.id, req.user.id, a, { ...a.files, ...files }) : null;
  if (solved) {
    await stopTerminal(req.params.id);
    void feedback.start(req.params.id); // S8: after the commit, not awaited; a double click starts it once
  }
  line({ type: "done", results, solved });
  res.end();
});

/**
 * S2: every Submit is a test_run event in the attempt's session (written here, never by the client), plus the session
 * counters: test runs, passed on the first run (= all must-pass checks), and iterations (D51 a: a test run after at
 * least one prompt since the previous run). The session row is locked by the upsert, so runs at once count once each.
 */
async function recordTestRun(attemptId, results, allPassed) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO solve_sessions (attempt_id) VALUES ($1)
       ON CONFLICT (attempt_id) DO UPDATE SET updated_at = now() RETURNING id`,
      [attemptId],
    );
    const sessionId = rows[0].id;
    await client.query(
      `WITH prompted AS (
         SELECT EXISTS (SELECT 1 FROM prompt_events WHERE session_id = $1 AND sent_at > coalesce(
           (SELECT max(occurred_at) FROM editor_events WHERE session_id = $1 AND event_type = 'test_run'), '-infinity'))
           AS yes
       ), run AS (
         INSERT INTO editor_events (session_id, event_type, metadata) VALUES ($1, 'test_run', $2)
       )
       UPDATE solve_sessions SET test_runs_count = test_runs_count + 1,
         tests_passed_on_first_run = CASE WHEN test_runs_count = 0 THEN $3 ELSE tests_passed_on_first_run END,
         total_ai_iterations = total_ai_iterations + (SELECT yes::int FROM prompted), updated_at = now()
       WHERE id = $1`,
      [sessionId, { passed: results.filter((r) => r.passed).length, total: results.length, allPassed }, allPassed],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function solve(attemptId, userId, problem, finalCode) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Lock order session → attempt, like every session writer (prompts, events, test runs lock the session row and
    // then the attempt through the foreign key). The other order deadlocks on a double click (S3).
    await client.query("SELECT 1 FROM solve_sessions WHERE attempt_id = $1 FOR UPDATE", [attemptId]);
    const { rows } = await client.query(
      `SELECT a.status, a.points_earned, a.time_taken_seconds, a.time_bonus_multiplier::float AS multiplier,
         s.efficiency_score::float AS efficiency
       FROM user_problem_attempts a LEFT JOIN solve_sessions s ON s.attempt_id = a.id WHERE a.id = $1 FOR UPDATE OF a`,
      [attemptId],
    );
    const row = rows[0];
    // Another request solved it while this one ran the checks (double click): same answer, no second award.
    if (row.status !== "in_progress") {
      await client.query("ROLLBACK");
      return row.status === "solved"
        ? {
            pointsEarned: row.points_earned,
            timeTakenSeconds: row.time_taken_seconds,
            timeMultiplier: row.multiplier,
            efficiencyScore: row.efficiency,
          }
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
    const efficiency = await sessionScore(client, attemptId, problem);
    const points = finalPoints(problem.base_points, multiplier, efficiency);
    const bonus = Math.max(0, points - problem.base_points);
    const lines = lineChanges(problem.files, finalCode);

    await client.query(
      `UPDATE user_problem_attempts SET status = 'solved', solved_at = now(), time_taken_seconds = $2,
         time_bonus_multiplier = $3, points_earned = $4, final_code = $5, lines_added = $6, lines_deleted = $7
       WHERE id = $1`,
      [attemptId, seconds, multiplier, points, finalCode, lines.added, lines.deleted],
    );
    // D15: the base as 'problem_solved', the time and efficiency bonus as its own row (only when there is one).
    // Sum = points; below the base (efficiency < 1) it is one 'problem_solved' row with the lower amount.
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
    await sessionTimes(client, attemptId);
    await updateBenchmark(client, problem.problem_id, attemptId, seconds);
    // K2 (D66 e): a solve on a career path can open the path's next stage.
    if (problem.career_path) await checkUnlock(client, userId, problem.career_path);
    await client.query("INSERT INTO solve_feedback (attempt_id) VALUES ($1) ON CONFLICT DO NOTHING", [attemptId]);
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
    return { pointsEarned: points, timeTakenSeconds: seconds, timeMultiplier: multiplier, efficiencyScore: efficiency };
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

const MAX_PROMPT_CHARS = 8000;

// D62: platform tokens the user spent today (UTC day, D7) across all attempts. Own-key prompts (S6) never count.
async function freeTokensUsedToday(userId) {
  const { rows } = await pool.query(
    `SELECT coalesce(sum(pe.total_tokens), 0)::int AS used
     FROM prompt_events pe
     JOIN solve_sessions s ON s.id = pe.session_id
     JOIN user_problem_attempts a ON a.id = s.attempt_id
     WHERE a.user_id = $1 AND pe.key_source = 'platform' AND pe.sent_at >= (now() AT TIME ZONE 'UTC')::date`,
    [userId],
  );
  return rows[0].used;
}

/**
 * S3: the score so far, for the chat panel - the same function and benchmark as on solve. Before the first test run
 * the first-run part counts as passed (what the score would be if the next run solves it).
 */
async function liveEfficiency(attemptId) {
  const { rows } = await pool.query(
    `SELECT p.id AS problem_id, p.difficulty, s.total_prompts, s.total_tokens_used, s.total_ai_iterations, s.test_runs_count,
       s.tests_passed_on_first_run
     FROM user_problem_attempts a JOIN problems p ON p.id = a.problem_id
     LEFT JOIN solve_sessions s ON s.attempt_id = a.id WHERE a.id = $1`,
    [attemptId],
  );
  const r = rows[0];
  const benchmark = await benchmarkFor(pool, r.problem_id, r.difficulty);
  const score = efficiencyScore(
    {
      prompts: r.total_prompts ?? 0,
      tokens: r.total_tokens_used ?? 0,
      iterations: r.total_ai_iterations ?? 0,
      passedFirstRun: !r.test_runs_count || r.tests_passed_on_first_run,
    },
    benchmark,
  );
  return { score, benchmark };
}

const promptHistory = (attemptId) =>
  pool.query(
    `SELECT pe.prompt_text, pe.response_text, pe.sent_at FROM prompt_events pe
     JOIN solve_sessions s ON s.id = pe.session_id WHERE s.attempt_id = $1 ORDER BY pe.prompt_index`,
    [attemptId],
  );

/**
 * S1: the attempt's chat so far (after a reload), the model in use and what is left of today's free limit (D51 e).
 * model = null when the server has no AI key. Only the owner (foreign = 404).
 */
attemptsRouter.get("/:id/ai/messages", async (req, res) => {
  if (!UUID.test(req.params.id)) throw notFound();
  const { rows } = await pool.query(
    `SELECT s.total_prompts, s.total_tokens_used FROM user_problem_attempts a
     LEFT JOIN solve_sessions s ON s.attempt_id = a.id WHERE a.id = $1 AND a.user_id = $2`,
    [req.params.id, req.user.id],
  );
  if (!rows[0]) throw notFound();
  const [history, used, own, efficiency] = await Promise.all([
    promptHistory(req.params.id),
    freeTokensUsedToday(req.user.id),
    connectedKey(req.user.id),
    liveEfficiency(req.params.id),
  ]);
  const platform = platformModel();
  res.json({
    messages: history.rows.flatMap((r) => [
      { role: "user", text: r.prompt_text, at: r.sent_at },
      { role: "ai", text: r.response_text, at: r.sent_at },
    ]),
    model: own ? { keySource: "user", name: own.model } : platform && { keySource: "platform", name: platform.model },
    totalPrompts: rows[0].total_prompts ?? 0,
    totalTokens: rows[0].total_tokens_used ?? 0,
    remainingTokens: Math.max(0, config.aiFreeDailyTokens - used),
    efficiency,
  });
});

/**
 * S1: one prompt to the built-in AI. The AI sees the user's current files (sent like Test/terminal, over the original
 * files; hidden files never) and the earlier turns of this attempt. With the user's own key (S6): their provider and
 * model, no limit. Otherwise platform key + cheap model with a daily token limit (D62): over it → 429, solving goes on
 * without AI. The prompt is recorded with the provider's real token usage
 * in the attempt's session (one per attempt, across tries - D56).
 * ponytail: the limit is checked before the call, so the last prompt of the day can go over it by one answer.
 */
attemptsRouter.post("/:id/ai/messages", async (req, res) => {
  if (!UUID.test(req.params.id)) throw notFound();
  const { text: raw, files } = req.body ?? {};
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text || text.length > MAX_PROMPT_CHARS)
    throw new HttpError(400, "INVALID_PROMPT", `The message must be 1-${MAX_PROMPT_CHARS} characters`);
  validateFiles(files);
  const { rows } = await pool.query(
    `SELECT a.status, cb.files FROM user_problem_attempts a JOIN problem_codebase cb ON cb.problem_id = a.problem_id
     WHERE a.id = $1 AND a.user_id = $2`,
    [req.params.id, req.user.id],
  );
  const a = rows[0];
  if (!a) throw notFound();
  if (a.status === "solved") throw new HttpError(409, "ALREADY_SOLVED", "You have already solved this problem");
  if (a.status !== "in_progress") throw new HttpError(409, "ATTEMPT_NOT_ACTIVE", "Start the problem again to use the AI");
  const userKey = await loadUserKey(req.user.id);
  const keySource = userKey ? "user" : "platform";
  if (!userKey && !platformModel()) throw new HttpError(503, "AI_DISABLED", "The AI assistant is not set up on the server yet.");

  const used = await freeTokensUsedToday(req.user.id);
  if (!userKey && used >= config.aiFreeDailyTokens)
    throw new HttpError(429, "AI_DAILY_LIMIT", "Daily free AI limit reached. Connect your own API key in Settings to keep going.");

  const history = await promptHistory(req.params.id);
  const answer = await chat.complete({
    system: systemPrompt({ ...a.files, ...files }),
    messages: [
      ...history.rows.flatMap((r) => [
        { role: "user", content: r.prompt_text },
        { role: "assistant", content: r.response_text },
      ]),
      { role: "user", content: text },
    ],
    userKey,
  });
  const tokens = answer.promptTokens + answer.responseTokens;

  const client = await pool.connect();
  let session;
  try {
    await client.query("BEGIN");
    // The upsert locks the session row, so two prompts at once get different prompt_index values.
    ({ rows: [session] } = await client.query(
      `INSERT INTO solve_sessions (attempt_id, total_prompts, total_tokens_used) VALUES ($1, 1, $2)
       ON CONFLICT (attempt_id) DO UPDATE SET total_prompts = solve_sessions.total_prompts + 1,
         total_tokens_used = solve_sessions.total_tokens_used + $2, updated_at = now()
       RETURNING id, total_prompts, total_tokens_used`,
      [req.params.id, tokens],
    ));
    await client.query(
      `INSERT INTO prompt_events (session_id, prompt_index, prompt_text, response_text, prompt_tokens, response_tokens,
         total_tokens, key_source, model)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [session.id, session.total_prompts, text, answer.text, answer.promptTokens, answer.responseTokens, tokens, keySource, answer.model],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  res.status(201).json({
    message: { role: "ai", text: answer.text, at: new Date() },
    model: { keySource, name: answer.model },
    totalPrompts: session.total_prompts,
    totalTokens: session.total_tokens_used,
    // Own-key prompts never use the free limit.
    remainingTokens: Math.max(0, config.aiFreeDailyTokens - used - (userKey ? 0 : tokens)),
    efficiency: await liveEfficiency(req.params.id),
  });
});

// S2: the event types the client may send. test_run is the server's (R4), prompts are prompt_events (S1).
const CLIENT_EVENTS = new Set(["file_open", "description_open", "description_close"]);
const MAX_EVENTS = 100;

/**
 * S2: a batch of the solve page's events { id, type, at, fileName? }. The client's id makes a resent batch a no-op.
 * Times come from the client (batches are sent late) but are kept between the first try's start and now.
 * Only while the attempt is open: solved → 409, given up → 409.
 */
attemptsRouter.post("/:id/events", async (req, res) => {
  if (!UUID.test(req.params.id)) throw notFound();
  const events = req.body?.events;
  const invalid = (message) => new HttpError(400, "INVALID_EVENTS", message);
  if (!Array.isArray(events) || !events.length || events.length > MAX_EVENTS)
    throw invalid(`events must be a list of 1-${MAX_EVENTS} events`);
  for (const e of events) {
    if (!e || typeof e !== "object") throw invalid("Each event must be an object");
    if (typeof e.id !== "string" || !UUID.test(e.id)) throw invalid("Each event needs a UUID id");
    if (!CLIENT_EVENTS.has(e.type)) throw invalid(`Unknown event type: ${String(e.type).slice(0, 30)}`);
    if (typeof e.at !== "string" || Number.isNaN(Date.parse(e.at))) throw invalid("Each event needs a time (at)");
    if (e.fileName !== undefined && (typeof e.fileName !== "string" || !e.fileName || e.fileName.length > 255))
      throw invalid("fileName must be 1-255 characters");
  }

  const { rows } = await pool.query("SELECT status FROM user_problem_attempts WHERE id = $1 AND user_id = $2", [
    req.params.id,
    req.user.id,
  ]);
  const a = rows[0];
  if (!a) throw notFound();
  if (a.status === "solved") throw new HttpError(409, "ALREADY_SOLVED", "You have already solved this problem");
  if (a.status !== "in_progress") throw new HttpError(409, "ATTEMPT_NOT_ACTIVE", "Start the problem again");

  await pool.query(
    `WITH s AS (
       INSERT INTO solve_sessions (attempt_id) VALUES ($1)
       ON CONFLICT (attempt_id) DO UPDATE SET updated_at = now() RETURNING id
     )
     INSERT INTO editor_events (id, session_id, event_type, file_name, occurred_at)
     SELECT e.id, (SELECT id FROM s), e.type, e.file_name,
       least(greatest(e.at AT TIME ZONE 'UTC',
         (SELECT min(started_at) FROM attempt_tries WHERE attempt_id = $1)), now()::timestamp)
     FROM json_to_recordset($2) AS e (id UUID, type TEXT, file_name TEXT, at TIMESTAMPTZ)
     ON CONFLICT (id) DO NOTHING`,
    [req.params.id, JSON.stringify(events.map((e) => ({ id: e.id, type: e.type, file_name: e.fileName ?? null, at: e.at })))],
  );
  res.status(204).end();
});

/**
 * S2: on solve (inside its transaction), the session's time to the first prompt and time on the description (from the
 * start to the first action: a file opened, the description closed, a prompt or a test run). Both in solving time
 * (D56, activeSeconds) - a break between tries does not count. No prompt → time_to_first_prompt stays NULL.
 */
async function sessionTimes(client, attemptId) {
  const { rows } = await client.query(
    `SELECT s.id,
       (SELECT json_agg(json_build_object('startedAt', t.started_at, 'endedAt', t.ended_at) ORDER BY t.try_number)
        FROM attempt_tries t WHERE t.attempt_id = $1) AS tries,
       (SELECT min(sent_at) FROM prompt_events WHERE session_id = s.id) AS first_prompt,
       (SELECT min(occurred_at) FROM editor_events WHERE session_id = s.id
        AND event_type IN ('file_open', 'description_close', 'test_run')) AS first_event
     FROM solve_sessions s WHERE s.attempt_id = $1`,
    [attemptId],
  );
  const s = rows[0];
  if (!s) return; // recordTestRun creates the session before every solve; kept for safety
  // json_agg returns timestamps as strings without a zone; pg reads TIMESTAMP columns as local time, so do the same.
  const tries = s.tries.map((t) => ({ startedAt: new Date(t.startedAt), endedAt: t.endedAt && new Date(t.endedAt) }));
  const firstAction = [s.first_prompt, s.first_event].filter(Boolean).sort((x, y) => x - y)[0];
  await client.query(
    "UPDATE solve_sessions SET time_to_first_prompt = $2, time_on_description = $3, updated_at = now() WHERE id = $1",
    [
      s.id,
      s.first_prompt ? activeSeconds(s.first_prompt, tries) : null,
      firstAction ? activeSeconds(firstAction, tries) : null,
    ],
  );
}

/**
 * S3: the session's efficiency (0.5-2.0) against the difficulty's benchmark, stored on the session in the solve
 * transaction. recordTestRun creates the session before every solve, so there always is one.
 */
async function sessionScore(client, attemptId, problem) {
  const { rows } = await client.query(
    `SELECT total_prompts, total_tokens_used, total_ai_iterations, tests_passed_on_first_run
     FROM solve_sessions WHERE attempt_id = $1 FOR UPDATE`,
    [attemptId],
  );
  const s = rows[0];
  const score = efficiencyScore(
    { prompts: s.total_prompts, tokens: s.total_tokens_used, iterations: s.total_ai_iterations, passedFirstRun: s.tests_passed_on_first_run },
    await benchmarkFor(client, problem.problem_id, problem.difficulty),
  );
  await client.query("UPDATE solve_sessions SET efficiency_score = $2 WHERE attempt_id = $1", [attemptId, score]);
  return score;
}

/** S7: the problem's own benchmark once it has enough solves, else the difficulty's (pickBenchmark). */
async function benchmarkFor(db, problemId, difficulty) {
  const { rows } = await db.query("SELECT * FROM problem_benchmarks WHERE problem_id = $1", [problemId]);
  return pickBenchmark(rows[0], difficulty);
}

/**
 * S7: adds this solve to the problem's running averages (avg + (x - avg) / n) in the solve transaction - after the
 * score, so a solve is never measured against itself. A double Submit never gets here twice (solve() returns early).
 */
async function updateBenchmark(client, problemId, attemptId, seconds) {
  await client.query(
    `INSERT INTO problem_benchmarks AS b (problem_id, avg_prompts, avg_tokens, avg_iterations, avg_time_seconds,
       avg_efficiency_score, avg_first_run_pass_rate, solve_count)
     SELECT $1, s.total_prompts, s.total_tokens_used, s.total_ai_iterations, $3, s.efficiency_score,
       s.tests_passed_on_first_run::int, 1
     FROM solve_sessions s WHERE s.attempt_id = $2
     ON CONFLICT (problem_id) DO UPDATE SET
       avg_prompts = b.avg_prompts + (EXCLUDED.avg_prompts - b.avg_prompts) / (b.solve_count + 1),
       avg_tokens = b.avg_tokens + (EXCLUDED.avg_tokens - b.avg_tokens) / (b.solve_count + 1),
       avg_iterations = b.avg_iterations + (EXCLUDED.avg_iterations - b.avg_iterations) / (b.solve_count + 1),
       avg_time_seconds = b.avg_time_seconds + (EXCLUDED.avg_time_seconds - b.avg_time_seconds) / (b.solve_count + 1),
       avg_efficiency_score = b.avg_efficiency_score + (EXCLUDED.avg_efficiency_score - b.avg_efficiency_score) / (b.solve_count + 1),
       avg_first_run_pass_rate = b.avg_first_run_pass_rate
         + (EXCLUDED.avg_first_run_pass_rate - b.avg_first_run_pass_rate) / (b.solve_count + 1),
       solve_count = b.solve_count + 1, updated_at = now()`,
    [problemId, attemptId, seconds],
  );
}

/**
 * S8: the solve's AI feedback - { status: 'pending' | 'ready' | 'failed' | 'unavailable', content }. Only the owner
 * (foreign = 404); not solved → 409. 'unavailable' = solved before S8. A stuck pending one is started again, a failed
 * one at most every 30 s (a provider outage is not hit on every poll), never without an AI key on the server.
 */
attemptsRouter.get("/:id/feedback", async (req, res) => {
  if (!UUID.test(req.params.id)) throw notFound();
  const { rows } = await pool.query(
    `SELECT a.status AS attempt_status, f.status, f.content, f.requested_at < now() - interval '2 minutes' AS stale,
       f.requested_at IS NULL OR f.requested_at < now() - interval '30 seconds' AS retry
     FROM user_problem_attempts a LEFT JOIN solve_feedback f ON f.attempt_id = a.id WHERE a.id = $1 AND a.user_id = $2`,
    [req.params.id, req.user.id],
  );
  const r = rows[0];
  if (!r) throw notFound();
  if (r.attempt_status !== "solved") throw new HttpError(409, "NOT_SOLVED", "Feedback comes after you solve the problem");
  if (!r.status) return res.json({ status: "unavailable", content: null });
  const restart = (r.status === "failed" && r.retry) || (r.status === "pending" && r.stale);
  if (restart && platformModel()) {
    void feedback.start(req.params.id);
    return res.json({ status: "pending", content: null });
  }
  res.json({ status: r.status === "pending" && r.stale ? "failed" : r.status, content: r.content });
});
