import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
const req = (path, cookie, body) =>
  fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }) },
    body: body && JSON.stringify(body),
  });
const code = async (res) => [res.status, (await res.json()).error?.code];

let cookie, userId;
before(async () => {
  await migrate();
  await pool.query("TRUNCATE users CASCADE");
  const res = await req("/auth/signup", null, { email: "bob@example.com", username: "bob", password: "password1" });
  cookie = res.headers.get("set-cookie").split(";")[0];
  userId = (await res.json()).user.id;
});
after(async () => {
  server.close();
  await pool.end();
});

test("a ban applies immediately on the existing session and blocks login", async () => {
  assert.equal((await req("/auth/me", cookie)).status, 200);
  await pool.query("UPDATE users SET is_banned = TRUE WHERE id = $1", [userId]);
  assert.deepEqual(await code(await req("/auth/me", cookie)), [403, "BANNED"]);
  const login = await req("/auth/login", null, { email: "bob@example.com", password: "password1" });
  assert.deepEqual(await code(login), [403, "BANNED"]);
  assert.equal(login.headers.get("set-cookie"), null);
  // Wrong password on a banned account still gets the generic 401 (no account info leaks).
  assert.deepEqual(await code(await req("/auth/login", null, { email: "bob@example.com", password: "nope-nope" })), [
    401,
    "INVALID_CREDENTIALS",
  ]);
  await pool.query("UPDATE users SET is_banned = FALSE WHERE id = $1", [userId]);
  assert.equal((await req("/auth/me", cookie)).status, 200);
});

test("last_active_at is refreshed at most once a minute", async () => {
  const lastActive = async () =>
    (await pool.query("SELECT last_active_at FROM users WHERE id = $1", [userId])).rows[0].last_active_at.getTime();

  await pool.query("UPDATE users SET last_active_at = now() - interval '5 minutes' WHERE id = $1", [userId]);
  const old = await lastActive();
  await req("/auth/me", cookie);
  const refreshed = await lastActive();
  assert.ok(refreshed - old > 4 * 60 * 1000, "stale value refreshed");

  await req("/auth/me", cookie);
  assert.equal(await lastActive(), refreshed, "fresh value left alone");
});
