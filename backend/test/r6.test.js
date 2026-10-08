import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { app } from "../src/app.js";
import { pool } from "../src/db.js";
import { migrate, seed } from "../src/migrate.js";

// R6: results of POST /attempts/:id/test arrive per check, while the later checks still run (Docker, R3).
const skip = spawnSync("docker", ["info"]).status !== 0 && "Docker is not running";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;

let cookie, attempt, original;
before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems CASCADE");
  await seed();
  original = (
    await pool.query(
      "SELECT cb.files FROM problem_codebase cb JOIN problems p ON p.id = cb.problem_id WHERE p.slug = 'payment-retries-disappear'",
    )
  ).rows[0].files;
  const res = await fetch(`${base}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "live@example.com", username: "live", password: "password1" }),
  });
  cookie = res.headers.get("set-cookie").split(";")[0];
  attempt = (await (await fetch(`${base}/problems/payment-retries-disappear/start`, { method: "POST", headers: { Cookie: cookie } })).json())
    .attempt;
});
after(async () => {
  server.close();
  await pool.end();
});

test("each check streams running → result before the last check finishes, then done", { skip }, async () => {
  const res = await fetch(`${base}/attempts/${attempt.id}/test`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ files: original }),
  });
  assert.match(res.headers.get("content-type"), /application\/x-ndjson/);

  // Read the stream as it arrives and note when each line came in.
  const events = [];
  let buffer = "";
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const l of lines) events.push({ ...JSON.parse(l), at: Date.now() });
  }

  const ids = attempt.checks.map((c) => c.id);
  const expected = ids.flatMap((id) => [["running", id], ["result", id]]);
  assert.deepEqual(events.slice(0, -1).map((e) => [e.type, e.checkId]), expected, "running/result per check, in order");
  const done = events.at(-1);
  assert.equal(done.type, "done");
  assert.equal(done.solved, null);
  assert.deepEqual(done.results.map((r) => r.passed), [false, true, true, true, false, false, true]);

  // The first result arrived noticeably before the last one (each check is its own node process).
  const firstResult = events.find((e) => e.type === "result").at;
  const lastResult = events.findLast((e) => e.type === "result").at;
  assert.ok(lastResult - firstResult > 300, `results arrived ${lastResult - firstResult}ms apart`);
  assert.equal(events[1].passed, false);
  assert.match(events[1].output, /Expected a second charge attempt/);
});
