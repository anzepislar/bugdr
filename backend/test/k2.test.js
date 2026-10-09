import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { app } from "../src/app.js";
import { pool } from "../src/db.js";
import { migrate, seed } from "../src/migrate.js";
import { checkUnlock } from "../src/modules/careerPaths/careerPaths.routes.js";

// K2 (D66): career path progress, assignment and unlock. Solves are inserted directly, except the last test, which
// solves payment-retries-disappear for real in Docker.
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
const code = async (res) => [res.status, (await res.json()).error?.code];

let n = 0;
async function signup() {
  const name = `k2user${++n}`;
  const res = await request("POST", "/auth/signup", null, { email: `${name}@example.com`, username: name, password: "password1" });
  const cookie = res.headers.get("set-cookie").split(";")[0];
  const { id } = await one("SELECT id FROM users WHERE username = $1", [name]);
  return { cookie, id };
}

/** A published problem in `roles` (none = general). `age` in days: older problems are assigned first. */
async function problem(slug, difficulty, roles, age) {
  const { id } = await one(
    `INSERT INTO problems (slug, title, short_description, codebase_context, incident_report, difficulty, base_points,
       time_limit_minutes, category_id, is_published, created_at)
     SELECT $1, $1, 's', 'c', 'i', $2, $4, 15, id, TRUE, now() - make_interval(days => $3) FROM problem_categories
     WHERE slug = 'backend' RETURNING id`,
    [slug, difficulty, age, { easy: 100, medium: 250 }[difficulty]],
  );
  await pool.query(
    `INSERT INTO problem_codebase (problem_id, repository_structure, files, language) VALUES ($1, '[]', '{"a.js": "x"}', 'javascript')`,
    [id],
  );
  await pool.query("INSERT INTO problem_career_paths (problem_id, role) SELECT $1, unnest($2::text[])", [id, roles]);
  return id;
}

const GOOD = { efficiency: 1.5, prompts: 3, firstRun: true, multiplier: 2 };
/** A solved attempt on a path with these session numbers, `daysAgo` days ago. */
async function solved(userId, problemId, role, s = GOOD, daysAgo = 0) {
  const a = await one(
    `INSERT INTO user_problem_attempts (user_id, problem_id, career_path, status, started_at, solved_at, time_bonus_multiplier)
     VALUES ($1, $2, $3, 'solved', now() - make_interval(days => $4), now() - make_interval(days => $4), $5) RETURNING id`,
    [userId, problemId, role, daysAgo, s.multiplier],
  );
  await pool.query(
    `INSERT INTO solve_sessions (attempt_id, efficiency_score, total_prompts, tests_passed_on_first_run) VALUES ($1, $2, $3, $4)`,
    [a.id, s.efficiency, s.prompts, s.firstRun],
  );
}
const paths = async (cookie) => (await (await request("GET", "/career-paths", cookie)).json()).paths;
const path = async (cookie, role) => (await paths(cookie)).find((p) => p.role === role);
const start = (cookie, slug, careerPath) => request("POST", `/problems/${slug}/start`, cookie, careerPath ? { careerPath } : undefined);
async function unlock(userId, role) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await checkUnlock(client, userId, role);
    await client.query("COMMIT");
  } finally {
    client.release();
  }
  return (await one("SELECT current_stage FROM career_path_progress WHERE user_id = $1 AND role = $2", [userId, role]))
    ?.current_stage;
}

const easy = [];
before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems CASCADE");
  await seed();
  await pool.query("DELETE FROM problems WHERE slug <> 'payment-retries-disappear'");
  // Backend path: 6 Easy (e1 oldest) + 1 Medium. e1 and e2 are also in the Database path. g1 is general.
  for (let i = 1; i <= 6; i++) easy.push(await problem(`e${i}`, "easy", i <= 2 ? ["backend", "database"] : ["backend"], 100 - i));
  await problem("m1", "medium", ["backend"], 50);
  await problem("g1", "easy", [], 200);
});
after(async () => {
  server.close();
  await pool.end();
});

