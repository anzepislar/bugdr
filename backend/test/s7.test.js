import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { pool } from "../src/db.js";
import { migrate, seed } from "../src/migrate.js";
import { chat } from "../src/modules/ai/chat.service.js";
import { BENCHMARKS, efficiencyScore, MIN_BENCHMARK_SOLVES, pickBenchmark } from "../src/modules/scoring/scoring.js";

// S7: per-problem benchmarks. Solving runs the real checks of payment-retries-disappear (Medium) in Docker.
const skip = spawnSync("docker", ["info"]).status !== 0 && "Docker is not running";

test("pickBenchmark: the difficulty's constants until enough solves, then the problem's averages (floored at 1)", () => {
  const row = { solve_count: MIN_BENCHMARK_SOLVES, avg_prompts: "3.5", avg_tokens: "4200.25", avg_iterations: "0.2" };
  assert.deepEqual(pickBenchmark(undefined, "hard"), { ...BENCHMARKS.hard, source: "difficulty" });
  assert.deepEqual(pickBenchmark({ ...row, solve_count: MIN_BENCHMARK_SOLVES - 1 }, "hard"), {
    ...BENCHMARKS.hard,
    source: "difficulty",
  });
  assert.deepEqual(pickBenchmark(row, "hard"), { prompts: 3.5, tokens: 4200.25, iterations: 1, source: "problem" });
});

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
const request = (method, path, cookie, body) =>
  fetch(`${base}${path}`, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
const done = async (res) => (await res.text()).trim().split("\n").map((l) => JSON.parse(l)).at(-1);
async function signup(name) {
  const res = await request("POST", "/auth/signup", null, { email: `${name}@example.com`, username: name, password: "password1" });
  return res.headers.get("set-cookie").split(";")[0];
}
/** Start, ask `prompts` times (2,000 tokens each), then submit the fix. Returns the attempt id. */
async function solveWith(cookie, prompts, files) {
  const { attempt } = await (await request("POST", "/problems/payment-retries-disappear/start", cookie)).json();
  for (let i = 0; i < prompts; i++) await request("POST", `/attempts/${attempt.id}/ai/messages`, cookie, { text: "help", files: {} });
  await done(await request("POST", `/attempts/${attempt.id}/test`, cookie, { files }));
  return attempt.id;
}
const benchmark = () =>
  one(
    `SELECT b.* FROM problem_benchmarks b JOIN problems p ON p.id = b.problem_id WHERE p.slug = 'payment-retries-disappear'`,
  );
const near = (actual, expected, label) => assert.ok(Math.abs(Number(actual) - expected) < 1e-3, `${label}: ${actual} vs ${expected}`);

const realComplete = chat.complete;
const saved = { ...config };
let solution;
before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems CASCADE");
  await seed();
  const cb = await one(
    `SELECT cb.files, cb.solution_files FROM problem_codebase cb JOIN problems p ON p.id = cb.problem_id
     WHERE p.slug = 'payment-retries-disappear'`,
  );
  solution = { ...cb.files, ...cb.solution_files };
  Object.assign(config, { aiProvider: "anthropic", anthropicApiKey: "sk-test", aiFreeDailyTokens: 1e9 });
  chat.complete = async () => ({ text: "ok", model: "claude-haiku-4-5", promptTokens: 1500, responseTokens: 500 });
});
after(async () => {
  chat.complete = realComplete;
  Object.assign(config, saved);
  server.close();
  await pool.end();
});

test("a problem without solves has no benchmark row", async () => {
  assert.equal(await benchmark(), undefined);
});

