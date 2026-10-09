import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { app } from "../src/app.js";
import { pool } from "../src/db.js";
import { migrate, seed } from "../src/migrate.js";

// Runs the real checks of the seeded payment-retries-disappear (Medium, 250 points, 40 min) in Docker (R3).
const skip = spawnSync("docker", ["info"]).status !== 0 && "Docker is not running";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
const request = (method, path, cookie, body) =>
  fetch(`${base}${path}`, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
const start = async (cookie, slug = "payment-retries-disappear") =>
  (await (await request("POST", `/problems/${slug}/start`, cookie)).json()).attempt;
const submit = (id, cookie, files) => request("POST", `/attempts/${id}/test`, cookie, { files });
/** R6: a successful run is an NDJSON stream; its last line ("done") carries { results, solved }. */
const outcome = async (res) => {
  const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
  return lines.at(-1);
};
const one = async (sql, params) => (await pool.query(sql, params)).rows[0];

async function signup(name) {
  const res = await fetch(`${base}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${name}@example.com`, username: name, password: "password1" }),
  });
  const cookie = res.headers.get("set-cookie").split(";")[0];
  return { cookie, id: (await res.json()).user.id };
}

let alice, bob, carol, original, solution;
before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems CASCADE");
  await seed();
  ({ files: original, solution_files: solution } = await one(
    `SELECT cb.files, cb.solution_files FROM problem_codebase cb JOIN problems p ON p.id = cb.problem_id
     WHERE p.slug = 'payment-retries-disappear'`,
  ));
  solution = { ...original, ...solution };
  [alice, bob, carol] = [await signup("alice"), await signup("bobby"), await signup("carol")];
});
after(async () => {
  server.close();
  await pool.end();
});

test("guest 401, someone else's attempt 404, invalid files 400", async () => {
  const attempt = await start(alice.cookie);
  assert.equal((await submit(attempt.id, null, original)).status, 401);
  assert.equal((await submit(attempt.id, bob.cookie, original)).status, 404);
  const res = await submit(attempt.id, alice.cookie, { "../escape.ts": "x" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, "INVALID_FILES");
});

test("a problem without hidden checks → 409 CHECKS_UNAVAILABLE (D53)", async () => {
  const attempt = await start(alice.cookie, "cart-total-flickers");
  const res = await submit(attempt.id, alice.cookie, attempt.files);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, "CHECKS_UNAVAILABLE");
});

test("a failing submission records the results and changes nothing else", { skip }, async () => {
  const attempt = await start(alice.cookie);
  const res = await submit(attempt.id, alice.cookie, original);
  assert.equal(res.status, 200);
  const body = await outcome(res);
  assert.equal(body.solved, null);
  assert.deepEqual(body.results.map((r) => r.passed), [false, true, true, true, false, false, true]);
  assert.equal(body.results[0].checkId, attempt.checks[0].id);
  assert.equal((await one("SELECT status FROM user_problem_attempts WHERE id = $1", [attempt.id])).status, "in_progress");
  assert.equal((await one("SELECT count(*)::int AS n FROM check_results WHERE attempt_id = $1", [attempt.id])).n, 7);
  assert.equal((await one("SELECT count(*)::int AS n FROM point_transactions WHERE user_id = $1", [alice.id])).n, 0);
});

