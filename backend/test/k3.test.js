import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { hashPassword } from "../src/modules/auth/auth.service.js";
import { checkUnlock } from "../src/modules/careerPaths/careerPaths.routes.js";

// K3: admin thresholds (same for every path) and path metrics.
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
let admin;
const call = (method, path, body, cookie = admin) =>
  fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }) },
    body: body && JSON.stringify(body),
  });
const one = async (sql, params) => (await pool.query(sql, params)).rows[0];

const DEFAULTS = {
  easy: { solves: 5, efficiency: 1.2, prompts: 10, firstRun: 0.4, timeMultiplier: null },
  medium: { solves: 5, efficiency: 1.4, prompts: 7, firstRun: 0.5, timeMultiplier: 1.25 },
  hard: { solves: 3, efficiency: 1.6, prompts: 5, firstRun: 0.6, timeMultiplier: 1.5 },
};

let n = 0;
async function user() {
  const { id } = await one(
    "INSERT INTO users (email, username, password_hash) VALUES ($1, $1, 'x') RETURNING id",
    [`k3user${++n}`],
  );
  return id;
}
const progress = (userId, role, stage, startedDaysAgo = 0) =>
  pool.query(
    `INSERT INTO career_path_progress (user_id, role, current_stage, started_at)
     VALUES ($1, $2, $3, now() - make_interval(days => $4))`,
    [userId, role, stage, startedDaysAgo],
  );
let easyId;
/** A solved Easy attempt on the path, `daysAgo` days ago. */
async function solved(userId, role, daysAgo, prompts = 3) {
  const a = await one(
    `INSERT INTO user_problem_attempts (user_id, problem_id, career_path, status, started_at, solved_at, time_bonus_multiplier)
     VALUES ($1, $2, $3, 'solved', now() - make_interval(days => $4), now() - make_interval(days => $4), 2) RETURNING id`,
    [userId, easyId, role, daysAgo],
  );
  await pool.query(
    "INSERT INTO solve_sessions (attempt_id, efficiency_score, total_prompts, tests_passed_on_first_run) VALUES ($1, 1.5, $2, TRUE)",
    [a.id, prompts],
  );
}

before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems CASCADE");
  config.adminEmail = "admin@bugdr.app";
  config.adminPasswordHash = await hashPassword("admin password 1");
  const res = await call("POST", "/admin/login", { email: "admin@bugdr.app", password: "admin password 1" }, null);
  admin = res.headers.get("set-cookie").split(";")[0];
  ({ id: easyId } = await one(
    `INSERT INTO problems (slug, title, short_description, codebase_context, incident_report, difficulty, base_points,
       time_limit_minutes, category_id, is_published)
     SELECT 'e', 'e', 's', 'c', 'i', 'easy', 100, 15, id, TRUE FROM problem_categories WHERE slug = 'backend' RETURNING id`,
  ));
});
after(async () => {
  await call("PUT", "/admin/career-paths/thresholds", DEFAULTS);
  server.close();
  await pool.end();
});

test("admin only; the seeded thresholds are the user's values", async () => {
  assert.equal((await call("GET", "/admin/career-paths", null, null)).status, 401);
  const data = await (await call("GET", "/admin/career-paths")).json();
  assert.deepEqual(data.thresholds, DEFAULTS);
});

test("metrics: engineers per path, stage distribution, pass rate, stuck and what blocks them", async () => {
  const [a, b, c, d] = [await user(), await user(), await user(), await user()];
  // a: Backend Easy, started 40 days ago, 2 solves 35+ days ago with too many prompts → stuck, misses solves + prompts.
  await progress(a, "backend", "easy", 40);
  await solved(a, "backend", 36, 20);
  await solved(a, "backend", 35, 20);
  // a also on Database at Medium, solved 1 day ago → not stuck.
  await progress(a, "database", "medium", 40);
  await solved(a, "database", 1);
  // b: Backend Medium, started today → not stuck. c: Backend Get a job, idle for long → never stuck.
  await progress(b, "backend", "medium");
  await progress(c, "backend", "get_a_job", 90);
  // d: Backend Easy, started 31 days ago, no solve → stuck, misses solves and every average.
  await progress(d, "backend", "easy", 31);

  const data = await (await call("GET", "/admin/career-paths")).json();
  assert.deepEqual(data.totals, { engineers: 4, reachedGetAJob: 1, stuck: 2 });
  const backend = data.paths.find((p) => p.role === "backend");
  assert.deepEqual(backend, { role: "backend", engineers: 4, stages: { easy: 2, medium: 1, hard: 0, get_a_job: 1 } });
  assert.equal(data.paths.find((p) => p.role === "frontend").engineers, 0);

  // 5 rows reached Easy, 3 passed it (b, c, a on Database); Medium: 3 reached, 1 passed (c); Hard: 1 reached, 1 passed.
  assert.deepEqual(
    data.stages.map((s) => [s.stage, s.reached, s.passed, s.passRate, s.stuck]),
    [
      ["easy", 5, 3, 0.6, 2],
      ["medium", 3, 1, 1 / 3, 0],
      ["hard", 1, 1, 1, 0],
    ],
  );
  assert.deepEqual(data.stages[0].blockers, [
    { key: "solves", count: 2 },
    { key: "prompts", count: 2 },
    { key: "efficiency", count: 1 },
    { key: "firstRun", count: 1 },
  ]);
});

test("PUT validates every field; null time = no time rule", async () => {
  const bad = structuredClone(DEFAULTS);
  bad.easy.solves = 2.5;
  bad.medium.firstRun = 1.5;
  bad.hard.timeMultiplier = null; // allowed
  delete bad.hard.prompts;
  const res = await call("PUT", "/admin/career-paths/thresholds", bad);
  assert.equal(res.status, 400);
  assert.deepEqual(Object.keys((await res.json()).error.details).sort(), ["easy.solves", "hard.prompts", "medium.firstRun"]);
  assert.equal((await call("PUT", "/admin/career-paths/thresholds", DEFAULTS, null)).status, 401);
});

test("a saved change applies from the next solve: 2 solves can unlock Easy after lowering it", async () => {
  const u = await user();
  await progress(u, "fullstack", "easy");
  await solved(u, "fullstack", 1);
  await solved(u, "fullstack", 0);
  const lower = { ...DEFAULTS, easy: { ...DEFAULTS.easy, solves: 2, timeMultiplier: 1.5 } };
  const res = await call("PUT", "/admin/career-paths/thresholds", lower);
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).thresholds.easy, lower.easy);

  const client = await pool.connect();
  await checkUnlock(client, u, "fullstack");
  client.release();
  const { current_stage } = await one("SELECT current_stage FROM career_path_progress WHERE user_id = $1 AND role = 'fullstack'", [u]);
  assert.equal(current_stage, "medium");
});
