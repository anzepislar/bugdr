import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { hashPassword } from "../src/modules/auth/auth.service.js";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
let admin, alice, bob;
const call = (method, path, cookie = admin, body) =>
  fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }) },
    body: body && JSON.stringify(body),
  });
const get = async (path) => (await call("GET", path)).json();

async function signup(name) {
  const res = await call("POST", "/auth/signup", null, { email: `${name}@example.com`, username: name, password: "password1" });
  return { cookie: res.headers.get("set-cookie").split(";")[0], id: (await res.json()).user.id };
}

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
  alice = await signup("alice");
  bob = await signup("Bobby_M");
  // alice: p1 given up once, then solved (2 tries); p2 in progress, started later.
  const attempt = async (problem, status, extra) =>
    (
      await pool.query(
        `INSERT INTO user_problem_attempts (user_id, problem_id, status, solved_at, time_taken_seconds, points_earned)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [alice.id, problem, status, ...extra],
      )
    ).rows[0].id;
  const solved = await attempt(problems[0].id, "solved", [new Date(Date.now() - 3600_000), 900, 750]);
  await pool.query(
    `INSERT INTO attempt_tries (attempt_id, try_number, started_at, ended_at, outcome, duration_seconds) VALUES
       ($1, 1, now() - interval '3 hours', now() - interval '150 minutes', 'abandoned', 300),
       ($1, 2, now() - interval '75 minutes', now() - interval '1 hour', 'solved', 600)`,
    [solved],
  );
  const open = await attempt(problems[1].id, "in_progress", [null, null, 0]);
  await pool.query("INSERT INTO attempt_tries (attempt_id, try_number, started_at) VALUES ($1, 1, now() - interval '5 minutes')", [open]);
  await pool.query("UPDATE user_stats SET total_points = 750 WHERE user_id = $1", [alice.id]);

  config.adminEmail = "admin@bugdr.app";
  config.adminPasswordHash = await hashPassword("admin password 1");
  const res = await call("POST", "/admin/login", null, { email: "admin@bugdr.app", password: "admin password 1" });
  admin = res.headers.get("set-cookie").split(";")[0];
});
after(async () => {
  server.close();
  await pool.end();
});

test("user list needs the admin session, is newest first and searches username and e-mail", async () => {
  assert.equal((await call("GET", "/admin/users", null)).status, 401);
  assert.equal((await call("GET", "/admin/users", alice.cookie)).status, 401); // a user session is not an admin one
  const { users } = await get("/admin/users");
  assert.deepEqual(users.map((u) => u.username), ["Bobby_M", "alice"]);
  assert.equal(users[1].level, "Junior");
  assert.equal(users[1].isBanned, false);
  assert.ok(users[1].joinedAt && users[1].lastActiveAt);
  assert.deepEqual((await get("/admin/users?q=bobby")).users.map((u) => u.username), ["Bobby_M"]);
  assert.deepEqual((await get("/admin/users?q=alice%40example")).users.map((u) => u.username), ["alice"]);
  assert.deepEqual((await get("/admin/users?q=_")).users.map((u) => u.username), ["Bobby_M"]); // _ is literal
});

test("user detail has the profile, stats and every attempt with its tries", async () => {
  assert.equal((await call("GET", "/admin/users/nope")).status, 404);
  const { user } = await get(`/admin/users/${alice.id}`);
  assert.equal(user.email, "alice@example.com");
  assert.equal(user.profile.onboardingCompleted, false);
  assert.equal(user.stats.totalPoints, 750);
  assert.equal(user.stats.problemsSolved, 1);
  assert.deepEqual(user.attempts.map((a) => [a.problemSlug, a.status]), [["p2", "in_progress"], ["p1", "solved"]]);
  const p1 = user.attempts[1];
  assert.equal(p1.pointsEarned, 750);
  assert.deepEqual(p1.tries.map((t) => [t.tryNumber, t.outcome, t.durationSeconds]), [[1, "abandoned", 300], [2, "solved", 600]]);
  assert.match(p1.tries[0].startedAt, /Z$/);
  assert.equal(user.attempts[0].tries[0].endedAt, null);
});

test("ban locks the user out on the next request and hides the profile; unban restores both", async () => {
  assert.equal((await call("POST", `/admin/users/${bob.id}/ban`)).status, 204);
  assert.equal((await call("GET", "/auth/me", bob.cookie)).status, 403);
  assert.equal((await call("GET", "/users/Bobby_M", alice.cookie)).status, 404);
  assert.equal((await get("/admin/users?q=bobby")).users[0].isBanned, true);

  assert.equal((await call("POST", `/admin/users/${bob.id}/unban`)).status, 204);
  assert.equal((await call("GET", "/auth/me", bob.cookie)).status, 200);
  assert.equal((await call("POST", "/admin/users/00000000-0000-4000-8000-000000000000/ban")).status, 404);
});
