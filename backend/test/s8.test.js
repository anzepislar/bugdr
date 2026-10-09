import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { pool } from "../src/db.js";
import { migrate, seed } from "../src/migrate.js";
import { chat } from "../src/modules/ai/chat.service.js";
import { feedback } from "../src/modules/ai/feedback.service.js";

// S8: feedback after a solve. Solving runs the real checks of payment-retries-disappear in Docker; the AI is replaced.
const skip = spawnSync("docker", ["info"]).status !== 0 && "Docker is not running";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
const request = (method, path, cookie, body) =>
  fetch(`${base}${path}`, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
const done = async (res) => (await res.text()).trim().split("\n").map((l) => JSON.parse(l)).at(-1);
const getFeedback = async (id, cookie) => (await request("GET", `/attempts/${id}/feedback`, cookie)).json();
/** Polls GET until the feedback is no longer pending (generation runs in the background). */
async function settled(id, cookie) {
  for (let i = 0; i < 50; i++) {
    const body = await getFeedback(id, cookie);
    if (body.status !== "pending") return body;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("feedback stayed pending");
}
async function signup(name) {
  const res = await request("POST", "/auth/signup", null, { email: `${name}@example.com`, username: name, password: "password1" });
  return res.headers.get("set-cookie").split(";")[0];
}

const realComplete = chat.complete;
const saved = { ...config };
let calls, failNext, solution, alice, bob, aliceAttempt;
before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems CASCADE");
  await seed();
  const cb = await one(
    `SELECT cb.files, cb.solution_files FROM problem_codebase cb JOIN problems p ON p.id = cb.problem_id
     WHERE p.slug = 'payment-retries-disappear'`,
  );
  solution = { ...cb.files, ...cb.solution_files };
  [alice, bob] = [await signup("alice"), await signup("bobby")];
  Object.assign(config, { aiProvider: "anthropic", anthropicApiKey: "sk-test", aiFreeDailyTokens: 1e9 });
});
beforeEach(() => {
  calls = [];
  failNext = false;
  chat.complete = async (args) => {
    calls.push(args);
    if (args.system.startsWith("You write short, personal feedback") && failNext) {
      failNext = false;
      throw Object.assign(new Error("provider down"), { status: 503 });
    }
    return { text: args.system.startsWith("You write") ? "  Good work on the retries.  " : "ok", model: "claude-haiku-4-5", promptTokens: 10, responseTokens: 5 };
  };
});
after(async () => {
  chat.complete = realComplete;
  Object.assign(config, saved);
  server.close();
  await pool.end();
});

test("feedback before solving → 409, a guest → 401, someone else's attempt → 404", async () => {
  const { attempt } = await (await request("POST", "/problems/payment-retries-disappear/start", alice)).json();
  aliceAttempt = attempt.id;
  assert.equal((await request("GET", `/attempts/${attempt.id}/feedback`, alice)).status, 409);
  assert.equal((await request("GET", `/attempts/${attempt.id}/feedback`)).status, 401);
  assert.equal((await request("GET", `/attempts/${attempt.id}/feedback`, bob)).status, 404);
});

test("a solve creates pending feedback that becomes ready; only the owner sees it", { skip }, async () => {
  await request("POST", `/attempts/${aliceAttempt}/ai/messages`, alice, { text: "Why do retries vanish?", files: {} });
  const result = await done(await request("POST", `/attempts/${aliceAttempt}/test`, alice, { files: solution }));
  assert.ok(result.solved);
  assert.deepEqual(await settled(aliceAttempt, alice), { status: "ready", content: "Good work on the retries." });
  assert.equal((await request("GET", `/attempts/${aliceAttempt}/feedback`, bob)).status, 404);

  // One call with the cheap platform model (no user key), the session numbers and the prompts - plain text.
  const call = calls.find((c) => c.system.startsWith("You write"));
  assert.equal(call.userKey, undefined);
  const report = call.messages[0].content;
  assert.match(report, /Prompts to the AI: 1/);
  assert.match(report, /Why do retries vanish\?/);
  assert.match(report, /few solves yet/); // < 8 other solves → typical values
  const row = await one("SELECT model, generated_at FROM solve_feedback WHERE attempt_id = $1", [aliceAttempt]);
  assert.equal(row.model, "claude-haiku-4-5");
  assert.ok(row.generated_at);

  // The detail page tells the client which attempt to ask about.
  const { problem } = await (await request("GET", "/problems/payment-retries-disappear", alice)).json();
  assert.equal(problem.result.attemptId, aliceAttempt);
});

