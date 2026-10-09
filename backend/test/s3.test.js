import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { pool } from "../src/db.js";
import { migrate, seed } from "../src/migrate.js";
import { chat } from "../src/modules/ai/chat.service.js";
import { BENCHMARKS, efficiencyScore, finalPoints, timeMultiplier } from "../src/modules/scoring/scoring.js";

// S3: the AI efficiency score in the points. Solving runs the real checks of payment-retries-disappear (Medium) in Docker.
const skip = spawnSync("docker", ["info"]).status !== 0 && "Docker is not running";
const medium = BENCHMARKS.medium; // 8 prompts, 3200 tokens, 3 iterations

test("the example from 03: Medium, 1.5x time, 1.8 efficiency → 675", () => {
  assert.equal(finalPoints(250, 1.5, 1.8), 675);
});

test("efficiency: no AI + first run passed → 2.0; at the benchmark → about 1; far over → 0.5", () => {
  assert.equal(efficiencyScore({ prompts: 0, tokens: 0, iterations: 0, passedFirstRun: true }, medium), 2);
  // At the benchmark every ratio is 1: 0.882 + first run (2.0 → 1.12, 0.5 → 0.94).
  assert.equal(efficiencyScore({ prompts: 8, tokens: 3200, iterations: 3, passedFirstRun: true }, medium), 1.12);
  assert.equal(efficiencyScore({ prompts: 8, tokens: 3200, iterations: 3, passedFirstRun: false }, medium), 0.94);
  assert.equal(efficiencyScore({ prompts: 80, tokens: 99999, iterations: 30, passedFirstRun: false }, medium), 0.5);
  // Half the benchmark scores 2.0 per metric, the cap.
  assert.equal(efficiencyScore({ prompts: 4, tokens: 1600, iterations: 1, passedFirstRun: true }, medium), 2);
  // Weights (D51 b): prompts weigh more than tokens.
  const fewPrompts = efficiencyScore({ prompts: 4, tokens: 6400, iterations: 3, passedFirstRun: false }, medium);
  const fewTokens = efficiencyScore({ prompts: 16, tokens: 1600, iterations: 3, passedFirstRun: false }, medium);
  assert.ok(fewPrompts > fewTokens, `${fewPrompts} > ${fewTokens}`);
});

test("efficiency is always within 0.5-2.0 with 2 decimals", () => {
  for (let i = 0; i < 2000; i++) {
    const s = {
      prompts: Math.floor(Math.random() * 50),
      tokens: Math.floor(Math.random() * 50000),
      iterations: Math.floor(Math.random() * 20),
      passedFirstRun: Math.random() < 0.5,
    };
    const score = efficiencyScore(s, BENCHMARKS[Object.keys(BENCHMARKS)[i % 4]]);
    assert.ok(score >= 0.5 && score <= 2, JSON.stringify(s));
    assert.equal(score, Math.round(score * 100) / 100);
  }
});

// --- through the API ---
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
  return { cookie: res.headers.get("set-cookie").split(";")[0], id: (await res.json()).user.id };
}

const realComplete = chat.complete;
const saved = { ...config };
let alice, original, solution;
before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems CASCADE");
  await seed();
  ({ files: original, solution_files: solution } = await one(
    `SELECT cb.files, cb.solution_files FROM problem_codebase cb JOIN problems p ON p.id = cb.problem_id
     WHERE p.slug = 'payment-retries-disappear'`,
  ));
  solution = { ...original, ...solution };
  alice = await signup("alice");
  Object.assign(config, { aiProvider: "anthropic", anthropicApiKey: "sk-test", aiFreeDailyTokens: 1e9 });
  // Each prompt costs 2000 tokens.
  chat.complete = async () => ({ text: "ok", model: "claude-haiku-4-5", promptTokens: 1500, responseTokens: 500 });
});
after(async () => {
  chat.complete = realComplete;
  Object.assign(config, saved);
  server.close();
  await pool.end();
});

test("the chat shows the live score and the benchmark", async () => {
  const { attempt } = await (await request("POST", "/problems/payment-retries-disappear/start", alice.cookie)).json();
  let body = await (await request("GET", `/attempts/${attempt.id}/ai/messages`, alice.cookie)).json();
  assert.deepEqual(body.efficiency, { score: 2, benchmark: { ...medium, source: "difficulty" } });
  for (let i = 0; i < 16; i++) await request("POST", `/attempts/${attempt.id}/ai/messages`, alice.cookie, { text: "help", files: {} });
  body = await (await request("GET", `/attempts/${attempt.id}/ai/messages`, alice.cookie)).json();
  // 16 prompts (0.5), 32,000 tokens (0.5), no runs yet (iterations 2.0, first run counted as passed 2.0).
  assert.equal(body.efficiency.score, efficiencyScore({ prompts: 16, tokens: 32000, iterations: 0, passedFirstRun: true }, medium));
  await request("POST", `/attempts/${attempt.id}/give-up`, alice.cookie);
});

test("solving uses the session's score: points = base × time × efficiency, stored and shown", { skip }, async () => {
  const { attempt } = await (await request("POST", "/problems/payment-retries-disappear/start", alice.cookie)).json();
  await request("POST", `/attempts/${attempt.id}/test`, alice.cookie, { files: original }); // fails, no prompt yet
  const result = await done(await request("POST", `/attempts/${attempt.id}/test`, alice.cookie, { files: solution }));

  // Same attempt as above (reopened): 16 prompts, 32,000 tokens. The first run came after the prompts → 1 iteration
  // (the second run had no new prompt), and it failed.
  const s = await one("SELECT * FROM solve_sessions WHERE attempt_id = $1", [attempt.id]);
  assert.equal(s.total_ai_iterations, 1);
  const expected = efficiencyScore({ prompts: 16, tokens: 32000, iterations: 1, passedFirstRun: false }, medium);
  assert.equal(Number(s.efficiency_score), expected);
  assert.ok(expected < 1, `expected ${expected} < 1`);

  const a = await one("SELECT points_earned, time_taken_seconds FROM user_problem_attempts WHERE id = $1", [attempt.id]);
  const multiplier = timeMultiplier(a.time_taken_seconds, 40);
  assert.equal(result.solved.efficiencyScore, expected);
  assert.equal(result.solved.pointsEarned, finalPoints(250, multiplier, expected));
  assert.equal(a.points_earned, result.solved.pointsEarned);

  // Below the base points the ledger is one row with the lower amount; the sum always matches.
  const ledger = await one(
    "SELECT sum(amount)::int AS total, count(*)::int AS n FROM point_transactions WHERE user_id = $1",
    [alice.id],
  );
  assert.equal(ledger.total, a.points_earned);
  assert.equal((await one("SELECT total_points FROM user_stats WHERE user_id = $1", [alice.id])).total_points, ledger.total);

  const { problem } = await (await request("GET", "/problems/payment-retries-disappear", alice.cookie)).json();
  assert.equal(problem.result.efficiencyScore, expected);
});
