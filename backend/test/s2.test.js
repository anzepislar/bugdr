import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { pool } from "../src/db.js";
import { migrate, seed } from "../src/migrate.js";
import { chat } from "../src/modules/ai/chat.service.js";
import { activeSeconds } from "../src/modules/scoring/scoring.js";

// S2: editor events + session counters. Submit runs the real checks of payment-retries-disappear in Docker (R3).
const skip = spawnSync("docker", ["info"]).status !== 0 && "Docker is not running";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
const request = (method, path, cookie, body) =>
  fetch(`${base}${path}`, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
const start = async (cookie) => (await (await request("POST", "/problems/payment-retries-disappear/start", cookie)).json()).attempt;
const send = (id, cookie, events) => request("POST", `/attempts/${id}/events`, cookie, { events });
const event = (type, extra = {}) => ({ id: randomUUID(), type, at: new Date().toISOString(), ...extra });
const submit = async (id, cookie, files) => (await request("POST", `/attempts/${id}/test`, cookie, { files })).text();
const ask = (id, cookie) => request("POST", `/attempts/${id}/ai/messages`, cookie, { text: "help", files: {} });
const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
const session = (attemptId) => one("SELECT * FROM solve_sessions WHERE attempt_id = $1", [attemptId]);

async function signup(name) {
  const res = await request("POST", "/auth/signup", null, { email: `${name}@example.com`, username: name, password: "password1" });
  return res.headers.get("set-cookie").split(";")[0];
}

const realComplete = chat.complete;
const saved = { ...config };
let alice, bob, carol, original, solution;
before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems CASCADE");
  await seed();
  ({ files: original, solution_files: solution } = await one(
    `SELECT cb.files, cb.solution_files FROM problem_codebase cb JOIN problems p ON p.id = cb.problem_id
     WHERE p.slug = 'payment-retries-disappear'`,
  ));
  solution = { ...original, ...solution };
  [alice, bob, carol] = [await signup("alice"), await signup("bobby"), await signup("carol")];
  Object.assign(config, { aiProvider: "anthropic", anthropicApiKey: "sk-test", aiFreeDailyTokens: 1e9 });
  chat.complete = async () => ({ text: "ok", model: "claude-haiku-4-5", promptTokens: 10, responseTokens: 5 });
});
after(async () => {
  chat.complete = realComplete;
  Object.assign(config, saved);
  server.close();
  await pool.end();
});

test("activeSeconds counts only time inside tries (D56)", () => {
  const at = (s) => new Date(Date.UTC(2026, 9, 9, 12, 0, s));
  const tries = [
    { startedAt: at(0), endedAt: at(100) }, // 100 s
    { startedAt: at(1000), endedAt: null }, // open
  ];
  assert.equal(activeSeconds(at(50), tries), 50);
  assert.equal(activeSeconds(at(500), tries), 100); // the gap between tries does not count
  assert.equal(activeSeconds(at(1030), tries), 130);
  assert.equal(activeSeconds(at(-10), tries), 0);
});

test("a guest → 401, someone else's attempt → 404, bad batches → 400 (unknown or server-only type)", async () => {
  const attempt = await start(alice);
  assert.equal((await send(attempt.id, null, [event("file_open")])).status, 401);
  assert.equal((await send(attempt.id, bob, [event("file_open")])).status, 404);
  const bad = [
    [],
    Array.from({ length: 101 }, () => event("file_open")),
    [event("typing")],
    [event("test_run")],
    [event("ai_prompt")],
    [{ ...event("file_open"), id: "nope" }],
    [{ ...event("file_open"), at: "yesterday-ish" }],
    [event("file_open", { fileName: "x".repeat(256) })],
    "not a list",
  ];
  for (const events of bad) {
    const res = await send(attempt.id, alice, events);
    assert.equal(res.status, 400, JSON.stringify(events).slice(0, 80));
    assert.equal((await res.json()).error.code, "INVALID_EVENTS");
  }
  assert.equal(await session(attempt.id), undefined);
});

