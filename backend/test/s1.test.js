import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { chat } from "../src/modules/ai/chat.service.js";

// S1: built-in AI chat on the platform key. The provider call is replaced - no network, no real key.
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
const call = (method, path, cookie, body) =>
  fetch(`${base}${path}`, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body && JSON.stringify(body),
  });
const ask = (id, cookie, text, files = { "src/index.ts": "edited code" }) =>
  call("POST", `/attempts/${id}/ai/messages`, cookie, { text, files });

async function signup(name) {
  const res = await call("POST", "/auth/signup", null, { email: `${name}@example.com`, username: name, password: "password1" });
  return res.headers.get("set-cookie").split(";")[0];
}

const realComplete = chat.complete;
const saved = { ...config };
let calls = [];
let alice, bob, attemptId;

before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems CASCADE");
  const { rows } = await pool.query(
    `INSERT INTO problems (slug, title, short_description, codebase_context, incident_report, difficulty, category_id, base_points,
       time_limit_minutes, is_published)
     SELECT 'leaky-worker', 'Leaky worker', 'short', 'SECRET-CONTEXT', 'SECRET-INCIDENT', 'medium', id, 250, 40, true
     FROM problem_categories WHERE slug = 'backend' RETURNING id`,
  );
  await pool.query(
    `INSERT INTO problem_codebase (problem_id, repository_structure, files, hidden_files, language)
     VALUES ($1, '["src/index.ts","src/util.ts"]', '{"src/index.ts": "code", "src/util.ts": "util code"}',
       '{".bugdr/checks/t.test.js": "HIDDEN-TEST"}', 'TypeScript')`,
    [rows[0].id],
  );
  [alice, bob] = [await signup("alice"), await signup("bobby")];
  attemptId = (await (await call("POST", "/problems/leaky-worker/start", alice)).json()).attempt.id;
});
beforeEach(async () => {
  Object.assign(config, saved, { aiProvider: "anthropic", anthropicApiKey: "sk-ant-platform-secret", aiFreeDailyTokens: 20000 });
  calls = [];
  chat.complete = async (args) => {
    calls.push(args);
    return { text: `answer ${calls.length}`, model: "claude-haiku-4-5", promptTokens: 300, responseTokens: 100 };
  };
  await pool.query("DELETE FROM solve_sessions");
});
after(async () => {
  chat.complete = realComplete;
  Object.assign(config, saved);
  server.close();
  await pool.end();
});

test("a guest → 401; someone else's, an unknown or a malformed attempt → 404", async () => {
  assert.equal((await ask(attemptId, null, "hi")).status, 401);
  for (const id of [attemptId, "00000000-0000-0000-0000-000000000000", "nope"]) {
    const res = await ask(id, bob, "hi");
    assert.equal(res.status, 404, id);
    assert.equal((await res.json()).error.code, "ATTEMPT_NOT_FOUND");
    assert.equal((await call("GET", `/attempts/${id}/ai/messages`, bob)).status, 404, id);
  }
  assert.equal(calls.length, 0);
});

test("an empty or too long message and bad files → 400, no AI call", async () => {
  for (const text of ["", "   ", 5, "x".repeat(8001)]) {
    const res = await ask(attemptId, alice, text);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "INVALID_PROMPT");
  }
  assert.equal((await ask(attemptId, alice, "hi", { "../etc/passwd": "x" })).status, 400);
  assert.equal(calls.length, 0);
});

test("the AI sees the user's current code and earlier turns - never the problem text or hidden files", async () => {
  const first = await ask(attemptId, alice, "  what does index do?  ");
  assert.equal(first.status, 201);
  await ask(attemptId, alice, "and util?");

  const { system, messages } = calls[1];
  assert.match(system, /<file path="src\/index.ts">\nedited code\n<\/file>/);
  assert.match(system, /<file path="src\/util.ts">\nutil code\n<\/file>/);
  for (const secret of ["SECRET-CONTEXT", "SECRET-INCIDENT", "HIDDEN-TEST"]) assert.ok(!system.includes(secret), secret);
  assert.deepEqual(messages, [
    { role: "user", content: "what does index do?" },
    { role: "assistant", content: "answer 1" },
    { role: "user", content: "and util?" },
  ]);
});

test("each prompt is recorded with real token usage; totals and the remaining free limit come back", async () => {
  const res = await ask(attemptId, alice, "first");
  const body = await res.json();
  assert.equal(body.message.role, "ai");
  assert.equal(body.message.text, "answer 1");
  assert.deepEqual(body.model, { keySource: "platform", name: "claude-haiku-4-5" });
  assert.equal(body.totalPrompts, 1);
  assert.equal(body.totalTokens, 400);
  assert.equal(body.remainingTokens, 19600);

  const second = await (await ask(attemptId, alice, "second")).json();
  assert.equal(second.totalPrompts, 2);
  assert.equal(second.totalTokens, 800);
  assert.equal(second.remainingTokens, 19200);

  const { rows } = await pool.query(
    `SELECT s.total_prompts, (SELECT count(*)::int FROM prompt_events WHERE session_id = s.id) AS events,
       (SELECT json_agg(json_build_object('i', prompt_index, 'p', prompt_tokens, 'r', response_tokens, 't', total_tokens,
         'k', key_source, 'm', model) ORDER BY prompt_index) FROM prompt_events WHERE session_id = s.id) AS rows
     FROM solve_sessions s WHERE s.attempt_id = $1`,
    [attemptId],
  );
  assert.equal(rows[0].total_prompts, rows[0].events);
  assert.deepEqual(rows[0].rows, [
    { i: 1, p: 300, r: 100, t: 400, k: "platform", m: "claude-haiku-4-5" },
    { i: 2, p: 300, r: 100, t: 400, k: "platform", m: "claude-haiku-4-5" },
  ]);
});

