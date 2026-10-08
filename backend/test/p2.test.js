import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
const get = (path, cookie) => fetch(`${base}${path}`, { headers: cookie ? { Cookie: cookie } : {} });
const detail = async (cookie) => (await (await get("/problems/leaky-worker", cookie)).json()).problem;
const stats = async () =>
  (
    await pool.query(
      `SELECT s.current_streak, s.longest_streak, s.last_activity_date = (now() AT TIME ZONE 'UTC')::date AS today,
         (SELECT sum(problems_opened)::int FROM user_daily_activity a WHERE a.user_id = s.user_id) AS opened
       FROM user_stats s WHERE s.user_id = $1`,
      [userId],
    )
  ).rows[0];

let cookie, userId, problemId;
before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems CASCADE");
  const insert = (slug, published) =>
    pool.query(
      `INSERT INTO problems (slug, title, short_description, codebase_context, incident_report, difficulty, category_id, base_points,
         time_limit_minutes, is_published, solve_count)
       SELECT $1, 'Leaky worker', 'short', 'You have joined', '[WARN] timeout', 'medium', id, 250, 40, $2, 7
       FROM problem_categories WHERE slug = 'backend' RETURNING id`,
      [slug, published],
    );
  problemId = (await insert("leaky-worker", true)).rows[0].id;
  await insert("draft-worker", false);
  await pool.query("INSERT INTO problem_tags (problem_id, tag) VALUES ($1, 'Node.js'), ($1, 'Redis')", [problemId]);
  await pool.query(
    `INSERT INTO problem_codebase (problem_id, repository_name, repository_structure, files, hidden_files, solution_files,
       language, framework)
     VALUES ($1, 'acme / worker', '["src/index.ts", "package.json"]', '{"src/index.ts": "SECRET_SOURCE"}',
       '{"tests/hidden.test.ts": "SECRET_HIDDEN"}', '{"src/index.ts": "SECRET_SOLUTION"}', 'TypeScript', 'Node 20')`,
    [problemId],
  );
  await pool.query(
    `INSERT INTO problem_checks (problem_id, check_order, description, check_type, check_command, expected_output)
     VALUES ($1, 2, 'Second check', 'test', 'SECRET_COMMAND', 'SECRET_OUTPUT'),
            ($1, 1, 'First check', 'test', 'SECRET_COMMAND', NULL)`,
    [problemId],
  );
  const res = await fetch(`${base}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "pd@example.com", username: "pdq", password: "password1" }),
  });
  cookie = res.headers.get("set-cookie").split(";")[0];
  userId = (await res.json()).user.id;
});
after(async () => {
  server.close();
  await pool.end();
});

test("unknown or unpublished slug → 404", async () => {
  for (const slug of ["nope", "draft-worker"]) {
    const res = await get(`/problems/${slug}`, cookie);
    assert.equal(res.status, 404, slug);
    assert.equal((await res.json()).error.code, "PROBLEM_NOT_FOUND");
  }
});

test("the detail has checks in order and the repository, but no code, commands or hidden files", async () => {
  const res = await get("/problems/leaky-worker");
  const body = await res.text();
  assert.doesNotMatch(body, /SECRET_/);
  const { problem } = JSON.parse(body);
  assert.deepEqual(problem.checks, ["First check", "Second check"]);
  assert.equal(problem.codebaseContext, "You have joined");
  assert.equal(problem.incidentReport, "[WARN] timeout");
  assert.deepEqual(problem.repository, {
    name: "acme / worker",
    stack: ["TypeScript", "Node 20", "Node.js", "Redis"],
    files: ["src/index.ts", "package.json"],
  });
  assert.equal(problem.solveCount, 7);
  assert.equal(problem.commentCount, 0);
  assert.equal(problem.status, null);
  assert.equal(problem.result, null);
});

test("a guest view records no activity", async () => {
  await get("/problems/leaky-worker");
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM user_daily_activity");
  assert.equal(rows[0].n, 0);
});

test("streak: two views on one day = one day, the next day extends it, a gap resets it", async () => {
  await detail(cookie);
  await detail(cookie);
  assert.deepEqual(await stats(), { current_streak: 1, longest_streak: 1, today: true, opened: 2 });

  // Pretend the last visit was yesterday, with a 4-day streak.
  await pool.query(
    `UPDATE user_stats SET current_streak = 4, longest_streak = 4,
       last_activity_date = (now() AT TIME ZONE 'UTC')::date - 1 WHERE user_id = $1`,
    [userId],
  );
  await detail(cookie);
  assert.deepEqual(await stats(), { current_streak: 5, longest_streak: 5, today: true, opened: 3 });

  // Last visit three days ago: the streak starts over, the longest one stays.
  await pool.query(
    "UPDATE user_stats SET last_activity_date = (now() AT TIME ZONE 'UTC')::date - 3 WHERE user_id = $1",
    [userId],
  );
  await detail(cookie);
  assert.deepEqual(await stats(), { current_streak: 1, longest_streak: 5, today: true, opened: 4 });
});

test("parallel views on a new day count the day once", async () => {
  await pool.query(
    "UPDATE user_stats SET current_streak = 2, last_activity_date = (now() AT TIME ZONE 'UTC')::date - 1 WHERE user_id = $1",
    [userId],
  );
  await Promise.all([detail(cookie), detail(cookie), detail(cookie)]);
  assert.equal((await stats()).current_streak, 3);
});

test("a solved attempt returns the result with the user's rating", async () => {
  await pool.query(
    `INSERT INTO user_problem_attempts (user_id, problem_id, status, solved_at, time_taken_seconds, points_earned,
       time_bonus_multiplier, lines_added, lines_deleted)
     VALUES ($1, $2, 'solved', '2026-10-06 08:12:00', 1938, 250, 1.25, 24, 11)`,
    [userId, problemId],
  );
  await pool.query("INSERT INTO problem_ratings (user_id, problem_id, rating) VALUES ($1, $2, 4)", [userId, problemId]);
  const problem = await detail(cookie);
  assert.equal(problem.status, "solved");
  assert.deepEqual(problem.result, {
    solvedAt: "2026-10-06T08:12:00.000Z",
    timeTakenSeconds: 1938,
    checksPassed: 2,
    checksTotal: 2,
    linesAdded: 24,
    linesDeleted: 11,
    pointsEarned: 250,
    timeMultiplier: 1.25,
    myRating: 4,
  });
});
