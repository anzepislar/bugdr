import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { hashPassword } from "../src/modules/auth/auth.service.js";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
const req = (path, cookie, body) =>
  fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }) },
    body: body && JSON.stringify(body),
  });
const code = async (res) => [res.status, (await res.json()).error?.code];
const cookieOf = (res) => res.headers.get("set-cookie")?.split(";")[0];
const login = (email, password) => req("/admin/login", null, { email, password });

let userCookie;
before(async () => {
  await migrate();
  await pool.query("TRUNCATE users CASCADE");
  const res = await req("/auth/signup", null, { email: "bob@example.com", username: "bob", password: "password1" });
  userCookie = cookieOf(res);
  config.adminEmail = "admin@bugdr.app";
  config.adminPasswordHash = await hashPassword("admin password 1");
});
after(async () => {
  server.close();
  await pool.end();
});

test("users.is_admin is gone and /auth/me no longer has isAdmin", async () => {
  const { rows } = await pool.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_admin'",
  );
  assert.equal(rows.length, 0);
  assert.equal("isAdmin" in (await (await req("/auth/me", userCookie)).json()).user, false);
});

test("admin login: same 401 for wrong email or password, then an 8 h admin cookie that opens /admin/me", async () => {
  assert.deepEqual(await code(await login("bob@example.com", "admin password 1")), [401, "INVALID_CREDENTIALS"]);
  assert.deepEqual(await code(await login("admin@bugdr.app", "wrong")), [401, "INVALID_CREDENTIALS"]);
  assert.deepEqual(await code(await req("/admin/me")), [401, "UNAUTHENTICATED"]);

  const res = await login(" Admin@Bugdr.app ", "admin password 1");
  assert.equal(res.status, 204);
  assert.match(res.headers.get("set-cookie"), /^bugdr_admin=.+; Max-Age=28800; Path=\/; Expires=.+; HttpOnly; SameSite=Lax$/);
  const admin = cookieOf(res);
  assert.deepEqual(await (await req("/admin/me", admin)).json(), { admin: { email: "admin@bugdr.app" } });

  // The two sessions never stand in for each other.
  assert.deepEqual(await code(await req("/admin/me", userCookie)), [401, "UNAUTHENTICATED"]);
  assert.deepEqual(await code(await req("/admin/me", userCookie.replace("bugdr_session", "bugdr_admin"))), [
    401,
    "UNAUTHENTICATED",
  ]);
  assert.deepEqual(await code(await req("/auth/me", admin)), [401, "UNAUTHENTICATED"]);
  assert.deepEqual(await code(await req("/auth/me", admin.replace("bugdr_admin", "bugdr_session"))), [
    401,
    "UNAUTHENTICATED",
  ]);

  // A new password hash in .env ends every existing admin session.
  const oldHash = config.adminPasswordHash;
  config.adminPasswordHash = await hashPassword("a new admin password");
  assert.equal((await req("/admin/me", admin)).status, 401);
  config.adminPasswordHash = oldHash;
  assert.equal((await req("/admin/me", admin)).status, 200);

  const out = await req("/admin/logout", admin, {});
  assert.equal(out.status, 204);
  assert.match(out.headers.get("set-cookie"), /^bugdr_admin=;/);
});

test("admin login is off without .env settings and locks after 10 failures", async () => {
  const { adminEmail, adminPasswordHash } = config;
  config.adminPasswordHash = "";
  assert.deepEqual(await code(await login(adminEmail, "admin password 1")), [503, "ADMIN_DISABLED"]);
  config.adminPasswordHash = adminPasswordHash;

  for (let i = 0; i < 10; i++) await login(adminEmail, "wrong");
  assert.deepEqual(await code(await login(adminEmail, "admin password 1")), [429, "TOO_MANY_ATTEMPTS"]);
});
