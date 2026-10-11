import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { config } from "../src/config.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { sendCareerPathReminders } from "../src/modules/email/careerPathReminder.js";

// Career path inactivity email: 30 days without activity on a path → one email, again only after new activity.
let sent = [];
const resend = createServer((req, res) => {
  let data = "";
  req.on("data", (c) => (data += c));
  req.on("end", () => {
    sent.push(JSON.parse(data || "{}"));
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ id: `sent-${sent.length}` }));
  });
}).listen(0);

const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
let n = 0;
async function user() {
  const { id } = await one(
    "INSERT INTO users (email, username, password_hash, plan) VALUES ($1, $1, 'x', 'pro') RETURNING id",
    [`k4user${++n}@example.com`],
  );
  return id;
}
const progress = (userId, stage, startedDaysAgo) =>
  pool.query(
    `INSERT INTO career_path_progress (user_id, role, current_stage, started_at)
     VALUES ($1, 'backend', $2, now() - make_interval(days => $3))`,
    [userId, stage, startedDaysAgo],
  );
let problemId;
const attempt = (userId, daysAgo) =>
  pool.query(
    `INSERT INTO user_problem_attempts (user_id, problem_id, career_path, started_at)
     VALUES ($1, $2, 'backend', now() - make_interval(days => $3))`,
    [userId, problemId, daysAgo],
  );

before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems CASCADE");
  config.resendApiKey = "re_test";
  config.resendApiUrl = `http://localhost:${resend.address().port}`;
  ({ id: problemId } = await one(
    `INSERT INTO problems (slug, title, short_description, codebase_context, incident_report, difficulty, base_points,
       time_limit_minutes, category_id, is_published)
     SELECT 'e', 'e', 's', 'c', 'i', 'easy', 100, 15, id, TRUE FROM problem_categories WHERE slug = 'backend' RETURNING id`,
  ));
});
after(async () => {
  resend.close();
  await pool.end();
});

test("emails a path idle for 30 days once, again only after new activity", async () => {
  const idle = await user();
  await progress(idle, "easy", 40);
  await attempt(idle, 35);
  const active = await user();
  await progress(active, "easy", 40);
  await attempt(active, 5);
  const fresh = await user();
  await progress(fresh, "medium", 10);
  const done = await user();
  await progress(done, "get_a_job", 90);
  const banned = await user();
  await progress(banned, "easy", 90);
  await pool.query("UPDATE users SET is_banned = TRUE WHERE id = $1", [banned]);
  const downgraded = await user(); // started on Pro, now Free: cannot go back to the path
  await progress(downgraded, "easy", 90);
  await pool.query("UPDATE users SET plan = 'free' WHERE id = $1", [downgraded]);

  sent = [];
  assert.equal(await sendCareerPathReminders(), 1);
  assert.deepEqual(sent.map((e) => e.to), [["k4user1@example.com"]]);
  assert.match(sent[0].subject, /Backend Engineer path is waiting/);
  assert.match(sent[0].text, /Easy stage/);
  assert.match(sent[0].text, /\/career-paths/);

  sent = [];
  assert.equal(await sendCareerPathReminders(), 0, "not twice for the same idle stretch");

  // Comes back, then goes idle again: a new stretch gets a new email.
  await pool.query("UPDATE career_path_progress SET reminder_sent_at = now() - interval '40 days' WHERE user_id = $1", [idle]);
  await pool.query("UPDATE user_problem_attempts SET started_at = now() - interval '31 days' WHERE user_id = $1", [idle]);
  assert.equal(await sendCareerPathReminders(), 1);
});

test("a failed send is retried on the next run", async () => {
  await pool.query("TRUNCATE career_path_progress");
  const u = await user();
  await progress(u, "hard", 60);
  config.resendApiUrl = "http://localhost:1";
  const log = console.error;
  console.error = () => {};
  assert.equal(await sendCareerPathReminders(), 0);
  console.error = log;
  config.resendApiUrl = `http://localhost:${resend.address().port}`;
  assert.equal(await sendCareerPathReminders(), 1);
});
