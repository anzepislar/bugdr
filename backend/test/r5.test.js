import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { app } from "../src/app.js";
import { pool } from "../src/db.js";
import { migrate, seed } from "../src/migrate.js";
import { TERMINAL } from "../src/modules/runner/runner.service.js";

// The terminal of the seeded payment-retries-disappear, in Docker (R3 sandbox).
const skip = spawnSync("docker", ["info"]).status !== 0 && "Docker is not running";
// Only containers this test file created: the dev backend may have terminals of its own running.
const existing = new Set();
const allTerminals = () =>
  spawnSync("docker", ["ps", "-a", "--filter", "name=bugdr-term-", "-q"], { encoding: "utf8" }).stdout.trim().split("\n").filter(Boolean);
const containers = () => allTerminals().filter((id) => !existing.has(id));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
const post = (path, cookie, body, signal) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { ...(cookie ? { Cookie: cookie } : {}), "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal,
  });

/** Runs a command and returns { output, end } from the NDJSON stream. */
async function run(command, files = {}, who = alice) {
  const res = await post(`/attempts/${who.attempt.id}/terminal`, who.cookie, { command, files });
  assert.equal(res.status, 200, await res.clone().text());
  const events = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
  return { output: events.filter((e) => e.type === "output").map((e) => e.text).join(""), end: events.at(-1) };
}

async function signup(name) {
  const res = await fetch(`${base}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${name}@example.com`, username: name, password: "password1" }),
  });
  const cookie = res.headers.get("set-cookie").split(";")[0];
  const attempt = (await (await post("/problems/payment-retries-disappear/start", cookie)).json()).attempt;
  return { cookie, attempt };
}

let alice, bob;
before(async () => {
  for (const id of allTerminals()) existing.add(id);
  await migrate();
  await pool.query("TRUNCATE users, problems CASCADE");
  await seed();
  [alice, bob] = [await signup("alice"), await signup("bobby")];
});
after(async () => {
  for (const id of containers()) spawnSync("docker", ["rm", "-f", id]);
  server.close();
  await pool.end();
});

test("guest 401, someone else's attempt 404, empty or huge command 400", async () => {
  assert.equal((await post(`/attempts/${alice.attempt.id}/terminal`, null, { command: "ls" })).status, 401);
  assert.equal((await post(`/attempts/${alice.attempt.id}/terminal`, bob.cookie, { command: "ls", files: {} })).status, 404);
  for (const command of ["", "   ", "x".repeat(TERMINAL.commandLength + 1), 42]) {
    const res = await post(`/attempts/${alice.attempt.id}/terminal`, alice.cookie, { command, files: {} });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "INVALID_COMMAND");
  }
});

test("npm test runs the visible tests and streams the output", { skip }, async () => {
  const { output, end } = await run("npm test");
  assert.match(output, /pass 3/);
  assert.deepEqual(end, { type: "exit", code: 0 });
});

test("the terminal sees the editor's files, but never the hidden checks (D10)", { skip }, async () => {
  const edited = await run("cat src/workers/payment.ts", { "src/workers/payment.ts": "// edited in the editor\n" });
  assert.equal(edited.output, "// edited in the editor\n");
  const hidden = await run("ls -a; test -e .bugdr");
  assert.doesNotMatch(hidden.output, /\.bugdr/);
  assert.deepEqual(hidden.end, { type: "exit", code: 1 });
});

test("no network, not root, no writes outside the workspace", { skip }, async () => {
  const net = await run("node -e \"fetch('http://example.com').then(() => process.exit(0), () => process.exit(7))\"");
  assert.deepEqual(net.end, { type: "exit", code: 7 });
  assert.equal((await run("id -u")).output.trim(), "1000");
  assert.notEqual((await run("touch /etc/x")).end.code, 0);
});

test("a long-running command is stopped after the time limit and the terminal stays usable", { skip }, async () => {
  const seconds = TERMINAL.commandSeconds;
  TERMINAL.commandSeconds = 3;
  try {
    const { end } = await run("node src/index.ts");
    assert.deepEqual(end, { type: "stopped", reason: "timeout" });
  } finally {
    TERMINAL.commandSeconds = seconds;
  }
  const ps = await run("ps -o comm");
  assert.doesNotMatch(ps.output, /node/, "The stopped process is still running");
});

test("one command at a time; the client going away stops the command", { skip }, async () => {
  const controller = new AbortController();
  const long = post(`/attempts/${alice.attempt.id}/terminal`, alice.cookie, { command: "sleep 20", files: {} }, controller.signal);
  await sleep(1500);
  const busy = await post(`/attempts/${alice.attempt.id}/terminal`, alice.cookie, { command: "ls", files: {} });
  assert.equal(busy.status, 409);
  assert.equal((await busy.json()).error.code, "TERMINAL_BUSY");
  controller.abort();
  await long.catch(() => {});
  await sleep(1000);
  const started = Date.now();
  assert.deepEqual((await run("echo ok")).end, { type: "exit", code: 0 });
  assert.ok(Date.now() - started < 5000);
});

test("giving up removes the terminal container; an idle one is removed after the idle time", { skip }, async () => {
  await run("echo hi", {}, bob);
  const before = containers().length;
  await post(`/attempts/${bob.attempt.id}/give-up`, bob.cookie);
  assert.equal(containers().length, before - 1);
  const terminal = await post(`/attempts/${bob.attempt.id}/terminal`, bob.cookie, { command: "ls", files: {} });
  assert.equal((await terminal.json()).error.code, "ATTEMPT_NOT_ACTIVE");

  const idle = TERMINAL.idleSeconds;
  TERMINAL.idleSeconds = 1;
  try {
    await run("echo hi");
    // Idle after 1 s, then docker rm -f, which can take a moment under load.
    for (let i = 0; i < 40 && containers().length; i++) await sleep(200);
    assert.deepEqual(containers(), []);
  } finally {
    TERMINAL.idleSeconds = idle;
  }
});
