import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { pool } from "../src/db.js";
import { hashPassword } from "../src/modules/auth/auth.service.js";
import { healthChecks } from "../src/modules/admin/health.service.js";

// GET /admin/health: the overview's "Services" card. External calls are stubbed.
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
let admin;
const get = (cookie = admin) => fetch(`${base}/admin/health`, { headers: cookie ? { Cookie: cookie } : {} });

const realFetch = globalThis.fetch;
const realAnthropic = healthChecks.anthropic;
const saved = { ...config };
/** Answers calls to the services from `routes` (url prefix → [status, body]); the test server goes to the real fetch. */
function stubServices(routes) {
  globalThis.fetch = async (url, init) => {
    const hit = Object.entries(routes).find(([prefix]) => String(url).startsWith(prefix));
    if (!hit) return realFetch(url, init);
    const [status, body] = hit[1];
    return new Response(JSON.stringify(body ?? {}), { status });
  };
}

before(async () => {
  config.adminEmail = "admin@bugdr.app";
  config.adminPasswordHash = await hashPassword("admin password 1");
  const res = await fetch(`${base}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@bugdr.app", password: "admin password 1" }),
  });
  admin = res.headers.get("set-cookie").split(";")[0];
});
afterEach(() => {
  globalThis.fetch = realFetch;
  healthChecks.anthropic = realAnthropic;
  Object.assign(config, { anthropicApiKey: saved.anthropicApiKey, openaiApiKey: saved.openaiApiKey, githubToken: saved.githubToken, resendApiKey: saved.resendApiKey });
});
after(async () => {
  server.close();
  await pool.end();
});

test("health needs the admin session", async () => {
  assert.equal((await get(null)).status, 401);
});

test("no keys: 200 with all four services unconfigured", async () => {
  Object.assign(config, { anthropicApiKey: "", openaiApiKey: "", githubToken: "", resendApiKey: "" });
  const res = await get();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(Object.keys(body).sort(), ["anthropic", "github", "openai", "resend"]);
  for (const service of Object.values(body)) assert.equal(service.status, "unconfigured");
});

test("configured services: ok, warn on a low GitHub limit, rejected key, failed check", async () => {
  Object.assign(config, { anthropicApiKey: "a", openaiApiKey: "o", githubToken: "g", resendApiKey: "r" });
  healthChecks.anthropic = async () => {
    throw new Error("socket hang up");
  };
  stubServices({
    "https://api.openai.com/v1/models": [200, { data: [] }],
    "https://api.github.com/rate_limit": [200, { rate: { remaining: 42, limit: 5000 } }],
    [`${config.resendApiUrl}/domains`]: [401, { message: "invalid" }],
  });
  const body = await (await get()).json();
  assert.deepEqual(body, {
    anthropic: { status: "error", detail: "Unreachable" },
    openai: { status: "ok", detail: "Responding" },
    github: { status: "warn", detail: "42 / 5000 requests remaining" },
    resend: { status: "error", detail: "Key rejected" },
  });
  assert.ok(!JSON.stringify(body).includes('"o"') && !JSON.stringify(body).includes('"g"'), "no keys in the response");
});

test("rate limits warn, GitHub rejects as Token rejected", async () => {
  Object.assign(config, { anthropicApiKey: "", openaiApiKey: "o", githubToken: "g", resendApiKey: "" });
  stubServices({
    "https://api.openai.com/v1/models": [429],
    "https://api.github.com/rate_limit": [401],
  });
  const body = await (await get()).json();
  assert.deepEqual(body.openai, { status: "warn", detail: "Rate limited" });
  assert.deepEqual(body.github, { status: "error", detail: "Token rejected" });
});