test("a provider error → failed, the solve and points stay; the next GET starts it again", { skip }, async () => {
  const { attempt } = await (await request("POST", "/problems/payment-retries-disappear/start", bob)).json();
  failNext = true;
  const result = await done(await request("POST", `/attempts/${attempt.id}/test`, bob, { files: solution }));
  assert.ok(result.solved.pointsEarned > 0);
  // Wait for the background call to fail.
  for (let i = 0; i < 50 && (await one("SELECT status FROM solve_feedback WHERE attempt_id = $1", [attempt.id])).status !== "failed"; i++)
    await new Promise((r) => setTimeout(r, 50));
  assert.equal((await one("SELECT status FROM solve_feedback WHERE attempt_id = $1", [attempt.id])).status, "failed");
  const a = await one("SELECT status, points_earned FROM user_problem_attempts WHERE id = $1", [attempt.id]);
  assert.equal(a.status, "solved");
  assert.equal(a.points_earned, result.solved.pointsEarned);

  // A failed one restarts at most every 30 s.
  assert.equal((await getFeedback(attempt.id, bob)).status, "failed");
  await pool.query("UPDATE solve_feedback SET requested_at = now() - interval '31 seconds' WHERE attempt_id = $1", [attempt.id]);
  assert.equal((await getFeedback(attempt.id, bob)).status, "pending"); // restarted
  assert.deepEqual(await settled(attempt.id, bob), { status: "ready", content: "Good work on the retries." });
});

test("start() runs once at a time; a stuck pending row is started again after 2 minutes", { skip }, async () => {
  let release;
  chat.complete = async (args) => {
    calls.push(args);
    await new Promise((r) => (release = r));
    return { text: "late", model: "m", promptTokens: 1, responseTokens: 1 };
  };
  await pool.query("UPDATE solve_feedback SET status = 'failed', content = NULL WHERE attempt_id = $1", [aliceAttempt]);
  const first = feedback.start(aliceAttempt);
  await new Promise((r) => setTimeout(r, 50));
  await feedback.start(aliceAttempt); // already running → nothing
  assert.equal(calls.length, 1);
  release();
  await first;
  assert.equal((await getFeedback(aliceAttempt, alice)).content, "late");

  await pool.query(
    "UPDATE solve_feedback SET status = 'pending', content = NULL, requested_at = now() - interval '3 minutes' WHERE attempt_id = $1",
    [aliceAttempt],
  );
  chat.complete = async () => ({ text: "again", model: "m", promptTokens: 1, responseTokens: 1 });
  assert.equal((await getFeedback(aliceAttempt, alice)).status, "pending");
  assert.equal((await settled(aliceAttempt, alice)).content, "again");
});

test("without an AI key on the server a failed feedback is not restarted", async () => {
  config.anthropicApiKey = "";
  await pool.query(
    "UPDATE solve_feedback SET status = 'failed', content = NULL, requested_at = now() - interval '1 hour' WHERE attempt_id = $1",
    [aliceAttempt],
  );
  calls = [];
  assert.deepEqual(await getFeedback(aliceAttempt, alice), { status: "failed", content: null });
  assert.equal(calls.length, 0);
  config.anthropicApiKey = "sk-test";
});

test("a solve from before S8 has no feedback → unavailable", async () => {
  const cookie = await signup("carol");
  const { attempt } = await (await request("POST", "/problems/payment-retries-disappear/start", cookie)).json();
  await pool.query("UPDATE user_problem_attempts SET status = 'solved', solved_at = now() WHERE id = $1", [attempt.id]);
  assert.deepEqual(await getFeedback(attempt.id, cookie), { status: "unavailable", content: null });
});

test("with 8+ other solves the feedback compares with their top 25% by efficiency score", { skip }, async () => {
  // 8 more solves by hand (scores 1.0-1.7); the best two used 2 and 4 prompts.
  for (let i = 0; i < 8; i++) {
    const { rows } = await pool.query(
      `WITH u AS (INSERT INTO users (email, password_hash, username) VALUES ($1, 'x', $2) RETURNING id),
       a AS (INSERT INTO user_problem_attempts (user_id, problem_id, status, solved_at, time_taken_seconds)
             SELECT u.id, p.id, 'solved', now(), 600 FROM u, problems p WHERE p.slug = 'payment-retries-disappear' RETURNING id)
       INSERT INTO solve_sessions (attempt_id, total_prompts, total_tokens_used, efficiency_score)
       SELECT id, $3, 1000, $4 FROM a RETURNING attempt_id`,
      [`q${i}@example.com`, `q${i}`, i === 7 ? 2 : i === 6 ? 4 : 10, 1 + i / 10],
    );
    assert.ok(rows[0]);
  }
  await pool.query("UPDATE solve_feedback SET status = 'failed', content = NULL WHERE attempt_id = $1", [aliceAttempt]);
  calls = [];
  await feedback.start(aliceAttempt);
  const report = calls[0].messages[0].content;
  // Others for alice's solve: bob + these 8 = 9 (carol's hand-solved attempt has no session).
  assert.match(report, /Top 25% of 9 other solves/);
});
