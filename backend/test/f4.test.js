import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
const call = (method, path, cookie, body) =>
  fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }) },
    body: body && JSON.stringify(body),
  });
const me = async (cookie) => (await (await call("GET", "/auth/me", cookie)).json()).user;
const answers = { goalRole: "backend", experienceLevel: "mid", platformGoal: "both", languages: ["Go", "SQL"] };

let cookie, userId;
before(async () => {
  await migrate();
  await pool.query("TRUNCATE users CASCADE");
  const res = await call("POST", "/auth/signup", null, { email: "cy@example.com", username: "cyd", password: "password1" });
  cookie = res.headers.get("set-cookie").split(";")[0];
  userId = (await res.json()).user.id;
});
after(async () => {
  server.close();
  await pool.end();
});

const profiles = async () =>
  (
    await pool.query(
      "SELECT goal_role, experience_level, platform_goal, languages, onboarding_completed FROM user_profiles WHERE user_id = $1",
      [userId],
    )
  ).rows;

test("onboarding needs a session", async () => {
  assert.equal((await call("PUT", "/me/onboarding", null, answers)).status, 401);
});

test("invalid values return 400 and save nothing", async () => {
  for (const bad of [
    { goalRole: "exploring" },
    { experienceLevel: "guru" },
    { platformGoal: undefined },
    { languages: ["Cobol"] },
    { languages: "Go" },
  ]) {
    const res = await call("PUT", "/me/onboarding", cookie, { ...answers, ...bad });
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.equal((await res.json()).error.code, "VALIDATION_ERROR");
  }
  assert.deepEqual(await profiles(), []);
});

test("saving completes onboarding, and /auth/me reports it", async () => {
  assert.equal((await me(cookie)).onboardingCompleted, false);
  assert.equal((await call("PUT", "/me/onboarding", cookie, answers)).status, 204);
  assert.deepEqual(await profiles(), [
    { goal_role: "backend", experience_level: "mid", platform_goal: "both", languages: ["Go", "SQL"], onboarding_completed: true },
  ]);
  assert.equal((await me(cookie)).onboardingCompleted, true);
});

test("re-submitting updates the same row; goalRole null = exploring (D41)", async () => {
  const res = await call("PUT", "/me/onboarding", cookie, { ...answers, goalRole: null, languages: ["Go", "Go"] });
  assert.equal(res.status, 204);
  const rows = await profiles();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].goal_role, null);
  assert.deepEqual(rows[0].languages, ["Go"]);
});

test("login returns onboardingCompleted", async () => {
  const res = await call("POST", "/auth/login", null, { email: "cy@example.com", password: "password1" });
  assert.equal((await res.json()).user.onboardingCompleted, true);
});