test("the chat history, model and remaining limit can be read back (reload); the key is never in a response", async () => {
  const sent = await (await ask(attemptId, alice, "hello")).text();
  const res = await call("GET", `/attempts/${attemptId}/ai/messages`, alice);
  assert.equal(res.status, 200);
  const raw = await res.text();
  const body = JSON.parse(raw);
  assert.deepEqual(
    body.messages.map((m) => [m.role, m.text]),
    [
      ["user", "hello"],
      ["ai", "answer 1"],
    ],
  );
  assert.deepEqual(body.model, { keySource: "platform", name: "claude-haiku-4-5" });
  assert.equal(body.totalPrompts, 1);
  assert.equal(body.totalTokens, 400);
  assert.equal(body.remainingTokens, 19600);
  for (const text of [sent, raw]) assert.ok(!text.includes("sk-ant-platform-secret"));
});

test("over the daily free limit → 429 without calling the AI; the next UTC day it works again", async () => {
  config.aiFreeDailyTokens = 800;
  await ask(attemptId, alice, "one");
  await ask(attemptId, alice, "two");
  const res = await ask(attemptId, alice, "three");
  assert.equal(res.status, 429);
  const { error } = await res.json();
  assert.equal(error.code, "AI_DAILY_LIMIT");
  assert.match(error.message, /Connect your own API key in Settings/);
  assert.equal(calls.length, 2);
  assert.equal((await (await call("GET", `/attempts/${attemptId}/ai/messages`, alice)).json()).remainingTokens, 0);

  // The limit is per user, across attempts: yesterday's usage no longer counts.
  await pool.query("UPDATE prompt_events SET sent_at = sent_at - interval '1 day'");
  const again = await ask(attemptId, alice, "four");
  assert.equal(again.status, 201);
  assert.equal((await again.json()).remainingTokens, 400);
});

test("an abandoned or solved attempt → 409", async () => {
  await pool.query("UPDATE user_problem_attempts SET status = 'abandoned' WHERE id = $1", [attemptId]);
  let res = await ask(attemptId, alice, "hi");
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, "ATTEMPT_NOT_ACTIVE");
  await pool.query("UPDATE user_problem_attempts SET status = 'solved' WHERE id = $1", [attemptId]);
  res = await ask(attemptId, alice, "hi");
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, "ALREADY_SOLVED");
  await pool.query("UPDATE user_problem_attempts SET status = 'in_progress' WHERE id = $1", [attemptId]);
  assert.equal(calls.length, 0);
});

test("no AI key on the server → 503, and GET reports no model", async () => {
  Object.assign(config, { aiProvider: "", anthropicApiKey: "", openaiApiKey: "" });
  const res = await ask(attemptId, alice, "hi");
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, "AI_DISABLED");
  assert.equal((await (await call("GET", `/attempts/${attemptId}/ai/messages`, alice)).json()).model, null);
});

test("OpenAI: cheap model, real usage, and provider errors map to clear codes", async () => {
  chat.complete = realComplete;
  Object.assign(config, { aiProvider: "openai", openaiApiKey: "sk-openai", anthropicApiKey: "" });
  const realFetch = globalThis.fetch;
  let sent;
  const stub = (status, body) =>
    (globalThis.fetch = async (url, init) => {
      sent = { url, body: JSON.parse(init.body) };
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    });
  const code = (p) => p.then(() => "resolved", (err) => [err.status, err.code]);
  try {
    stub(200, { choices: [{ message: { content: "hi there" } }], usage: { prompt_tokens: 50, completion_tokens: 7 } });
    const answer = await chat.complete({ system: "sys", messages: [{ role: "user", content: "hi" }] });
    assert.deepEqual(answer, { text: "hi there", model: "gpt-4o-mini", promptTokens: 50, responseTokens: 7 });
    assert.equal(sent.url, "https://api.openai.com/v1/chat/completions");
    assert.equal(sent.body.model, "gpt-4o-mini");
    assert.deepEqual(sent.body.messages, [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ]);

    stub(429, {});
    assert.deepEqual(await code(chat.complete({ system: "", messages: [] })), [503, "AI_BUSY"]);
    stub(500, {});
    assert.deepEqual(await code(chat.complete({ system: "", messages: [] })), [503, "AI_BUSY"]);
    stub(401, {});
    assert.deepEqual(await code(chat.complete({ system: "", messages: [] })), [502, "AI_FAILED"]);
  } finally {
    globalThis.fetch = realFetch;
  }
});
