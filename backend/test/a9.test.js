import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { hashPassword } from "../src/modules/auth/auth.service.js";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
let admin;
const stats = async (range, cookie = admin) => {
  const res = await fetch(`${base}/admin/stats${range ? `?range=${range}` : ""}`, { headers: cookie ? { Cookie: cookie } : {} });
  return res.ok ? res.json() : res.status;
};
const NOW = "(now() AT TIME ZONE 'UTC')";

before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems, contests CASCADE");
  const cat = async (slug) => (await pool.query("SELECT id FROM problem_categories WHERE slug = $1", [slug])).rows[0].id;
  const problems = (
    await pool.query(
      `INSERT INTO problems (slug, title, short_description, codebase_context, incident_report, difficulty, base_points,
         time_limit_minutes, category_id, is_published)
       VALUES ('p-easy', 'Easy', 's', 'c', 'i', 'easy', 100, 15, $1, TRUE),
              ('p-hard', 'Hard', 's', 'c', 'i', 'hard', 500, 60, $2, TRUE),
              ('p-draft', 'Draft', 's', 'c', 'i', 'easy', 100, 15, $1, FALSE)
       RETURNING id, slug`,
      [await cat("backend"), await cat("frontend")],
    )
  ).rows;
  const pid = (slug) => problems.find((p) => p.slug === slug).id;

  // u1 joined today, u2 3 days ago, u3 40 days ago.
  const user = async (name, joinedDaysAgo, streak, lastActiveDaysAgo) => {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, username, created_at)
       VALUES ($1, 'x', $2, ${NOW} - $3 * interval '1 day') RETURNING id`,
      [`${name}@example.com`, name, joinedDaysAgo],
    );
    await pool.query(
      `INSERT INTO user_stats (user_id, current_streak, last_activity_date) VALUES ($1, $2, ${NOW}::date - $3::int)`,
      [rows[0].id, streak, lastActiveDaysAgo],
    );
    return rows[0].id;
  };
  const u1 = await user("u1", 0, 1, 0);
  const u2 = await user("u2", 3, 5, 1);
  const u3 = await user("u3", 40, 40, 3); // streak broken: no activity yesterday or today

  const attempt = (u, slug, solvedDaysAgo) =>
    pool.query(
      `INSERT INTO user_problem_attempts (user_id, problem_id, status, solved_at)
       VALUES ($1, $2, $3, ${NOW} - $4 * interval '1 day')`,
      [u, pid(slug), solvedDaysAgo === null ? "in_progress" : "solved", solvedDaysAgo],
    );
  await attempt(u1, "p-easy", 0);
  await attempt(u2, "p-easy", 10);
  await attempt(u3, "p-hard", 2);
  await attempt(u2, "p-hard", null);
  await attempt(u3, "p-easy", null);

  const opened = (u, daysAgo) =>
    pool.query(
      `INSERT INTO user_daily_activity (user_id, activity_date, problems_opened) VALUES ($1, ${NOW}::date - $2::int, 1)`,
      [u, daysAgo],
    );
  await opened(u1, 0);
  await opened(u2, 0);
  await opened(u2, 8);
  await opened(u3, 5);

  await pool.query(
    `INSERT INTO contests (title, type, starts_at, ends_at) VALUES
       ('Live', 'daily', ${NOW} - interval '1 hour', ${NOW} + interval '1 hour'),
       ('Over', 'daily', ${NOW} - interval '3 days', ${NOW} - interval '2 days')`,
  );

  config.adminEmail = "admin@bugdr.app";
  config.adminPasswordHash = await hashPassword("admin password 1");
  const res = await fetch(`${base}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@bugdr.app", password: "admin password 1" }),
  });
  admin = res.headers.get("set-cookie").split(";")[0];
});
after(async () => {
  server.close();
  await pool.end();
});

test("stats need the admin session and a known range", async () => {
  assert.equal(await stats("7d", null), 401);
  assert.equal(await stats("1y"), 400);
});

test("ranged counts and trends follow D46 (UTC days, previous period of the same length)", async () => {
  const pick = (s) => [s.activeUsers, s.solves];
  assert.deepEqual(pick(await stats("today")), [{ value: 2, trendPct: null }, { value: 1, trendPct: null }]);
  // 7d: active u1, u2, u3 vs. u2 the week before (+200 %); solves 2 vs. 1 (+100 %).
  assert.deepEqual(pick(await stats("7d")), [{ value: 3, trendPct: 200 }, { value: 2, trendPct: 100 }]);
  assert.deepEqual(pick(await stats()), pick(await stats("7d"))); // default range
  assert.deepEqual(pick(await stats("30d")), [{ value: 3, trendPct: null }, { value: 3, trendPct: null }]);
  assert.deepEqual(pick(await stats("all")), [{ value: 3, trendPct: null }, { value: 3, trendPct: null }]);
});

test("totals, fixed-window charts and breakdowns", async () => {
  const s = await stats("all");
  assert.equal(s.totalUsers, 3);
  assert.equal(s.problemsPublished, 2);
  assert.equal(s.activeContests, 1);

  assert.equal(s.userGrowth.length, 30);
  assert.deepEqual(s.userGrowth.at(-1), { date: new Date().toISOString().slice(0, 10), signups: 1, dau: 2 });
  assert.equal(s.userGrowth.at(-4).signups, 1);
  assert.equal(s.userGrowth.reduce((n, d) => n + d.signups, 0), 2); // u3 joined before the window

  assert.equal(s.solvesPerDay.length, 14);
  assert.deepEqual([s.solvesPerDay.at(-1).solves, s.solvesPerDay.at(-3).solves, s.solvesPerDay.at(-11).solves], [1, 1, 1]);

  assert.deepEqual(s.solvesByDifficulty, { easy: 2, medium: 0, hard: 1, get_a_job: 0 });
  assert.equal(s.solvesByRole.length, 5); // every role, also without solves
  assert.deepEqual(s.solvesByRole.slice(0, 2), [{ categorySlug: "backend", solves: 2 }, { categorySlug: "frontend", solves: 1 }]);
  assert.deepEqual(s.streaks, [
    { range: "1d", users: 1 },
    { range: "2-7d", users: 1 },
    { range: "8-30d", users: 0 },
    { range: "31-90d", users: 0 },
    { range: "90d+", users: 0 },
  ]);
  assert.deepEqual(s.topProblems, [
    { slug: "p-easy", title: "Easy", difficulty: "easy", solves: 2 },
    { slug: "p-hard", title: "Hard", difficulty: "hard", solves: 1 },
  ]);
  assert.deepEqual(s.dropOff, [
    { slug: "p-hard", title: "Hard", started: 2, solved: 1 },
    { slug: "p-easy", title: "Easy", started: 3, solved: 2 },
  ]);
});
