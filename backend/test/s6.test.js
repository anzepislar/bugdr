import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { pool } from "../src/db.js";
import { HttpError } from "../src/errors.js";
import { migrate } from "../src/migrate.js";
import { decryptKey, encryptKey } from "../src/modules/ai/apiKeys.js";
import { chat } from "../src/modules/ai/chat.service.js";

// S6: the user's own API key. Provider calls are replaced - no network, no real keys.
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
const call = (method, path, cookie, body) =>
  fetch(`${base}${path}`, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body && JSON.stringify(body),
  });
const KEY = "sk-ant-api03-user-secret-key-0123456789";
const connect = (cookie, body = {}) =>
  call("POST", "/me/api-key", cookie, { provider: "anthropic", key: KEY, model: "claude-opus-5-5", ...body });
const ask = (cookie, text = "hi") => call("POST", `/attempts/${attemptId}/ai/messages`, cookie, { text, files: {} });
const status = async (cookie) => (await call("GET", "/me/api-key/status", cookie)).json();
const keyRows = async () => (await pool.query("SELECT * FROM user_api_keys")).rows;

async function signup(name) {
  const res = await call("POST", "/auth/signup", null, { email: `${name}@example.com`, username: name, password: "password1" });
  return res.headers.get("set-cookie").split(";")[0];
}

const realComplete = chat.complete;
const saved = { ...config };
let calls = [];
let alice, attemptId;

before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems CASCADE");
  const { rows } = await pool.query(
    `INSERT INTO problems (slug, title, short_description, codebase_context, incident_report, difficulty, category_id, base_points,
       time_limit_minutes, is_published)
     SELECT 'leaky-worker', 'Leaky worker', 'short', 'ctx', 'report', 'medium', id, 250, 40, true
     FROM problem_categories WHERE slug = 'backend' RETURNING id`,
  );
  await pool.query(
    `INSERT INTO problem_codebase (problem_id, repository_structure, files, language)
     VALUES ($1, '["src/index.ts"]', '{"src/index.ts": "code"}', 'TypeScript')`,
    [rows[0].id],
  );
  alice = await signup("alice");
  attemptId = (await (await call("POST", "/problems/leaky-worker/start", alice)).json()).attempt.id;
});
beforeEach(async () => {
  Object.assign(config, saved, {
    aiProvider: "anthropic",
    anthropicApiKey: "sk-ant-platform",
    aiFreeDailyTokens: 20000,
    apiKeyEncryptionKey: randomBytes(32).toString("hex"),
  });
  calls = [];
  chat.complete = async (args) => {
    calls.push(args);
    return { text: "ok", model: args.userKey?.model ?? "claude-haiku-4-5", promptTokens: 30, responseTokens: 10 };
  };
  await pool.query("DELETE FROM user_api_keys");
  await pool.query("DELETE FROM solve_sessions");
});
after(async () => {
  chat.complete = realComplete;
  Object.assign(config, saved);
  server.close();
  await pool.end();
});

test("a guest cannot read, connect or remove a key", async () => {
  assert.equal((await call("GET", "/me/api-key/status")).status, 401);
  assert.equal((await connect(null)).status, 401);
  assert.equal((await call("DELETE", "/me/api-key")).status, 401);
});

test("unknown provider, a model not on the list or a broken key → 400, nothing stored, no provider call", async () => {
  for (const body of [{ provider: "gemini" }, { model: "gpt-4o" }, { model: undefined }, { key: "short" }, { key: `${KEY} x` }]) {
    const res = await connect(alice, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal((await res.json()).error.code, "VALIDATION_ERROR");
  }
  assert.equal(calls.length, 0);
  assert.equal((await keyRows()).length, 0);
});

test("without API_KEY_ENCRYPTION_KEY → 503, nothing stored", async () => {
  config.apiKeyEncryptionKey = "";
  const res = await connect(alice);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, "AI_KEYS_DISABLED");
  assert.equal(calls.length, 0);
  assert.equal((await keyRows()).length, 0);
});

test("a key the provider rejects on the test call is never stored", async () => {
  chat.complete = async () => {
    throw new HttpError(400, "API_KEY_REJECTED", "rejected");
  };
  const res = await connect(alice);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, "API_KEY_REJECTED");
  assert.equal((await keyRows()).length, 0);
});

