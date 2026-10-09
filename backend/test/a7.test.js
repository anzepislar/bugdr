import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { hashPassword } from "../src/modules/auth/auth.service.js";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
let admin, ended, scheduled;
const call = (method, path, body, cookie = admin) =>
  fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }) },
    body: body && JSON.stringify(body),
  });

const contest = async (starts, ends, reward = "merch") =>
  (
    await pool.query(
      `INSERT INTO contests (title, type, description, starts_at, ends_at, reward_type, reward_description)
       VALUES ('C', 'weekly', 'd', (now() AT TIME ZONE 'UTC') + $1::interval, (now() AT TIME ZONE 'UTC') + $2::interval,
         $3::text, CASE WHEN $3::text IS NOT NULL THEN 'Hoodie' END) RETURNING id`,
      [starts, ends, reward],
    )
  ).rows[0].id;

before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems, contests CASCADE");
  const { rows: cat } = await pool.query("SELECT id FROM problem_categories WHERE slug = 'backend'");
  const { rows: problems } = await pool.query(
    `INSERT INTO problems (slug, title, short_description, codebase_context, incident_report, difficulty, base_points,
       time_limit_minutes, category_id, is_published)
     VALUES ('p1', 'One', 's', 'c', 'i', 'hard', 500, 60, $1, TRUE), ('p2', 'Two', 's', 'c', 'i', 'easy', 100, 15, $1, TRUE)
     RETURNING id`,
    [cat[0].id],
  );
  ended = await contest("-3 days", "-1 day");
  scheduled = await contest("1 day", "2 days");
  await pool.query("INSERT INTO contest_problems (contest_id, problem_id) SELECT $1, unnest($2::uuid[])", [
    ended,
    problems.map((p) => p.id),
  ]);
  // name, solved, score, solve seconds per problem (solved during the contest) + one solve after it ended.
  const people = [
    ["=cmd", 1, 500, [600]],
    ["fast", 2, 600, [100, 100]],
    ["slow", 2, 600, [300, 300]],
    ["tied", 2, 600, [100, 100]],
    ["late", 0, 0, []],
  ];
  for (const [name, solved, score, times] of people) {
    const { rows } = await pool.query(
      "INSERT INTO users (email, password_hash, username) VALUES ($1, 'x', $2) RETURNING id",
      [`${name.slice(1)}${name}@example.com`, name],
    );
    await pool.query("INSERT INTO contest_entries (contest_id, user_id, problems_solved, total_score) VALUES ($1, $2, $3, $4)", [
      ended,
      rows[0].id,
      solved,
      score,
    ]);
    const solvedAt = times.length ? "-2 days" : "-1 hour"; // "late" solved p1 after the contest: not counted
    for (const [i, seconds] of (times.length ? times : [999]).entries())
      await pool.query(
        `INSERT INTO user_problem_attempts (user_id, problem_id, status, solved_at, time_taken_seconds)
         VALUES ($1, $2, 'solved', (now() AT TIME ZONE 'UTC') + $3::interval, $4)`,
        [rows[0].id, problems[i].id, solvedAt, seconds],
      );
  }
  config.adminEmail = "admin@bugdr.app";
  config.adminPasswordHash = await hashPassword("admin password 1");
  const res = await call("POST", "/admin/login", { email: "admin@bugdr.app", password: "admin password 1" }, null);
  admin = res.headers.get("set-cookie").split(";")[0];
});
after(async () => {
  server.close();
  await pool.end();
});

test("results rank by solved, then score, then total solve time; full ties share a rank (03)", async () => {
  assert.equal((await call("GET", `/admin/contests/${ended}/results`, null, null)).status, 401);
  assert.equal((await call("GET", `/admin/contests/${scheduled}/results`)).status, 409);
  const { results } = await (await call("GET", `/admin/contests/${ended}/results`)).json();
  assert.deepEqual(
    results.map((r) => [r.rank, r.username, r.solveTimeSeconds]),
    [
      [1, "fast", 200],
      [1, "tied", 200],
      [3, "slow", 600],
      [4, "=cmd", 600],
      [5, "late", 0],
    ],
  );
  assert.deepEqual(results[0], {
    rank: 1,
    username: "fast",
    email: "astfast@example.com",
    problemsSolved: 2,
    score: 600,
    solveTimeSeconds: 200,
  });
});

test("CSV export has a header row and defuses formula cells", async () => {
  const res = await call("GET", `/admin/contests/${ended}/results?format=csv`);
  assert.match(res.headers.get("content-type"), /^text\/csv/);
  assert.match(res.headers.get("content-disposition"), /attachment/);
  const lines = (await res.text()).trim().split("\r\n");
  assert.equal(lines[0], '"rank","username","email","problems_solved","score","solve_time_seconds"');
  assert.equal(lines.length, 6);
  assert.ok(lines.includes(`"4","'=cmd","cmd=cmd@example.com","1","500","600"`));
});

test("reward sent: only an ended contest with a reward; can be taken back", async () => {
  const mark = (id, sent) => call("PUT", `/admin/contests/${id}/reward-sent`, { sent });
  assert.equal((await mark(scheduled, true)).status, 409);
  assert.equal((await mark(ended, "yes")).status, 400);
  const noReward = await contest("-3 days", "-1 day", null);
  assert.equal((await mark(noReward, true)).status, 409);

  const { contest: sent } = await (await mark(ended, true)).json();
  assert.ok(sent.rewardSentAt);
  const list = (await (await call("GET", "/admin/contests")).json()).contests;
  assert.equal(list.find((c) => c.id === ended).rewardSentAt, sent.rewardSentAt);
  assert.equal((await (await mark(ended, false)).json()).contest.rewardSentAt, null);
});
