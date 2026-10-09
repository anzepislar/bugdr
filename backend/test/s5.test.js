import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { hashPassword } from "../src/modules/auth/auth.service.js";
import { BENCHMARKS } from "../src/modules/scoring/scoring.js";

// S5: admin AI analytics.
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
let admin, user, ids;
const get = (path, cookie = admin) => fetch(`${base}/admin/analytics${path}`, { headers: cookie ? { Cookie: cookie } : {} });
const saved = { ...config };

before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems, contests CASCADE");
  const cat = (await pool.query("SELECT id FROM problem_categories WHERE slug = 'backend'")).rows[0].id;
  const problems = (
    await pool.query(
      `INSERT INTO problems (slug, title, short_description, codebase_context, incident_report, difficulty, base_points,
         time_limit_minutes, category_id, is_published)
       VALUES ('p-easy', 'Easy one', 's', 'c', 'i', 'easy', 100, 15, $1, TRUE),
              ('p-hard', 'Hard one', 's', 'c', 'i', 'hard', 500, 60, $1, TRUE),
              ('p-draft', 'Draft', 's', 'c', 'i', 'easy', 100, 15, $1, FALSE)
       RETURNING id, slug`,
      [cat],
    )
  ).rows;
  ids = Object.fromEntries(problems.map((p) => [p.slug, p.id]));

  /** A solve with a session; score null = solved before the AI score (left out). Returns the session id. */
  const solve = async (name, slug, { prompts, tokens, score, firstRun, weeksAgo = 0 }) => {
    const u = (
      await pool.query("INSERT INTO users (email, password_hash, username) VALUES ($1, 'x', $2) RETURNING id", [
        `${name}-${slug}@example.com`,
        `${name}-${slug}`,
      ])
    ).rows[0].id;
    const a = (
      await pool.query(
        `INSERT INTO user_problem_attempts (user_id, problem_id, status, solved_at, time_taken_seconds)
         VALUES ($1, $2, 'solved', (now() AT TIME ZONE 'UTC') - $3 * interval '1 week', 60) RETURNING id`,
        [u, ids[slug], weeksAgo],
      )
    ).rows[0].id;
    return (
      await pool.query(
        `INSERT INTO solve_sessions (attempt_id, total_prompts, total_tokens_used, efficiency_score, tests_passed_on_first_run)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [a, prompts, tokens, score, firstRun],
      )
    ).rows[0].id;
  };
  const s1 = await solve("u1", "p-easy", { prompts: 2, tokens: 1000, score: 2.0, firstRun: true });
  await solve("u2", "p-easy", { prompts: 4, tokens: 3000, score: 1.0, firstRun: false });
  const s3 = await solve("u3", "p-hard", { prompts: 9, tokens: 8000, score: 0.6, firstRun: false, weeksAgo: 3 });
  await solve("u4", "p-easy", { prompts: 50, tokens: 99999, score: null, firstRun: false }); // not scored
  const prompt = (session, i, model, source) =>
    pool.query(
      `INSERT INTO prompt_events (session_id, prompt_index, prompt_text, response_text, prompt_tokens, response_tokens,
         total_tokens, key_source, model) VALUES ($1, $2, 'q', 'a', 1, 1, 2, $3, $4)`,
      [session, i, source, model],
    );
  for (const i of [1, 2, 3]) await prompt(s1, i, "claude-haiku-4-5", "platform");
  await prompt(s3, 1, "claude-sonnet-5-5", "user");
  await pool.query(
    `INSERT INTO problem_benchmarks (problem_id, avg_prompts, avg_tokens, avg_iterations, avg_time_seconds,
       avg_efficiency_score, avg_first_run_pass_rate, solve_count) VALUES ($1, 3, 2000, 1.5, 60, 1.5, 0.5, 5)`,
    [ids["p-easy"]],
  );

  config.adminEmail = "admin@bugdr.app";
  config.adminPasswordHash = await hashPassword("admin password 1");
  const login = await fetch(`${base}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@bugdr.app", password: "admin password 1" }),
  });
  admin = login.headers.get("set-cookie").split(";")[0];
  const signup = await fetch(`${base}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "user@example.com", username: "someuser", password: "password1" }),
  });
  user = signup.headers.get("set-cookie").split(";")[0];
});
after(async () => {
  Object.assign(config, saved);
  server.close();
  await pool.end();
});

test("only the admin: a guest or a user session → 401", async () => {
  assert.equal((await get("", null)).status, 401);
  assert.equal((await get("", user)).status, 401);
  assert.equal((await get(`/problems/${ids["p-easy"]}`, user)).status, 401);
});

test("platform totals, prompts by difficulty and the efficiency spread count only scored solves", async () => {
  const body = await (await get("")).json();
  assert.deepEqual(body.totals, { scoredSolves: 3, avgPrompts: 5, avgTokens: 4000, avgEfficiency: 1.2, firstRunPassRate: 33 });
  assert.deepEqual(body.promptsByDifficulty, [
    { difficulty: "easy", avgPrompts: 3 },
    { difficulty: "medium", avgPrompts: null },
    { difficulty: "hard", avgPrompts: 9 },
    { difficulty: "get_a_job", avgPrompts: null },
  ]);
  // 0.6 → 0.5-0.75, 1.0 → 1.0-1.25, 2.0 → the last bucket.
  assert.deepEqual(
    body.efficiencyDistribution.map((b) => b.solves),
    [1, 0, 1, 0, 0, 1],
  );
  assert.deepEqual(body.models, [
    { model: "claude-haiku-4-5", keySource: "platform", prompts: 3 },
    { model: "claude-sonnet-5-5", keySource: "user", prompts: 1 },
  ]);
});

test("efficiency by week: the last 12 UTC weeks, the current one last, empty weeks without an average", async () => {
  const { efficiencyByWeek: weeks } = await (await get("")).json();
  assert.equal(weeks.length, 12);
  assert.deepEqual(weeks.at(-1), { week: weeks.at(-1).week, avgEfficiency: 1.5, solves: 2 });
  assert.equal(weeks.at(-4).avgEfficiency, 0.6);
  assert.equal(weeks.at(-2).avgEfficiency, null);
  assert.equal(new Date(`${weeks[0].week}T00:00:00Z`).getUTCDay(), 1); // Monday
});

test("per problem: published only, the benchmark averages and which benchmark scores it now", async () => {
  const { problems } = await (await get("")).json();
  assert.deepEqual(
    problems.map((p) => p.slug),
    ["p-easy", "p-hard"],
  );
  assert.deepEqual(problems[0], {
    id: ids["p-easy"],
    slug: "p-easy",
    title: "Easy one",
    difficulty: "easy",
    solves: 5,
    avgPrompts: 3,
    avgTokens: 2000,
    avgIterations: 1.5,
    avgEfficiency: 1.5,
    firstRunPassRate: 50,
    benchmarkSource: "problem",
  });
  assert.equal(problems[1].solves, 0);
  assert.equal(problems[1].avgPrompts, null);
  assert.equal(problems[1].benchmarkSource, "difficulty");
});

test("one problem: its models and current benchmark; unknown → 404", async () => {
  const easy = await (await get(`/problems/${ids["p-easy"]}`)).json();
  assert.deepEqual(easy.models, [{ model: "claude-haiku-4-5", keySource: "platform", prompts: 3 }]);
  assert.deepEqual(easy.benchmark, { prompts: 3, tokens: 2000, iterations: 1.5, source: "problem" });
  const hard = await (await get(`/problems/${ids["p-hard"]}`)).json();
  assert.deepEqual(hard.benchmark, { ...BENCHMARKS.hard, source: "difficulty" });
  assert.equal((await get("/problems/00000000-0000-0000-0000-000000000000")).status, 404);
  assert.equal((await get("/problems/nope")).status, 404);
});