test("after 3 solves the averages equal the hand-computed ones; a double Submit counts once", { skip }, async () => {
  const users = [await signup("ann"), await signup("ben"), await signup("cat")];
  const ids = [];
  ids.push(await solveWith(users[0], 0, solution));
  ids.push(await solveWith(users[1], 2, solution));
  // Third: two Submits at once - only one solve.
  const { attempt } = await (await request("POST", "/problems/payment-retries-disappear/start", users[2])).json();
  for (let i = 0; i < 4; i++) await request("POST", `/attempts/${attempt.id}/ai/messages`, users[2], { text: "help", files: {} });
  await Promise.all([1, 2].map(async () => done(await request("POST", `/attempts/${attempt.id}/test`, users[2], { files: solution }))));
  ids.push(attempt.id);

  const { rows } = await pool.query(
    `SELECT s.total_prompts, s.total_tokens_used, s.total_ai_iterations, s.efficiency_score::float AS score,
       s.tests_passed_on_first_run, a.time_taken_seconds
     FROM solve_sessions s JOIN user_problem_attempts a ON a.id = s.attempt_id WHERE a.id = ANY($1)`,
    [ids],
  );
  const avg = (f) => rows.reduce((sum, r) => sum + f(r), 0) / rows.length;
  const b = await benchmark();
  assert.equal(b.solve_count, 3);
  near(b.avg_prompts, avg((r) => r.total_prompts), "prompts"); // (0 + 2 + 4) / 3
  near(b.avg_prompts, 2, "prompts");
  near(b.avg_tokens, avg((r) => r.total_tokens_used), "tokens");
  near(b.avg_iterations, avg((r) => r.total_ai_iterations), "iterations");
  near(b.avg_time_seconds, avg((r) => r.time_taken_seconds), "time");
  near(b.avg_efficiency_score, avg((r) => r.score), "score");
  near(b.avg_first_run_pass_rate, avg((r) => (r.tests_passed_on_first_run ? 1 : 0)), "first run");
  // Under the minimum the difficulty's constants still score the solves.
  assert.equal(
    rows.find((r) => r.total_prompts === 2).score,
    efficiencyScore({ prompts: 2, tokens: 4000, iterations: 1, passedFirstRun: true }, BENCHMARKS.medium),
  );
});

test("with enough solves the problem's averages score the next solve, and the chat shows them", { skip }, async () => {
  await pool.query(
    `UPDATE problem_benchmarks SET solve_count = $1, avg_prompts = 1, avg_tokens = 1000, avg_iterations = 1
     WHERE problem_id = (SELECT id FROM problems WHERE slug = 'payment-retries-disappear')`,
    [MIN_BENCHMARK_SOLVES],
  );
  const cookie = await signup("dan");
  const { attempt } = await (await request("POST", "/problems/payment-retries-disappear/start", cookie)).json();
  for (let i = 0; i < 2; i++) await request("POST", `/attempts/${attempt.id}/ai/messages`, cookie, { text: "help", files: {} });
  const chatView = await (await request("GET", `/attempts/${attempt.id}/ai/messages`, cookie)).json();
  assert.deepEqual(chatView.efficiency.benchmark, { prompts: 1, tokens: 1000, iterations: 1, source: "problem" });

  const result = await done(await request("POST", `/attempts/${attempt.id}/test`, cookie, { files: solution }));
  const expected = efficiencyScore({ prompts: 2, tokens: 4000, iterations: 1, passedFirstRun: true }, { prompts: 1, tokens: 1000, iterations: 1 });
  assert.equal(result.solved.efficiencyScore, expected);
  assert.equal((await benchmark()).solve_count, MIN_BENCHMARK_SOLVES + 1);
});

test("the migration's starting values match the incremental averages", { skip }, async () => {
  // The last test set fake averages; rebuild them from the real solves first by replaying the migration's INSERT.
  const sql = (await import("node:fs")).readFileSync(new URL("../../migrations/0021_problem_benchmarks.sql", import.meta.url), "utf8");
  const insert = sql.slice(sql.indexOf("INSERT INTO problem_benchmarks"));
  const { rows } = await pool.query(
    `SELECT s.total_prompts, s.total_tokens_used, s.efficiency_score::float AS score
     FROM solve_sessions s JOIN user_problem_attempts a ON a.id = s.attempt_id WHERE a.status = 'solved'`,
  );
  await pool.query("DELETE FROM problem_benchmarks");
  await pool.query(insert);
  const b = await benchmark();
  assert.equal(b.solve_count, rows.length);
  near(b.avg_prompts, rows.reduce((s, r) => s + r.total_prompts, 0) / rows.length, "prompts");
  near(b.avg_tokens, rows.reduce((s, r) => s + r.total_tokens_used, 0) / rows.length, "tokens");
  near(b.avg_efficiency_score, rows.reduce((s, r) => s + r.score, 0) / rows.length, "score");
});