test("a batch sent twice adds its events once; times stay between the start and now", async () => {
  const attempt = await start(alice);
  const batch = [
    event("description_close"),
    event("file_open", { fileName: "src/workers/payment.ts" }),
    event("description_open", { at: "2000-01-01T00:00:00Z" }),
    event("description_open", { at: "2999-01-01T00:00:00Z" }),
  ];
  assert.equal((await send(attempt.id, alice, batch)).status, 204);
  assert.equal((await send(attempt.id, alice, batch)).status, 204);
  const { rows } = await pool.query(
    `SELECT e.event_type, e.file_name, e.occurred_at >= t.started_at AS after_start, e.occurred_at <= now() AS before_now
     FROM editor_events e JOIN solve_sessions s ON s.id = e.session_id
     JOIN attempt_tries t ON t.attempt_id = s.attempt_id WHERE s.attempt_id = $1 ORDER BY e.event_type, e.file_name`,
    [attempt.id],
  );
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((r) => [r.event_type, r.file_name]),
    [
      ["description_close", null],
      ["description_open", null],
      ["description_open", null],
      ["file_open", "src/workers/payment.ts"],
    ],
  );
  assert.ok(rows.every((r) => r.after_start && r.before_now));
});

test("events for a given-up or solved attempt → 409", async () => {
  const attempt = await start(alice);
  await request("POST", `/attempts/${attempt.id}/give-up`, alice);
  let res = await send(attempt.id, alice, [event("file_open")]);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, "ATTEMPT_NOT_ACTIVE");
  await pool.query("UPDATE user_problem_attempts SET status = 'solved' WHERE id = $1", [attempt.id]);
  res = await send(attempt.id, alice, [event("file_open")]);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, "ALREADY_SOLVED");
});

test("Submit records test runs, first-run result and iterations (D51 a); solving sets the session times", { skip }, async () => {
  const attempt = await start(bob);
  await send(attempt.id, bob, [event("file_open", { fileName: "src/workers/payment.ts" })]);
  assert.equal((await ask(attempt.id, bob)).status, 201);
  await submit(attempt.id, bob, original); // run 1 after a prompt → iteration 1, fails
  await submit(attempt.id, bob, original); // run 2, no new prompt → no iteration
  await ask(attempt.id, bob);
  await ask(attempt.id, bob);
  await submit(attempt.id, bob, solution); // run 3 after two prompts → iteration 2, solves

  const s = await session(attempt.id);
  assert.equal(s.test_runs_count, 3);
  assert.equal(s.tests_passed_on_first_run, false);
  assert.equal(s.total_ai_iterations, 2);
  assert.equal(s.total_prompts, 3);
  assert.ok(s.time_to_first_prompt >= 0);
  assert.ok(s.time_on_description >= 0 && s.time_on_description <= s.time_to_first_prompt);
  const { rows } = await pool.query(
    "SELECT metadata FROM editor_events WHERE session_id = $1 AND event_type = 'test_run' ORDER BY occurred_at",
    [s.id],
  );
  assert.deepEqual(
    rows.map((r) => r.metadata.allPassed),
    [false, false, true],
  );
  assert.equal((await one("SELECT status FROM user_problem_attempts WHERE id = $1", [attempt.id])).status, "solved");
});

test("solved on the first run without AI: passed on first run, no iterations, no time to first prompt", { skip }, async () => {
  const attempt = await start(carol);
  await submit(attempt.id, carol, solution);
  const s = await session(attempt.id);
  assert.equal(s.test_runs_count, 1);
  assert.equal(s.tests_passed_on_first_run, true);
  assert.equal(s.total_ai_iterations, 0);
  assert.equal(s.total_prompts, 0);
  assert.equal(s.time_to_first_prompt, null);
  assert.ok(s.time_on_description >= 0);
});
