import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
const profile = async () => (await (await fetch(`${base}/users/alice`)).json()).profile;

let alice;
before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems CASCADE");
  const res = await fetch(`${base}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "alice@example.com", username: "alice", password: "password1" }),
  });
  alice = (await res.json()).user.id;
});
after(async () => {
  server.close();
  await pool.end();
});

// `days` before today (UTC); a negative value is a day in the future.
const setLastActivity = (days, streak = 4, longest = 7) =>
  pool.query(
    `UPDATE user_stats SET current_streak = $2, longest_streak = $3,
       last_activity_date = (now() AT TIME ZONE 'UTC')::date - $4::int WHERE user_id = $1`,
    [alice, streak, longest, days],
  );

test("streak on read: today or yesterday keeps it, an older day shows 0; the longest streak never drops", async () => {
  for (const [days, expected] of [
    [0, 4],
    [1, 4],
    [2, 0],
    [30, 0],
  ]) {
    await setLastActivity(days);
    const { stats } = await profile();
    assert.equal(stats.currentStreak, expected, `last activity ${days} days ago`);
    assert.equal(stats.longestStreak, 7);
  }
  // Read-only: the stored streak is untouched.
  const { rows } = await pool.query("SELECT current_streak FROM user_stats WHERE user_id = $1", [alice]);
  assert.equal(rows[0].current_streak, 4);
});

test("activity: from the Monday 52 weeks ago, as UTC dates, oldest first", async () => {
  // Monday of this week, UTC, minus 52 weeks = the first day of the grid.
  const { rows } = await pool.query(
    "SELECT to_char(date_trunc('week', now() AT TIME ZONE 'UTC')::date - 364, 'YYYY-MM-DD') AS first",
  );
  const first = rows[0].first;
  assert.equal(new Date(`${first}T00:00:00Z`).getUTCDay(), 1);
  await pool.query(
    `INSERT INTO user_daily_activity (user_id, activity_date, problems_opened, problems_solved) VALUES
       ($1, $2::date - 1, 9, 9),
       ($1, $2::date, 1, 0),
       ($1, (now() AT TIME ZONE 'UTC')::date, 3, 2)`,
    [alice, first],
  );
  const today = new Date().toISOString().slice(0, 10);
  assert.deepEqual((await profile()).activity, [
    { date: first, problemsOpened: 1, problemsSolved: 0 },
    { date: today, problemsOpened: 3, problemsSolved: 2 },
  ]);
});
