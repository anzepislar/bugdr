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
const list = (cookie) => call("GET", "/problems/leaky-worker/comments", cookie).then((r) => r.json());
const post = async (cookie, content, parentId) =>
  (await call("POST", "/problems/leaky-worker/comments", cookie, { content, parentId })).json();

async function signup(username) {
  const res = await call("POST", "/auth/signup", null, { email: `${username}@example.com`, username, password: "password1" });
  return { cookie: res.headers.get("set-cookie").split(";")[0], id: (await res.json()).user.id };
}

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
  for (const u of [alice, bob])
    await pool.query("INSERT INTO user_problem_attempts (user_id, problem_id, status, solved_at) VALUES ($1, $2, 'solved', now())", [
      u.id,
      problemId,
    ]);
  await pool.query("INSERT INTO user_profiles (user_id, goal_role) VALUES ($1, 'backend') ON CONFLICT (user_id) DO UPDATE SET goal_role = 'backend'", [
    alice.id,
  ]);
});
after(async () => {
  server.close();
  await pool.end();
});

test("posting: guest 401, unknown or draft problem 404, empty or too long 400, unsolved 403", async () => {
  assert.equal((await call("POST", "/problems/leaky-worker/comments", null, { content: "hi" })).status, 401);
  assert.equal((await call("POST", "/problems/nope/comments", alice.cookie, { content: "hi" })).status, 404);
  assert.equal((await call("POST", "/problems/draft-worker/comments", alice.cookie, { content: "hi" })).status, 404);
  for (const content of ["", "   ", "x".repeat(2001), 5, undefined])
    assert.equal((await call("POST", "/problems/leaky-worker/comments", alice.cookie, { content })).status, 400);
  const res = await call("POST", "/problems/leaky-worker/comments", carol.cookie, { content: "spoiler" });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, "NOT_SOLVED");
});

test("a new comment comes back in the list shape; 2000 characters are allowed and content is trimmed", async () => {
  const { comment } = await post(alice.cookie, "  <b>Use a queue</b>  ");
  assert.equal(comment.content, "<b>Use a queue</b>");
  assert.deepEqual(comment.author, { username: "alice", displayName: "alice", goalRole: "backend" });
  assert.equal(comment.own, true);
  assert.equal(comment.helpfulCount, 0);
  assert.deepEqual(comment.replies, []);
  assert.equal((await call("POST", "/problems/leaky-worker/comments", bob.cookie, { content: "y".repeat(2000) })).status, 201);
});

test("unsolved users and guests only ever get the count, never content", async () => {
  for (const cookie of [null, carol.cookie]) {
    const body = await list(cookie);
    assert.deepEqual(body, { count: 2, locked: true });
  }
  assert.equal((await call("GET", "/problems/draft-worker/comments", alice.cookie)).status, 404);
});

test("replies are one level deep, under a comment of the same problem", async () => {
  const { comment: top } = await post(bob.cookie, "Why a queue?");
  const { comment: reply } = await post(alice.cookie, "Retries survive restarts", top.id);
  // Reply to a reply, unknown id, garbage id → 400.
  for (const parentId of [reply.id, "00000000-0000-0000-0000-000000000000", "nope"])
    assert.equal((await call("POST", "/problems/leaky-worker/comments", alice.cookie, { content: "x", parentId })).status, 400);

  const { comments } = await list(alice.cookie);
  assert.equal(comments.length, 3);
  const withReply = comments.find((c) => c.id === top.id);
  assert.deepEqual(
    withReply.replies.map((r) => [r.content, r.own]),
    [["Retries survive restarts", true]],
  );
  assert.equal(withReply.own, false);
  const detail = (await (await call("GET", "/problems/leaky-worker", alice.cookie)).json()).problem;
  assert.equal(detail.commentCount, 4);
});

test("helpful: only after solving, never on your own comment, idempotent", async () => {
  const { comments } = await list(bob.cookie);
  const alices = comments.find((c) => c.author.username === "alice");
  const path = `/comments/${alices.id}/helpful`;

  assert.equal((await call("PUT", path, null)).status, 401);
  assert.equal((await call("PUT", "/comments/nope/helpful", bob.cookie)).status, 404);
  assert.equal((await call("PUT", path, carol.cookie)).status, 403);
  const own = await call("PUT", path, alice.cookie);
  assert.equal(own.status, 403);
  assert.equal((await own.json()).error.code, "OWN_COMMENT");

  assert.equal((await call("PUT", path, bob.cookie)).status, 204);
  assert.equal((await call("PUT", path, bob.cookie)).status, 204);
  let mine = (await list(bob.cookie)).comments.find((c) => c.id === alices.id);
  assert.equal(mine.helpfulCount, 1);
  assert.equal(mine.markedHelpful, true);
  // Alice sees the count, not Bob's mark.
  assert.equal((await list(alice.cookie)).comments.find((c) => c.id === alices.id).markedHelpful, false);

  assert.equal((await call("DELETE", path, bob.cookie)).status, 204);
  assert.equal((await call("DELETE", path, bob.cookie)).status, 204);
  mine = (await list(bob.cookie)).comments.find((c) => c.id === alices.id);
  assert.equal(mine.helpfulCount, 0);
  assert.equal(mine.markedHelpful, false);
});

test("delete: only the author; replies and helpful marks go with it", async () => {
  const { comments } = await list(bob.cookie);
  const top = comments.find((c) => c.replies.length === 1);
  await call("PUT", `/comments/${top.replies[0].id}/helpful`, bob.cookie);

  assert.equal((await call("DELETE", `/comments/${top.id}`, null)).status, 401);
  assert.equal((await call("DELETE", `/comments/${top.id}`, alice.cookie)).status, 403);
  assert.equal((await call("DELETE", "/comments/nope", bob.cookie)).status, 404);
  assert.equal((await call("DELETE", `/comments/${top.id}`, bob.cookie)).status, 204);
  assert.equal((await call("DELETE", `/comments/${top.id}`, bob.cookie)).status, 404);

  const { rows } = await pool.query(
    `SELECT (SELECT count(*)::int FROM problem_comments) AS comments, (SELECT count(*)::int FROM comment_helpful) AS marks`,
  );
  assert.deepEqual(rows[0], { comments: 2, marks: 0 });
});