test("GET /career-paths: every role, the goal role first, Easy, the oldest Easy problem assigned; guests 401", async () => {
  const u = await signup();
  await pool.query("INSERT INTO user_profiles (user_id, goal_role) VALUES ($1, 'database')", [u.id]);
  const list = await paths(u.cookie);
  assert.deepEqual(list.map((p) => p.role), ["database", "ai-engineer", "backend", "frontend", "fullstack"]);
  assert.equal(list[0].isGoalRole, true);
  const backend = list.find((p) => p.role === "backend");
  assert.deepEqual(
    { started: backend.started, stage: backend.stage, solves: backend.solvesOnStage, next: backend.nextProblem.slug },
    { started: false, stage: "easy", solves: 0, next: "e1" },
  );
  assert.equal(backend.progress.required, 5);
  assert.equal(list.find((p) => p.role === "frontend").nextProblem, null, "a path without problems");
  assert.equal((await request("GET", "/career-paths")).status, 401);
});

test("path problems start only from their path, and only the assigned one; a double start is one attempt", async () => {
  const u = await signup();
  assert.deepEqual(await code(await start(u.cookie, "e1")), [403, "PATH_PROBLEM"]);
  assert.deepEqual(await code(await start(u.cookie, "e2", "backend")), [403, "NOT_ASSIGNED"]);
  assert.deepEqual(await code(await start(u.cookie, "e3", "database")), [404, "PROBLEM_NOT_FOUND"]);
  assert.deepEqual(await code(await start(u.cookie, "g1", "backend")), [404, "PROBLEM_NOT_FOUND"]);
  assert.equal((await start(u.cookie, "g1")).status, 200, "a general problem starts as before");

  const [r1, r2] = await Promise.all([start(u.cookie, "e1", "backend"), start(u.cookie, "e1", "backend")]);
  const [a1, a2] = [(await r1.json()).attempt, (await r2.json()).attempt];
  assert.equal(a1.id, a2.id);
  assert.equal(a1.tryNumber, 1);
  const row = await one("SELECT career_path FROM user_problem_attempts WHERE id = $1", [a1.id]);
  assert.equal(row.career_path, "backend");
  const backend = await path(u.cookie, "backend");
  assert.deepEqual([backend.started, backend.nextProblem.slug, backend.nextProblem.inProgress], [true, "e1", true]);

  // The detail page knows the path, for the Resume link.
  const { problem } = await (await request("GET", "/problems/e1", u.cookie)).json();
  assert.deepEqual([problem.isPathProblem, problem.careerPath, problem.status], [true, "backend", "in_progress"]);

  // Give up → the next problem is assigned; the given-up one does not come back now.
  assert.equal((await request("POST", `/attempts/${a1.id}/give-up`, u.cookie)).status, 204);
  assert.equal((await path(u.cookie, "backend")).nextProblem.slug, "e2");
  assert.deepEqual(await code(await start(u.cookie, "e1", "backend")), [403, "NOT_ASSIGNED"]);
});

