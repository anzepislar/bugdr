import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
const rate = (cookie, rating, slug = "leaky-worker") =>
  fetch(`${base}/problems/${slug}/rating`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }) },
    body: JSON.stringify({ rating }),
  });

async function signup(username) {
  const res = await fetch(`${base}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${username}@example.com`, username, password: "password1" }),
  });
  return { cookie: res.headers.get("set-cookie").split(";")[0], id: (await res.json()).user.id };
}
const solve = (userId) =>
  pool.query("INSERT INTO user_problem_attempts (user_id, problem_id, status, solved_at) VALUES ($1, $2, 'solved', now())", [
    userId,
    problemId,
  ]);

let problemId, alice, bob, carol;
before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems CASCADE");
  const insert = (slug, published) =>
    pool.query(
      `INSERT INTO problems (slug, title, short_description, codebase_context, incident_report, difficulty, category_id, base_points,
         time_limit_minutes, is_published)
       SELECT $1, 'Leaky worker', 'short', 'context', 'incident', 'medium', id, 250, 40, $2
       FROM problem_categories WHERE slug = 'backend' RETURNING id`,
      [slug, published],
    );
  problemId = (await insert("leaky-worker", true)).rows[0].id;
  await insert("draft-worker", false);
  [alice, bob, carol] = await Promise.all([signup("alice"), signup("bob"), signup("carol")]);
  await solve(alice.id);
  await solve(bob.id);
  // carol has an attempt in progress, not solved.
  await pool.query("INSERT INTO user_problem_attempts (user_id, problem_id) VALUES ($1, $2)", [carol.id, problemId]);
});
after(async () => {
  server.close();
  await pool.end();
});

test("guest 401, unknown or unpublished slug 404, invalid rating 400, unsolved 403", async () => {
  assert.equal((await rate(null, 4)).status, 401);
  assert.equal((await rate(alice.cookie, 4, "nope")).status, 404);
  assert.equal((await rate(alice.cookie, 4, "draft-worker")).status, 404);
  for (const bad of [0, 6, 3.5, "4", null]) assert.equal((await rate(alice.cookie, bad)).status, 400, String(bad));
  const res = await rate(carol.cookie, 4);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, "NOT_SOLVED");
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM problem_ratings");
  assert.equal(rows[0].n, 0);
});

test("ratings from several users give the right average; rating again updates, never duplicates", async () => {
  assert.deepEqual(await (await rate(alice.cookie, 5)).json(), { averageRating: 5, ratingCount: 1, myRating: 5 });
  assert.deepEqual(await (await rate(bob.cookie, 2)).json(), { averageRating: 3.5, ratingCount: 2, myRating: 2 });
  assert.deepEqual(await (await rate(alice.cookie, 3)).json(), { averageRating: 2.5, ratingCount: 2, myRating: 3 });

  const { rows } = await pool.query("SELECT count(*)::int AS n FROM problem_ratings WHERE user_id = $1", [alice.id]);
  assert.equal(rows[0].n, 1);
  const problem = (await (await fetch(`${base}/problems/leaky-worker`, { headers: { Cookie: bob.cookie } })).json()).problem;
  assert.equal(problem.averageRating, 2.5);
  assert.equal(problem.ratingCount, 2);
  assert.equal(problem.result.myRating, 2);
});

test("parallel ratings of different users are both counted", async () => {
  await pool.query("DELETE FROM problem_ratings");
  const [a, b] = await Promise.all([rate(alice.cookie, 4), rate(bob.cookie, 1)]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  const { rows } = await pool.query("SELECT average_rating::float AS avg, rating_count FROM problems WHERE id = $1", [problemId]);
  assert.deepEqual(rows[0], { avg: 2.5, rating_count: 2 });
});
