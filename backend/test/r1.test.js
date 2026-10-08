import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
const start = (slug, cookie) =>
  fetch(`${base}/problems/${slug}/start`, { method: "POST", headers: cookie ? { Cookie: cookie } : {} });
const setAttempt = (sql) => pool.query(`UPDATE user_problem_attempts SET ${sql} WHERE user_id = $1`, [userId]);

let cookie, userId;
before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems CASCADE");
  const insert = (slug, published) =>
    pool.query(
      `INSERT INTO problems (slug, title, short_description, codebase_context, incident_report, difficulty, category_id, base_points,
         time_limit_minutes, is_published)
       SELECT $1, 'Leaky worker', 'short', 'ctx', 'report', 'medium', id, 250, 40, $2
       FROM problem_categories WHERE slug = 'backend' RETURNING id`,
      [slug, published],
    );
  for (const [slug, published] of [["leaky-worker", true], ["draft-worker", false]]) {
    const id = (await insert(slug, published)).rows[0].id;
    await pool.query(
      `INSERT INTO problem_codebase (problem_id, repository_name, repository_structure, files, hidden_files, solution_files,
         language)
       VALUES ($1, 'acme / worker', '["src/index.ts"]', '{"src/index.ts": "visible source"}',
         '{"tests/hidden.test.ts": "SECRET_HIDDEN"}', '{"src/index.ts": "SECRET_SOLUTION"}', 'TypeScript')`,
      [id],
    );
    await pool.query(
      `INSERT INTO problem_checks (problem_id, check_order, description, check_type, check_command, expected_output)
       VALUES ($1, 2, 'Second check', 'test', 'SECRET_COMMAND', 'SECRET_OUTPUT'), ($1, 1, 'First check', 'test', 'SECRET_COMMAND', NULL)`,
      [id],
    );
  }
  const res = await fetch(`${base}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "r1@example.com", username: "rone", password: "password1" }),
  });
  cookie = res.headers.get("set-cookie").split(";")[0];
  userId = (await res.json()).user.id;
});
after(async () => {
  server.close();
  await pool.end();
});

test("a guest cannot start; unknown or unpublished slug → 404", async () => {
  assert.equal((await start("leaky-worker")).status, 401);
  for (const slug of ["nope", "draft-worker"]) {
    const res = await start(slug, cookie);
    assert.equal(res.status, 404, slug);
    assert.equal((await res.json()).error.code, "PROBLEM_NOT_FOUND");
  }
});

test("start returns the visible files and checks in order, never hidden files, solutions or commands", async () => {
  const res = await start("leaky-worker", cookie);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.doesNotMatch(body, /SECRET_/);
  const { attempt } = JSON.parse(body);
  assert.deepEqual(attempt.files, { "src/index.ts": "visible source" });
  assert.deepEqual(
    attempt.checks.map((c) => [c.checkOrder, c.description]),
    [[1, "First check"], [2, "Second check"]],
  );
  assert.equal(attempt.repositoryName, "acme / worker");
  assert.equal(attempt.timeLimitMinutes, 40);
  assert.ok(Math.abs(Date.parse(attempt.startedAt) - Date.now()) < 60_000, "startedAt is now (UTC)");
});

test("starting again returns the same attempt and does not reset the timer", async () => {
  await setAttempt("started_at = started_at - interval '10 minutes'");
  const first = (await (await start("leaky-worker", cookie)).json()).attempt;
  const again = (await (await start("leaky-worker", cookie)).json()).attempt;
  assert.equal(again.id, first.id);
  assert.equal(again.startedAt, first.startedAt);
  assert.ok(Date.now() - Date.parse(first.startedAt) > 9 * 60_000);
});

test("an abandoned attempt reopens as the same row with a new started_at (D8)", async () => {
  await setAttempt("status = 'abandoned', started_at = started_at - interval '1 day'");
  // Giving up also closes the open try (R2b); here it is set up by hand.
  await pool.query("UPDATE attempt_tries SET ended_at = now(), outcome = 'abandoned', duration_seconds = 60 WHERE ended_at IS NULL");
  const { attempt } = await (await start("leaky-worker", cookie)).json();
  assert.ok(Math.abs(Date.parse(attempt.startedAt) - Date.now()) < 60_000);
  const { rows } = await pool.query("SELECT status, count(*) OVER () AS n FROM user_problem_attempts WHERE user_id = $1", [
    userId,
  ]);
  assert.deepEqual([rows[0].status, Number(rows[0].n)], ["in_progress", 1]);
});

test("a solved problem → 409 ALREADY_SOLVED and stays solved", async () => {
  await setAttempt("status = 'solved', solved_at = now()");
  const res = await start("leaky-worker", cookie);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, "ALREADY_SOLVED");
  const { rows } = await pool.query("SELECT status FROM user_problem_attempts WHERE user_id = $1", [userId]);
  assert.equal(rows[0].status, "solved");
});
