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
const list = async (cookie) => (await (await call("GET", "/problems", cookie)).json()).problems;

async function addProblem(slug, { category = "backend", difficulty = "easy", points = 100, published = true, rating = 4 } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO problems (slug, title, short_description, codebase_context, incident_report, difficulty, category_id, base_points,
       time_limit_minutes, is_published, average_rating)
     SELECT $1, $1, 'short', 'context', 'incident', $2, id, $3, 20, $4, $5 FROM problem_categories WHERE slug = $6 RETURNING id`,
    [slug, difficulty, points, published, rating, category],
  );
  return rows[0].id;
}

let cookie, userId, ids;
before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems CASCADE");
  ids = {
    backend: await addProblem("backend-bug", { rating: 3 }),
    db: await addProblem("db-bug", { category: "database", rating: 5 }),
    hidden: await addProblem("draft-bug", { published: false }),
  };
  await pool.query("INSERT INTO problem_tags (problem_id, tag) VALUES ($1, 'Redis'), ($1, 'Node.js')", [ids.backend]);
  const res = await call("POST", "/auth/signup", null, { email: "pi@example.com", username: "pia", password: "password1" });
  cookie = res.headers.get("set-cookie").split(";")[0];
  userId = (await res.json()).user.id;
});
after(async () => {
  server.close();
  await pool.end();
});

test("the five categories are seeded by the migration", async () => {
  const { rows } = await pool.query("SELECT slug FROM problem_categories ORDER BY slug");
  assert.deepEqual(rows.map((r) => r.slug), ["ai-engineer", "backend", "database", "frontend", "fullstack"]);
});

test("base_points must match the difficulty", async () => {
  await assert.rejects(addProblem("cheap-hard", { difficulty: "hard", points: 100 }), /check constraint/);
  await addProblem("real-hard", { difficulty: "hard", points: 500, published: false });
});

test("guests see only published problems, without status, best rated first", async () => {
  const problems = await list();
  assert.deepEqual(problems.map((p) => p.slug), ["db-bug", "backend-bug"]);
  assert.deepEqual(problems[1], {
    slug: "backend-bug",
    title: "backend-bug",
    shortDescription: "short",
    difficulty: "easy",
    categorySlug: "backend",
    tags: ["Node.js", "Redis"],
    timeLimitMinutes: 20,
    averageRating: 3,
    ratingCount: 0,
    thumbnailUrl: null,
    status: null,
    saved: false,
  });
});

test("an invalid session cookie is treated as a guest", async () => {
  assert.equal((await call("GET", "/problems", "bugdr_session=garbage")).status, 200);
});

test("signed in: own goal role first, attempt status, abandoned shows as null", async () => {
  await pool.query("INSERT INTO user_profiles (user_id, goal_role) VALUES ($1, 'backend')", [userId]);
  await pool.query("INSERT INTO user_problem_attempts (user_id, problem_id, status) VALUES ($1, $2, 'in_progress')", [
    userId,
    ids.backend,
  ]);
  let problems = await list(cookie);
  assert.deepEqual(problems.map((p) => [p.slug, p.status]), [["backend-bug", "in_progress"], ["db-bug", null]]);

  await pool.query("UPDATE user_problem_attempts SET status = 'abandoned' WHERE user_id = $1", [userId]);
  problems = await list(cookie);
  assert.equal(problems[0].status, null);
});

test("bookmarks: guest 401, unknown or unpublished slug 404, saving twice = one row, delete clears it", async () => {
  assert.equal((await call("PUT", "/problems/db-bug/bookmark")).status, 401);
  assert.equal((await call("PUT", "/problems/nope/bookmark", cookie)).status, 404);
  assert.equal((await call("PUT", "/problems/draft-bug/bookmark", cookie)).status, 404);

  assert.equal((await call("PUT", "/problems/db-bug/bookmark", cookie)).status, 204);
  assert.equal((await call("PUT", "/problems/db-bug/bookmark", cookie)).status, 204);
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM problem_bookmarks WHERE user_id = $1", [userId]);
  assert.equal(rows[0].n, 1);
  assert.equal((await list(cookie)).find((p) => p.slug === "db-bug").saved, true);
  assert.equal((await list()).find((p) => p.slug === "db-bug").saved, false);

  assert.equal((await call("DELETE", "/problems/db-bug/bookmark", cookie)).status, 204);
  assert.equal((await list(cookie)).find((p) => p.slug === "db-bug").saved, false);
});
