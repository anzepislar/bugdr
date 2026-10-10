import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
const call = (method, path, body, cookie) =>
  fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }) },
    body: body && JSON.stringify(body),
  });

// A fake Resend that records every email.
let sent = [];
const resend = createServer((req, res) => {
  let data = "";
  req.on("data", (c) => (data += c));
  req.on("end", () => {
    sent.push({ path: req.url, auth: req.headers.authorization, body: JSON.parse(data || "{}") });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ id: `sent-${sent.length}` }));
  });
}).listen(0);

async function nextEmail() {
  for (let i = 0; i < 50 && !sent.length; i++) await new Promise((r) => setTimeout(r, 20));
  return sent.shift();
}
const tokenOf = (email) => email.body.text.match(/reset-password\?token=([\w-]+)/)[1];

let cookie;
before(async () => {
  await migrate();
  await pool.query("TRUNCATE users CASCADE");
  config.resendApiKey = "re_test";
  config.resendApiUrl = `http://localhost:${resend.address().port}`;
  config.appUrl = "https://bugdr.app";
  const res = await call("POST", "/auth/signup", { email: "ana@example.com", username: "ana", password: "old password" });
  cookie = res.headers.get("set-cookie").split(";")[0];
});
after(async () => {
  server.close();
  resend.close();
  await pool.end();
});

test("forgot-password answers 204 for any address and emails a link only to real accounts", async () => {
  sent = [];
  assert.equal((await call("POST", "/auth/forgot-password", { email: "nobody@example.com" })).status, 204);
  assert.equal((await call("POST", "/auth/forgot-password", { email: "not an email" })).status, 204);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(sent.length, 0);

  assert.equal((await call("POST", "/auth/forgot-password", { email: " ANA@example.com " })).status, 204);
  const email = await nextEmail();
  assert.equal(email.path, "/emails");
  assert.equal(email.auth, "Bearer re_test");
  assert.deepEqual(email.body.to, ["ana@example.com"]);
  assert.equal(email.body.from, config.emailFrom);
  assert.match(email.body.text, /https:\/\/bugdr\.app\/reset-password\?token=/);
  const { rows } = await pool.query("SELECT token_hash FROM password_reset_tokens");
  assert.equal(rows.length, 1);
  assert.ok(!email.body.text.includes(rows[0].token_hash)); // only the hash is stored

  // A second request within 2 minutes sends nothing.
  await call("POST", "/auth/forgot-password", { email: "ana@example.com" });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(sent.length, 0);
});

test("reset-password sets the password once, ends old sessions and rejects bad tokens", async () => {
  await pool.query("DELETE FROM password_reset_tokens");
  sent = [];
  await call("POST", "/auth/forgot-password", { email: "ana@example.com" });
  const token = tokenOf(await nextEmail());

  assert.equal((await call("POST", "/auth/reset-password", { token, password: "short" })).status, 400);
  const bad = await call("POST", "/auth/reset-password", { token: "wrong", password: "new password" });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, "INVALID_TOKEN");

  assert.equal((await call("GET", "/auth/me", null, cookie)).status, 200);
  // Sessions are compared by whole seconds: make the old one clearly older than the change.
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal((await call("POST", "/auth/reset-password", { token, password: "new password" })).status, 204);

  assert.equal((await call("GET", "/auth/me", null, cookie)).status, 401); // the old session is gone
  const again = await call("POST", "/auth/reset-password", { token, password: "another one" });
  assert.equal((await again.json()).error.code, "INVALID_TOKEN"); // single use
  assert.equal((await call("POST", "/auth/login", { email: "ana@example.com", password: "old password" })).status, 401);
  const login = await call("POST", "/auth/login", { email: "ana@example.com", password: "new password" });
  assert.equal(login.status, 200);
  assert.equal((await call("GET", "/auth/me", null, login.headers.get("set-cookie").split(";")[0])).status, 200);
});

test("an expired link does not work", async () => {
  await pool.query("DELETE FROM password_reset_tokens");
  sent = [];
  await call("POST", "/auth/forgot-password", { email: "ana@example.com" });
  const token = tokenOf(await nextEmail());
  await pool.query("UPDATE password_reset_tokens SET expires_at = now() - interval '1 second'");
  const res = await call("POST", "/auth/reset-password", { token, password: "new password 2" });
  assert.equal((await res.json()).error.code, "INVALID_TOKEN");
});