// S3: no AI, but the first run (the failing submission above) did not pass → efficiency 1.82.
test("solving counts every try (D56): 5 min given up + 6 min → 1.5x × 1.82 efficiency → 683 points, all in one transaction", { skip }, async () => {
  const attempt = await start(alice.cookie);
  await pool.query("UPDATE attempt_tries SET started_at = started_at - interval '5 minutes' WHERE attempt_id = $1", [attempt.id]);
  await request("POST", `/attempts/${attempt.id}/give-up`, alice.cookie);
  await start(alice.cookie);
  await pool.query(
    "UPDATE attempt_tries SET started_at = started_at - interval '6 minutes' WHERE attempt_id = $1 AND ended_at IS NULL",
    [attempt.id],
  );
  const solveCount = (await one("SELECT solve_count FROM problems WHERE slug = 'payment-retries-disappear'")).solve_count;

  const body = await outcome(await submit(attempt.id, alice.cookie, solution));
  assert.ok(body.results.every((r) => r.passed));
  assert.equal(body.solved.timeMultiplier, 1.5);
  assert.equal(body.solved.pointsEarned, 683);
  assert.equal(body.solved.efficiencyScore, 1.82);
  assert.ok(Math.abs(body.solved.timeTakenSeconds - 660) <= 3, `time ${body.solved.timeTakenSeconds}`);

  const a = await one("SELECT * FROM user_problem_attempts WHERE id = $1", [attempt.id]);
  assert.equal(a.status, "solved");
  assert.equal(a.points_earned, 683);
  assert.ok(a.solved_at);
  assert.ok(a.lines_added > 0 && a.lines_deleted > 0);
  assert.deepEqual(Object.keys(a.final_code).sort(), Object.keys(solution).sort());
  assert.deepEqual(
    (await pool.query("SELECT amount, reason FROM point_transactions WHERE user_id = $1 ORDER BY reason", [alice.id])).rows,
    [{ amount: 250, reason: "problem_solved" }, { amount: 433, reason: "time_bonus" }],
  );
  const stats = await one("SELECT total_points, problems_solved, current_level FROM user_stats WHERE user_id = $1", [alice.id]);
  assert.deepEqual(stats, { total_points: 683, problems_solved: 1, current_level: "Junior" });
  const day = await one("SELECT problems_solved, points_earned FROM user_daily_activity WHERE user_id = $1", [alice.id]);
  assert.deepEqual(day, { problems_solved: 1, points_earned: 683 });
  assert.equal((await one("SELECT solve_count FROM problems WHERE slug = 'payment-retries-disappear'")).solve_count, solveCount + 1);

  // The detail page shows every try (D56).
  const { problem } = await (await request("GET", "/problems/payment-retries-disappear", alice.cookie)).json();
  assert.deepEqual(problem.result.tries.map((t) => [t.tryNumber, t.outcome]), [[1, "abandoned"], [2, "solved"]]);
  assert.equal(problem.result.timeTakenSeconds, a.time_taken_seconds);
});

test("after solving: Test → 409 ALREADY_SOLVED, give up → 409; a given-up attempt → 409 ATTEMPT_NOT_ACTIVE", { skip }, async () => {
  const { id } = await one("SELECT id FROM user_problem_attempts WHERE user_id = $1 AND status = 'solved'", [alice.id]);
  assert.equal((await (await submit(id, alice.cookie, solution)).json()).error.code, "ALREADY_SOLVED");
  assert.equal((await request("POST", `/attempts/${id}/give-up`, alice.cookie)).status, 409);

  const attempt = await start(carol.cookie);
  await request("POST", `/attempts/${attempt.id}/give-up`, carol.cookie);
  assert.equal((await (await submit(attempt.id, carol.cookie, solution)).json()).error.code, "ATTEMPT_NOT_ACTIVE");
});

test("a double click awards the points once; a fast solve is 2x (× 2.0 efficiency) and reaches Junior", { skip }, async () => {
  const attempt = await start(bob.cookie);
  const [first, second] = await Promise.all([1, 2].map(async () => outcome(await submit(attempt.id, bob.cookie, solution))));
  assert.deepEqual(first.solved, second.solved);
  assert.equal(first.solved.pointsEarned, 1000);
  const ledger = await one("SELECT count(*)::int AS n, sum(amount)::int AS total FROM point_transactions WHERE user_id = $1", [bob.id]);
  assert.deepEqual(ledger, { n: 2, total: 1000 });
  const stats = await one("SELECT total_points, problems_solved, current_level FROM user_stats WHERE user_id = $1", [bob.id]);
  assert.deepEqual(stats, { total_points: 1000, problems_solved: 1, current_level: "Junior" });
});

test("SUM(point_transactions) = user_stats.total_points for every user", { skip }, async () => {
  const { rows } = await pool.query(
    `SELECT s.user_id, s.total_points, coalesce(sum(t.amount), 0)::int AS ledger
     FROM user_stats s LEFT JOIN point_transactions t ON t.user_id = s.user_id GROUP BY s.user_id, s.total_points`,
  );
  for (const r of rows) assert.equal(r.total_points, r.ledger, r.user_id);
});
