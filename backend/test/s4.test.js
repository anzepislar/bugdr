import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";

// S4 (D52): leaderboard by points, all time / this month, top 100, public.
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
const get = async (query = "", cookie) =>
  fetch(`${base}/leaderboard${query}`, { headers: cookie ? { Cookie: cookie } : {} });
const board = async (query, cookie) => (await (await get(query, cookie)).json()).entries;

/** A user with ledger rows [{ amount, at? }] (at = interval from the start of this UTC month); options isPublic, banned. */
async function user(name, rows, { isPublic = true, banned = false } = {}) {
  const { rows: u } = await pool.query(
    "INSERT INTO users (email, password_hash, username, is_banned) VALUES ($1, 'x', $2, $3) RETURNING id",
    [`${name}@example.com`, name, banned],
  );
  const id = u[0].id;
  await pool.query("INSERT INTO user_profiles (user_id, is_public) VALUES ($1, $2)", [id, isPublic]);
  for (const r of rows)
    await pool.query(
      `INSERT INTO point_transactions (user_id, amount, reason, created_at)
       VALUES ($1, $2, 'problem_solved', date_trunc('month', now() AT TIME ZONE 'UTC') + $3::interval)`,
      [id, r.amount, r.at ?? "1 hour"],
    );
  const total = rows.reduce((s, r) => s + r.amount, 0);
  await pool.query("INSERT INTO user_stats (user_id, total_points) VALUES ($1, $2)", [id, total]);
  return id;
}

let me;
before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems CASCADE");
  await user("ana", [{ amount: 900 }, { amount: 700, at: "-40 days" }]); // all 1600 (Mid), month 900
  await user("bob", [{ amount: 1000, at: "-40 days" }]); // all 1000, month 0 → not in month
  await user("cid", [{ amount: 1000 }]); // ties with bob all time
  await user("dee", [{ amount: 5000 }], { isPublic: false }); // private → never listed
  await user("eve", [{ amount: 6000 }], { banned: true }); // banned → never listed
  await user("fay", []); // no points → not listed
  const res = await fetch(`${base}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "me@example.com", username: "zed", password: "password1" }),
  });
  me = res.headers.get("set-cookie").split(";")[0];
});
after(async () => {
  server.close();
  await pool.end();
});

test("public for guests; an unknown period → 400", async () => {
  assert.equal((await get()).status, 200);
  const res = await get("?period=week");
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, "INVALID_PERIOD");
});

test("all time: by points, ties share a rank; private, banned and pointless users are left out", async () => {
  const entries = await board();
  assert.deepEqual(
    entries.map((e) => [e.rank, e.username, e.points]),
    [
      [1, "ana", 1600],
      [2, "bob", 1000],
      [2, "cid", 1000],
    ],
  );
  assert.equal(entries[0].level, "Mid");
  assert.equal(entries[0].displayName, "ana");
  assert.equal(entries[0].problemsSolved, 0);
  assert.equal(entries[0].avgEfficiency, null);
});

test("this month counts only this UTC month's points; the level stays the overall one", async () => {
  const entries = await board("?period=month");
  assert.deepEqual(
    entries.map((e) => [e.rank, e.username, e.points, e.level]),
    [
      [1, "cid", 1000, "Junior"],
      [2, "ana", 900, "Mid"], // her 700 from last month only count all time
    ],
  );
});

test("solves and average efficiency come from the period's scored solves; `you` marks the signed-in user", async () => {
  const { rows } = await pool.query(
    `INSERT INTO problems (slug, title, short_description, codebase_context, incident_report, difficulty, category_id,
       base_points, time_limit_minutes, is_published)
     SELECT 'p' || g, 'P', 's', 'c', 'r', 'easy', (SELECT id FROM problem_categories LIMIT 1), 100, 30, true
     FROM generate_series(1, 2) g RETURNING id`,
  );
  const zed = (await pool.query("SELECT id FROM users WHERE username = 'zed'")).rows[0].id;
  for (const [i, score] of [1.5, 2].entries()) {
    const { rows: a } = await pool.query(
      `INSERT INTO user_problem_attempts (user_id, problem_id, status, solved_at, time_taken_seconds, points_earned)
       VALUES ($1, $2, 'solved', now(), 60, 100) RETURNING id`,
      [zed, rows[i].id],
    );
    await pool.query("INSERT INTO solve_sessions (attempt_id, efficiency_score) VALUES ($1, $2)", [a[0].id, score]);
  }
  await pool.query("INSERT INTO point_transactions (user_id, amount, reason) VALUES ($1, 200, 'problem_solved')", [zed]);

  const mine = (await board("", me)).find((e) => e.username === "zed");
  assert.equal(mine.you, true);
  assert.equal(mine.problemsSolved, 2);
  assert.equal(mine.avgEfficiency, 1.75);
  assert.ok((await board("", me)).filter((e) => e.you).length === 1);
  assert.ok((await board()).every((e) => e.you === false));
});

test("only the top 100 are listed", async () => {
  for (let i = 0; i < 105; i++) await user(`bulk${String(i).padStart(3, "0")}`, [{ amount: 10 + i }]);
  const entries = await board();
  assert.equal(entries.length, 100);
  assert.equal(entries[0].username, "ana");
  assert.ok(entries.every((e, i) => i === 0 || e.points <= entries[i - 1].points));
});
