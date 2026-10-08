import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
const post = (path, cookie) => fetch(`${base}${path}`, { method: "POST", headers: cookie ? { Cookie: cookie } : {} });
const giveUp = (id, cookie) => post(`/attempts/${id}/give-up`, cookie);
const status = async (id) => (await pool.query("SELECT status FROM user_problem_attempts WHERE id = $1", [id])).rows[0].status;

async function signup(name) {
  const res = await fetch(`${base}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${name}@example.com`, username: name, password: "password1" }),
  });
  return res.headers.get("set-cookie").split(";")[0];
}

let alice, bob, attemptId;
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
  [alice, bob] = [await signup("alice"), await signup("bobby")];
  attemptId = (await (await post("/problems/leaky-worker/start", alice)).json()).attempt.id;
});
after(async () => {
  server.close();
  await pool.end();
});

test("a guest cannot give up", async () => {
  assert.equal((await giveUp(attemptId)).status, 401);
});

test("someone else's attempt, an unknown id or a malformed id → 404", async () => {
  for (const id of [attemptId, "00000000-0000-0000-0000-000000000000", "nope"]) {
    const res = await giveUp(id, bob);
    assert.equal(res.status, 404, id);
    assert.equal((await res.json()).error.code, "ATTEMPT_NOT_FOUND");
  }
  assert.equal(await status(attemptId), "in_progress");
});

test("giving up abandons the attempt, twice is fine, and starting again reopens it (D8)", async () => {
  assert.equal((await giveUp(attemptId, alice)).status, 204);
  assert.equal(await status(attemptId), "abandoned");
  assert.equal((await giveUp(attemptId, alice)).status, 204);
  const { attempt } = await (await post("/problems/leaky-worker/start", alice)).json();
  assert.equal(attempt.id, attemptId);
  assert.equal(await status(attemptId), "in_progress");
});

test("a solved attempt cannot be given up → 409 and stays solved", async () => {
  await pool.query("UPDATE user_problem_attempts SET status = 'solved', solved_at = now() WHERE id = $1", [attemptId]);
  const res = await giveUp(attemptId, alice);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, "ALREADY_SOLVED");
  assert.equal(await status(attemptId), "solved");
});
