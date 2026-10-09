import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
const dashboard = async (cookie) => (await fetch(`${base}/dashboard`, { headers: cookie ? { Cookie: cookie } : {} })).json();

let alice, ids;
before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems CASCADE");
  const insert = (slug, published, rating) =>
    pool.query(
      `INSERT INTO problems (slug, title, short_description, codebase_context, incident_report, difficulty, category_id, base_points,
         time_limit_minutes, is_published, average_rating)
       SELECT $1, $1, 'short', 'context', 'incident', 'medium', id, 250, 40, $2, $3
       FROM problem_categories WHERE slug = 'backend' RETURNING id`,
      [slug, published, rating],
    );
  ids = {};
  for (const [slug, published, rating] of [
    ["solved-one", true, 5],
    ["open-one", true, 4],
    ["working-on", true, 3],
    ["draft", false, 5],
  ])
    ids[slug] = (await insert(slug, published, rating)).rows[0].id;
  await pool.query(
    `INSERT INTO problem_codebase (problem_id, repository_structure, files, language) VALUES ($1, '[]', '{}', 'TypeScript')`,
    [ids["working-on"]],
  );
  const checks = await pool.query(
    `INSERT INTO problem_checks (problem_id, description, check_type, check_command, check_order)
     SELECT $1, 'check ' || n, 'test', 'true', n FROM generate_series(1, 3) n RETURNING id`,
    [ids["working-on"]],
  );

  const res = await fetch(`${base}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "alice@example.com", username: "alice", password: "password1" }),
  });
  alice = { cookie: res.headers.get("set-cookie").split(";")[0], id: (await res.json()).user.id };

  await pool.query(
    `INSERT INTO user_problem_attempts (user_id, problem_id, status, solved_at, time_taken_seconds)
     VALUES ($1, $2, 'solved', now(), 300)`,
    [alice.id, ids["solved-one"]],
  );
  const attempt = await pool.query(
    `INSERT INTO user_problem_attempts (user_id, problem_id, status, started_at)
     VALUES ($1, $2, 'in_progress', now() - interval '10 minutes') RETURNING id`,
    [alice.id, ids["working-on"]],
  );
  const [c1, c2, c3] = checks.rows.map((r) => r.id);
  // A run from an earlier try (before started_at) does not count; of the current try only the newest run per check.
  await pool.query(
    `INSERT INTO check_results (attempt_id, check_id, passed, executed_at) VALUES
       ($1, $2, true, now() - interval '20 minutes'),
       ($1, $3, true, now() - interval '20 minutes'),
       ($1, $2, true, now() - interval '5 minutes'),
       ($1, $3, true, now() - interval '5 minutes'),
       ($1, $4, false, now() - interval '5 minutes'),
       ($1, $3, false, now() - interval '1 minute')`,
    [attempt.rows[0].id, c1, c2, c3],
  );
});
after(async () => {
  server.close();
  await pool.end();
});

test("the feed never has solved or unpublished problems, for users and guests", async () => {
  const mine = await dashboard(alice.cookie);
  assert.deepEqual(
    mine.feed.map((p) => p.slug),
    ["open-one", "working-on"],
  );
  const guest = await dashboard();
  assert.deepEqual(
    guest.feed.map((p) => p.slug),
    ["solved-one", "open-one", "working-on"],
  );
  assert.ok(guest.feed.every((p) => p.status === null && p.saved === false));
});

test("guests get no personal data", async () => {
  const guest = await dashboard();
  assert.deepEqual({ ...guest, feed: undefined }, { feed: undefined, inProgress: null, stats: null, activity: [], recentWins: [] });
});

test("signed in: stats, recent wins and the attempt in progress with the last run's checks", async () => {
  const d = await dashboard(alice.cookie);
  assert.equal(d.stats.problemsSolved, 1);
  assert.equal(d.stats.level.name, "Intern");
  assert.deepEqual(
    d.recentWins.map((w) => [w.problemSlug, w.timeTakenSeconds]),
    [["solved-one", 300]],
  );
  assert.equal(d.inProgress.problemSlug, "working-on");
  assert.equal(d.inProgress.language, "TypeScript");
  assert.equal(d.inProgress.checksTotal, 3);
  assert.equal(d.inProgress.checksPassed, 1);
  assert.ok(Date.now() - Date.parse(d.inProgress.startedAt) >= 10 * 60_000 - 5_000);
});

test("no attempt in progress → null", async () => {
  await pool.query("UPDATE user_problem_attempts SET status = 'abandoned' WHERE problem_id = $1", [ids["working-on"]]);
  assert.equal((await dashboard(alice.cookie)).inProgress, null);
});