test("5 Easy solves over the thresholds → Medium; one condition missing → stays Easy", async () => {
  const u = await signup();
  await pool.query("INSERT INTO career_path_progress (user_id, role) VALUES ($1, 'backend')", [u.id]);
  for (let i = 0; i < 4; i++) await solved(u.id, easy[i], "backend", GOOD, 10 - i);
  assert.equal(await unlock(u.id, "backend"), "easy", "only 4 solves");
  await solved(u.id, easy[4], "backend", { ...GOOD, prompts: 50 }, 1); // avg prompts (4×3 + 50) / 5 = 12.4 > 10
  assert.equal(await unlock(u.id, "backend"), "easy", "prompts too high");
  const p = (await path(u.cookie, "backend")).progress;
  assert.deepEqual(
    p.metrics.map((m) => [m.key, m.value, m.met]),
    [["efficiency", 1.5, true], ["prompts", 12.4, false], ["firstRun", 1, true]],
  );
  // A 6th solve pushes the oldest out of the last 5, but the bad one stays: still 12.4.
  await solved(u.id, easy[5], "backend", GOOD, 0);
  assert.equal(await unlock(u.id, "backend"), "easy");

  const v = await signup();
  await pool.query("INSERT INTO career_path_progress (user_id, role) VALUES ($1, 'backend')", [v.id]);
  for (let i = 0; i < 5; i++) await solved(v.id, easy[i], "backend", GOOD, 10 - i);
  assert.equal(await unlock(v.id, "backend"), "medium");
  const after = await path(v.cookie, "backend");
  assert.deepEqual([after.stage, after.nextProblem.slug, after.progress.required], ["medium", "m1", 5]);
  assert.ok(after.stageUnlockedAt);
});

test("solves are separate per path; a finished pool rotates back after 3 months", async () => {
  const u = await signup();
  await solved(u.id, easy[0], "backend");
  // e1 is in Database too: still assigned there, and the Backend solve does not count in Database.
  const database = await path(u.cookie, "database");
  assert.deepEqual([database.nextProblem.slug, database.solvesOnStage], ["e1", 0]);

  // Database has e1 and e2. Both finished → nothing; one finished 4 months ago → it comes back.
  await solved(u.id, easy[0], "database", GOOD, 1);
  await solved(u.id, easy[1], "database", GOOD, 1);
  assert.equal((await path(u.cookie, "database")).nextProblem, null);
  await pool.query("UPDATE user_problem_attempts SET solved_at = now() - interval '4 months' WHERE user_id = $1 AND career_path = 'database' AND problem_id = $2", [u.id, easy[1]]);
  assert.equal((await path(u.cookie, "database")).nextProblem.slug, "e2");
  const res = await start(u.cookie, "e2", "database");
  assert.equal(res.status, 200, "a rotated problem starts as a new attempt");
  const { count } = await one("SELECT count(*)::int FROM user_problem_attempts WHERE user_id = $1 AND problem_id = $2", [u.id, easy[1]]);
  assert.equal(count, 2);
});

test("a real solve on a path counts on the path; a rotated re-solve gives points again", { skip }, async () => {
  const u = await signup();
  const { id: pid } = await one("SELECT id FROM problems WHERE slug = 'payment-retries-disappear'");
  await pool.query("INSERT INTO problem_career_paths (problem_id, role) VALUES ($1, 'fullstack')", [pid]);
  await pool.query("INSERT INTO career_path_progress (user_id, role, current_stage) VALUES ($1, 'fullstack', 'medium')", [u.id]);
  const cb = await one("SELECT files, solution_files FROM problem_codebase WHERE problem_id = $1", [pid]);
  const solveOnce = async () => {
    const { attempt } = await (await start(u.cookie, "payment-retries-disappear", "fullstack")).json();
    const res = await request("POST", `/attempts/${attempt.id}/test`, u.cookie, { files: { ...cb.files, ...cb.solution_files } });
    return JSON.parse((await res.text()).trim().split("\n").at(-1)).solved;
  };
  const first = await solveOnce();
  assert.ok(first.pointsEarned > 0);
  const fullstack = await path(u.cookie, "fullstack");
  assert.deepEqual([fullstack.stage, fullstack.solvesOnStage, fullstack.nextProblem], ["medium", 1, null]);

  await pool.query("UPDATE user_problem_attempts SET solved_at = now() - interval '4 months' WHERE user_id = $1", [u.id]);
  const second = await solveOnce();
  assert.ok(second.pointsEarned > 0);
  const { total_points } = await one("SELECT total_points FROM user_stats WHERE user_id = $1", [u.id]);
  assert.equal(total_points, first.pointsEarned + second.pointsEarned);
});
