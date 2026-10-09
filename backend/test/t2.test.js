import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { app } from "../src/app.js";
import { pool } from "../src/db.js";
import { migrate, seed } from "../src/migrate.js";

// Seed 0003: payment-retries-disappear (runnable) is the problem of the live weekly contest; query-slower-every-day of
// an ended one. Solving runs the real checks in Docker (R3).
const skip = spawnSync("docker", ["info"]).status !== 0 && "Docker is not running";
const LIVE = "c0000000-0000-4000-8000-000000000001";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
const request = (method, path, cookie, body) =>
  fetch(`${base}${path}`, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
const json = async (method, path, cookie) => (await request(method, path, cookie)).json();
const start = async (cookie, slug = "payment-retries-disappear") => (await json("POST", `/problems/${slug}/start`, cookie)).attempt;
const solve = async (attempt, cookie) => {
  const res = await request("POST", `/attempts/${attempt.id}/test`, cookie, { files: solution });
  return JSON.parse((await res.text()).trim().split("\n").at(-1));
};
const contest = async (cookie) => (await json("GET", `/contests/${LIVE}`, cookie)).contest;
const entries = async () =>
  (await pool.query("SELECT user_id, problems_solved, total_score FROM contest_entries WHERE contest_id = $1", [LIVE])).rows;

async function signup(name) {
  const res = await fetch(`${base}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${name}@example.com`, username: name, password: "password1" }),
  });
  return { cookie: res.headers.get("set-cookie").split(";")[0], id: (await res.json()).user.id };
}

let alice, bob, solution;
before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems, contests CASCADE");
  await seed();
  const { rows } = await pool.query(
    `SELECT cb.files, cb.solution_files FROM problem_codebase cb JOIN problems p ON p.id = cb.problem_id
     WHERE p.slug = 'payment-retries-disappear'`,
  );
  solution = { ...rows[0].files, ...rows[0].solution_files };
  [alice, bob] = [await signup("alice"), await signup("bobby")];
});
after(async () => {
  server.close();
  await pool.end();
});

test("Enter contest = one entry per user and contest (D60); problems outside a live contest add none", async () => {
  assert.equal((await contest(alice.cookie)).participation, null);
  await start(alice.cookie);
  await start(alice.cookie);
  await start(bob.cookie);
  await start(alice.cookie, "query-slower-every-day"); // its contest has ended
  await start(alice.cookie, "cart-total-flickers"); // in no contest

  assert.equal((await pool.query("SELECT count(*)::int AS n FROM contest_entries")).rows[0].n, 2);
  const c = await contest(alice.cookie);
  assert.equal(c.participantCount, 2);
  assert.deepEqual(c.participation, { problemsSolved: 0, problemCount: 1, score: 0 });
  const list = await json("GET", "/contests");
  assert.equal(list.live.find((x) => x.id === LIVE).participantCount, 2);
});

test("a solve while the contest is live counts its points; one after ends_at does not", { skip }, async () => {
  const attemptA = await start(alice.cookie);
  const solvedA = (await solve(attemptA, alice.cookie)).solved;
  assert.ok(solvedA.pointsEarned > 0);
  assert.deepEqual((await contest(alice.cookie)).participation, {
    problemsSolved: 1,
    problemCount: 1,
    score: solvedA.pointsEarned,
  });

  // The contest ends while bob is still working: his solve still earns points, but not for the contest.
  await pool.query("UPDATE contests SET ends_at = now() - interval '1 minute' WHERE id = $1", [LIVE]);
  const attemptB = await start(bob.cookie);
  assert.ok((await solve(attemptB, bob.cookie)).solved.pointsEarned > 0);
  const byUser = Object.fromEntries((await entries()).map((e) => [e.user_id, e]));
  assert.deepEqual([byUser[bob.id].problems_solved, byUser[bob.id].total_score], [0, 0]);
  assert.deepEqual([byUser[alice.id].problems_solved, byUser[alice.id].total_score], [1, solvedA.pointsEarned]);

  // History (D32) on /contests and on the profile: ended contests only.
  const history = (await json("GET", "/contests", alice.cookie)).history;
  assert.deepEqual(
    history.map(({ contestId, problemsSolved, problemCount, score }) => ({ contestId, problemsSolved, problemCount, score })),
    [{ contestId: LIVE, problemsSolved: 1, problemCount: 1, score: solvedA.pointsEarned }],
  );
  const profile = (await json("GET", "/users/bobby", alice.cookie)).profile;
  assert.deepEqual(
    profile.contests.map((h) => [h.problemsSolved, h.score]),
    [[0, 0]],
  );
  assert.deepEqual((await json("GET", "/contests")).history, []);
});
