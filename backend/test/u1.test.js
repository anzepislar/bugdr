import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
const call = (method, path, cookie, body) =>
  fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }) },
    body: body && JSON.stringify(body),
  });
const profile = async (username, cookie) => (await (await call("GET", `/users/${username}`, cookie)).json()).profile;

async function signup(username) {
  const res = await call("POST", "/auth/signup", null, { email: `${username}@example.com`, username, password: "password1" });
  return { cookie: res.headers.get("set-cookie").split(";")[0], id: (await res.json()).user.id };
}

const SETTINGS = {
  displayName: "  Alice Smith ",
  headline: "Backend engineer",
  githubUsername: "alice-dev",
  goalRole: "backend",
  experienceLevel: "mid",
  languages: ["Go", "SQL", "Go"],
  isPublic: true,
};

let alice, bob;
before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems CASCADE");
  const insert = (slug, difficulty, points) =>
    pool.query(
      `INSERT INTO problems (slug, title, short_description, codebase_context, incident_report, difficulty, category_id, base_points,
         time_limit_minutes, is_published)
       SELECT $1, $1, 'short', 'context', 'incident', $2, id, $3, 40, true
       FROM problem_categories WHERE slug = 'backend' RETURNING id`,
      [slug, difficulty, points],
    );
  const [p1, p2, p3] = await Promise.all([insert("one", "easy", 100), insert("two", "medium", 250), insert("three", "hard", 500)]);
  [alice, bob] = await Promise.all([signup("alice"), signup("bob")]);
  const attempt = (problem, status, solvedAt) =>
    pool.query(
      `INSERT INTO user_problem_attempts (user_id, problem_id, status, solved_at, time_taken_seconds) VALUES ($1, $2, $3, $4, 600)`,
      [alice.id, problem.rows[0].id, status, solvedAt],
    );
  await attempt(p1, "solved", "2026-10-01T10:00:00Z");
  await attempt(p2, "solved", "2026-10-05T10:00:00Z");
  await attempt(p3, "in_progress", null);
  await pool.query(`UPDATE user_stats SET total_points = 1600, current_streak = 2, longest_streak = 5,
       last_activity_date = (now() AT TIME ZONE 'UTC')::date WHERE user_id = $1`, [alice.id]);
});
after(async () => {
  server.close();
  await pool.end();
});

test("unknown and banned users are 404", async () => {
  assert.equal((await call("GET", "/users/nobody")).status, 404);
  const carol = await signup("carol");
  await pool.query("UPDATE users SET is_banned = true WHERE id = $1", [carol.id]);
  assert.equal((await call("GET", "/users/carol", alice.cookie)).status, 404);
});

test("profile: stats and solved list match the attempts, level from points, no e-mail", async () => {
  const p = await profile("ALICE", bob.cookie);
  assert.equal(p.username, "alice");
  assert.equal(p.displayName, "alice");
  assert.equal(p.own, false);
  assert.equal(p.stats.problemsSolved, 2);
  assert.equal(p.stats.totalPoints, 1600);
  assert.equal(p.stats.currentStreak, 2);
  assert.equal(p.stats.longestStreak, 5);
  assert.equal(p.stats.level.name, "Mid");
  assert.equal(p.stats.nextLevel.name, "Senior");
  assert.deepEqual(
    p.solved.map((s) => [s.problemSlug, s.difficulty, s.timeTakenSeconds]),
    [
      ["two", "medium", 600],
      ["one", "easy", 600],
    ],
  );
  assert.equal(p.solved[0].solvedAt, "2026-10-05T10:00:00.000Z");
  assert.ok(!JSON.stringify(p).includes("@example.com"));
  assert.equal((await profile("alice", alice.cookie)).own, true);
  assert.equal((await profile("alice")).own, false);
});

test("settings: GET defaults, PUT saves and the profile shows it", async () => {
  const before = await (await call("GET", "/me/profile", alice.cookie)).json();
  assert.equal(before.username, "alice");
  assert.equal(before.settings.displayName, "alice");
  assert.equal(before.settings.isPublic, true);

  assert.equal((await call("PUT", "/me/profile", alice.cookie, SETTINGS)).status, 204);
  const after = await (await call("GET", "/me/profile", alice.cookie)).json();
  assert.deepEqual(after.settings, { ...SETTINGS, displayName: "Alice Smith", languages: ["Go", "SQL"] });

  const p = await profile("alice", bob.cookie);
  assert.equal(p.displayName, "Alice Smith");
  assert.equal(p.headline, "Backend engineer");
  assert.deepEqual(p.languages, ["Go", "SQL"]);

  // Optional fields can be cleared; "Exploring my path" = goalRole null (D41).
  const cleared = { ...SETTINGS, headline: "", githubUsername: "", goalRole: null };
  assert.equal((await call("PUT", "/me/profile", alice.cookie, cleared)).status, 204);
  const s = (await (await call("GET", "/me/profile", alice.cookie)).json()).settings;
  assert.equal(s.headline, "");
  assert.equal(s.githubUsername, "");
  assert.equal(s.goalRole, null);
});

test("settings: guest 401, invalid fields 400", async () => {
  assert.equal((await call("GET", "/me/profile")).status, 401);
  assert.equal((await call("PUT", "/me/profile", null, SETTINGS)).status, 401);
  for (const bad of [
    { displayName: "   " },
    { displayName: "x".repeat(51) },
    { headline: "x".repeat(81) },
    { githubUsername: "-alice" },
    { githubUsername: "a--b" },
    { githubUsername: "a".repeat(40) },
    { goalRole: "chef" },
    { experienceLevel: undefined },
    { languages: ["COBOL"] },
    { isPublic: "yes" },
  ]) {
    const res = await call("PUT", "/me/profile", alice.cookie, { ...SETTINGS, ...bad });
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
});

test("a private profile shows others only the username; the owner still sees everything", async () => {
  await call("PUT", "/me/profile", alice.cookie, { ...SETTINGS, isPublic: false });
  for (const cookie of [null, bob.cookie])
    assert.deepEqual(await profile("alice", cookie), { username: "alice", displayName: "alice", isPublic: false, own: false });
  const mine = await profile("alice", alice.cookie);
  assert.equal(mine.displayName, "Alice Smith");
  assert.equal(mine.stats.problemsSolved, 2);
});

test("comment authors show the display name", async () => {
  await pool.query(
    `INSERT INTO problem_comments (problem_id, user_id, content) SELECT id, $1, 'hi' FROM problems WHERE slug = 'one'`,
    [alice.id],
  );
  const { comments } = await (await call("GET", "/problems/one/comments", alice.cookie)).json();
  assert.equal(comments[0].author.displayName, "Alice Smith");
});
