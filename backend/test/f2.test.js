import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1/auth`;
const post = (path, body, cookie) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }) },
    body: JSON.stringify(body),
  });
const me = (cookie) => fetch(`${base}/me`, { headers: cookie ? { Cookie: cookie } : {} });
const sessionOf = (res) => res.headers.get("set-cookie")?.split(";")[0];

const ada = { email: "Ada@Example.com", username: "Ada_L", password: "correct horse" };

before(async () => {
  await migrate();
  await pool.query("TRUNCATE users CASCADE");
});
after(async () => {
  server.close();
  await pool.end();
});

test("signup creates the user, user_stats and a browser-session cookie", async () => {
  const res = await post("/signup", ada);
  assert.equal(res.status, 201);
  const { user } = await res.json();
  assert.deepEqual(
    { email: user.email, username: user.username },
    { email: "ada@example.com", username: "Ada_L" },
  );
  const cookie = res.headers.get("set-cookie");
  assert.match(cookie, /^bugdr_session=.+; Path=\/; HttpOnly; SameSite=Lax$/); // no Max-Age = ends with the browser
  const stats = await pool.query("SELECT total_points, current_level FROM user_stats WHERE user_id = $1", [user.id]);
  assert.deepEqual(stats.rows, [{ total_points: 0, current_level: "Intern" }]);
});

test("the password is never stored in plain text", async () => {
  const { rows } = await pool.query("SELECT password_hash FROM users WHERE email = 'ada@example.com'");
  assert.notEqual(rows[0].password_hash, ada.password);
  assert.ok(!rows[0].password_hash.includes(ada.password));
  assert.match(rows[0].password_hash, /^scrypt:/);
});

test("duplicate email or username (any case) returns 409", async () => {
  let res = await post("/signup", { ...ada, username: "someone_else" });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, "EMAIL_TAKEN");
  res = await post("/signup", { ...ada, email: "other@example.com", username: "ada_l" });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, "USERNAME_TAKEN");
});

test("invalid signup fields return 400 with details per field", async () => {
  const res = await post("/signup", { email: "nope", username: "a b", password: "short" });
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.equal(error.code, "VALIDATION_ERROR");
  assert.deepEqual(Object.keys(error.details).sort(), ["email", "password", "username"]);
});

test("wrong password and unknown email get the same 401", async () => {
  const wrong = await post("/login", { email: ada.email, password: "wrong password" });
  const unknown = await post("/login", { email: "nobody@example.com", password: "wrong password" });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await wrong.json(), await unknown.json());
  assert.equal(wrong.headers.get("set-cookie"), null);
});

test("login with remember me sets a 30-day cookie, and /me returns the user", async () => {
  const res = await post("/login", { email: "ADA@example.com", password: ada.password, remember: true });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("set-cookie"), /Max-Age=2592000/);
  const meRes = await me(sessionOf(res));
  assert.equal(meRes.status, 200);
  assert.equal((await meRes.json()).user.username, "Ada_L");
});

test("/me without a valid cookie returns 401", async () => {
  assert.equal((await me()).status, 401);
  assert.equal((await me("bugdr_session=mock")).status, 401);
  assert.equal((await me("bugdr_session=eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.")).status, 401); // alg "none"
});

test("logout clears the cookie", async () => {
  const res = await post("/logout", {});
  assert.equal(res.status, 204);
  assert.match(res.headers.get("set-cookie"), /^bugdr_session=;.*Expires=Thu, 01 Jan 1970/);
});
