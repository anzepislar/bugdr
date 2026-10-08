import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
const post = (path, cookie) => fetch(`${base}${path}`, { method: "POST", headers: { Cookie: cookie } });
const start = async (cookie) => (await (await post("/problems/leaky-worker/start", cookie)).json()).attempt;
const tries = async (attemptId) =>
  (
    await pool.query(
      "SELECT try_number, outcome, ended_at IS NULL AS open, duration_seconds FROM attempt_tries WHERE attempt_id = $1 ORDER BY try_number",
      [attemptId],
    )
  ).rows;

async function signup(name) {
  const res = await fetch(`${base}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${name}@example.com`, username: name, password: "password1" }),
  });
  return res.headers.get("set-cookie").split(";")[0];
}

let alice, bob;
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
});
after(async () => {
  server.close();
  await pool.end();
});

test("the first start opens try 1 with no earlier time", async () => {
  const a = await start(alice);
  assert.equal(a.tryNumber, 1);
  assert.equal(a.previousSeconds, 0);
  assert.deepEqual(await tries(a.id), [{ try_number: 1, outcome: "in_progress", open: true, duration_seconds: null }]);
});

test("starting again without giving up keeps the same try", async () => {
  const a = await start(alice);
  assert.equal(a.tryNumber, 1);
  assert.equal((await tries(a.id)).length, 1);
});

test("giving up closes the try with its duration; the next start is try 2 and carries the earlier time", async () => {
  const first = await start(alice);
  // Pretend the first try ran for 10 minutes.
  await pool.query("UPDATE attempt_tries SET started_at = started_at - interval '10 minutes' WHERE attempt_id = $1", [first.id]);
  assert.equal((await post(`/attempts/${first.id}/give-up`, alice)).status, 204);
  const [closed] = await tries(first.id);
  assert.equal(closed.outcome, "abandoned");
  assert.equal(closed.open, false);
  assert.ok(Math.abs(closed.duration_seconds - 600) <= 2, `duration ${closed.duration_seconds}`);

  const second = await start(alice);
  assert.equal(second.id, first.id);
  assert.equal(second.tryNumber, 2);
  assert.equal(second.previousSeconds, closed.duration_seconds);
  assert.deepEqual(
    (await tries(first.id)).map((t) => [t.try_number, t.outcome]),
    [[1, "abandoned"], [2, "in_progress"]],
  );
});

test("giving up twice does not change the closed try; another user's give-up changes nothing", async () => {
  const a = await start(alice);
  assert.equal((await post(`/attempts/${a.id}/give-up`, bob)).status, 404);
  assert.equal((await tries(a.id)).at(-1).open, true);
  await post(`/attempts/${a.id}/give-up`, alice);
  const before = await tries(a.id);
  await post(`/attempts/${a.id}/give-up`, alice);
  assert.deepEqual(await tries(a.id), before);
});

test("parallel starts after giving up open exactly one new try", async () => {
  const a = await start(bob);
  await post(`/attempts/${a.id}/give-up`, bob);
  const results = await Promise.all([start(bob), start(bob), start(bob)]);
  assert.deepEqual(new Set(results.map((r) => r.tryNumber)), new Set([2]));
  assert.deepEqual((await tries(a.id)).map((t) => t.try_number), [1, 2]);
});