test("connecting tests the key with the chosen model, stores it encrypted, and never returns it", async () => {
  const before = await status(alice);
  assert.deepEqual(before, {
    connected: false,
    provider: null,
    model: null,
    models: {
      anthropic: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-4-5"],
      openai: ["gpt-4o", "gpt-4o-mini"],
    },
  });

  const res = await connect(alice);
  assert.equal(res.status, 204);
  assert.deepEqual(calls[0].userKey, { provider: "anthropic", model: "claude-opus-5-5", apiKey: KEY });

  const [row] = await keyRows();
  assert.equal(row.provider, "anthropic");
  assert.equal(row.model, "claude-opus-5-5");
  for (const column of ["ciphertext", "iv", "auth_tag"]) assert.ok(!row[column].toString("latin1").includes(KEY), column);
  assert.ok(!JSON.stringify(row).includes(KEY));

  const raw = await (await call("GET", "/me/api-key/status", alice)).text();
  assert.ok(!raw.includes(KEY));
  const after = JSON.parse(raw);
  assert.equal(after.connected, true);
  assert.equal(after.provider, "anthropic");
  assert.equal(after.model, "claude-opus-5-5");

  // A new key replaces the old one.
  assert.equal((await connect(alice, { provider: "openai", model: "gpt-4o", key: "sk-proj-other-key-0123456789" })).status, 204);
  const rows = await keyRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].model, "gpt-4o");
});

test("with an own key the chat uses it and the chosen model, records key_source 'user', and has no daily limit", async () => {
  await connect(alice);
  config.aiFreeDailyTokens = 0;
  calls = [];
  const res = await ask(alice);
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.deepEqual(body.model, { keySource: "user", name: "claude-opus-5-5" });
  assert.ok(!JSON.stringify(body).includes(KEY));
  assert.deepEqual(calls[0].userKey, { provider: "anthropic", model: "claude-opus-5-5", apiKey: KEY });

  const { rows } = await pool.query("SELECT key_source, model FROM prompt_events");
  assert.deepEqual(rows, [{ key_source: "user", model: "claude-opus-5-5" }]);
  const history = await (await call("GET", `/attempts/${attemptId}/ai/messages`, alice)).json();
  assert.deepEqual(history.model, { keySource: "user", name: "claude-opus-5-5" });
});

test("after removing the key the chat is back on the free model and its limit", async () => {
  await connect(alice);
  assert.equal((await call("DELETE", "/me/api-key", alice)).status, 204);
  assert.equal((await call("DELETE", "/me/api-key", alice)).status, 204);
  assert.equal((await status(alice)).connected, false);

  calls = [];
  const res = await ask(alice);
  assert.equal(res.status, 201);
  assert.deepEqual((await res.json()).model, { keySource: "platform", name: "claude-haiku-4-5" });
  assert.equal(calls[0].userKey, null);

  config.aiFreeDailyTokens = 0;
  const limited = await ask(alice);
  assert.equal(limited.status, 429);
});

test("a changed ciphertext or a different master key fails decryption (GCM) - never garbage", async () => {
  const encrypted = encryptKey(KEY);
  assert.equal(decryptKey(encrypted), KEY);
  const tampered = { ...encrypted, ciphertext: Buffer.from(encrypted.ciphertext) };
  tampered.ciphertext[0] ^= 1;
  assert.throws(() => decryptKey(tampered));

  await connect(alice);
  config.apiKeyEncryptionKey = randomBytes(32).toString("hex");
  const res = await ask(alice);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, "API_KEY_UNREADABLE");
});

test("provider calls: the user's key goes in the request; a rejected user key → 400, a rejected platform key → 502", async () => {
  chat.complete = realComplete;
  const realFetch = globalThis.fetch;
  let headers;
  const stub = (status, body) =>
    (globalThis.fetch = async (url, init) => {
      headers = init.headers;
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    });
  const code = (p) => p.then(() => "resolved", (err) => [err.status, err.code]);
  const userKey = { provider: "openai", model: "gpt-4o", apiKey: "sk-proj-user" };
  try {
    stub(200, { choices: [{ message: { content: "OK" } }], usage: { prompt_tokens: 5, completion_tokens: 1 } });
    const answer = await chat.complete({ system: "s", messages: [], userKey });
    assert.equal(answer.model, "gpt-4o");
    assert.equal(headers.Authorization, "Bearer sk-proj-user");

    stub(401, {});
    assert.deepEqual(await code(chat.complete({ system: "s", messages: [], userKey })), [400, "API_KEY_REJECTED"]);
    Object.assign(config, { aiProvider: "openai", openaiApiKey: "sk-platform" });
    assert.deepEqual(await code(chat.complete({ system: "s", messages: [] })), [502, "AI_FAILED"]);
    stub(429, {});
    assert.deepEqual(await code(chat.complete({ system: "s", messages: [], userKey })), [503, "AI_BUSY"]);
  } finally {
    globalThis.fetch = realFetch;
  }
});
