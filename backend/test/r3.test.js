import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { pool } from "../src/db.js";
import { migrate, seed } from "../src/migrate.js";
import { LIMITS, runChecks, validateFiles } from "../src/modules/runner/runner.service.js";

// Needs a running Docker daemon and the node:24-alpine image (docker pull node:24-alpine).
const skip = spawnSync("docker", ["info"]).status !== 0 && "Docker is not running";
const leftovers = () =>
  spawnSync("docker", ["ps", "-a", "--filter", "name=bugdr-run-", "-q"], { encoding: "utf8" }).stdout.trim();

let problem, solution;
before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems CASCADE");
  await seed();
  const { rows } = await pool.query(
    `SELECT cb.files, cb.hidden_files, cb.solution_files, cb.setup_commands,
       json_agg(json_build_object('id', k.id, 'checkOrder', k.check_order, 'command', k.check_command,
         'expectedOutput', k.expected_output) ORDER BY k.check_order) AS checks
     FROM problems p JOIN problem_codebase cb ON cb.problem_id = p.id JOIN problem_checks k ON k.problem_id = p.id
     WHERE p.slug = 'payment-retries-disappear' GROUP BY cb.id`,
  );
  const r = rows[0];
  problem = { files: r.files, hiddenFiles: r.hidden_files, setupCommands: r.setup_commands, checks: r.checks };
  solution = r.solution_files;
});
after(() => pool.end());

const passedOrders = (results) => results.flatMap((r, i) => (r.passed ? [i + 1] : []));

test("paths outside the project and oversized files are rejected before anything runs", () => {
  for (const path of ["../etc/passwd", "/etc/passwd", "src/../../x", "src//x", "./x", "a\\b", ""]) {
    assert.throws(() => validateFiles({ [path]: "x" }), { code: "INVALID_FILES" }, path);
  }
  assert.throws(() => validateFiles({ "a.ts": "x".repeat(LIMITS.fileBytes + 1) }), { code: "INVALID_FILES" });
  assert.throws(() => validateFiles({ "a.ts": 42 }), { code: "INVALID_FILES" });
  assert.throws(() => validateFiles([]), { code: "INVALID_FILES" });
  assert.doesNotThrow(() => validateFiles({ "src/workers/payment.ts": "x", ".env.example": "y" }));
});

test("the broken code fails the checks the bug breaks; output only on failures", { skip }, async () => {
  const results = await runChecks(problem, {});
  assert.deepEqual(passedOrders(results), [2, 3, 4, 7]);
  assert.match(results[0].output, /Expected a second charge attempt/);
  for (const r of results) assert.equal("output" in r, !r.passed);
});

test("the solution passes every check", { skip }, async () => {
  const results = await runChecks(problem, solution);
  assert.deepEqual(passedOrders(results), [1, 2, 3, 4, 5, 6, 7]);
});

test("user files cannot replace the hidden checks (D10)", { skip }, async () => {
  const fake = 'import { test } from "node:test"; test("ok", () => {});';
  const results = await runChecks(problem, { ".bugdr/checks/1-retry.test.ts": fake });
  assert.equal(results[0].passed, false);
});

test("an endless loop is stopped by the time limit and the next check still runs", { skip }, async () => {
  const seconds = LIMITS.checkSeconds;
  LIMITS.checkSeconds = 3;
  try {
    const results = await runChecks(
      { files: { "ok.js": "" }, hiddenFiles: {}, setupCommands: null, checks: [
        { id: "loop", checkOrder: 1, command: "node -e 'for(;;){}'" },
        { id: "after", checkOrder: 2, command: "node ok.js" },
      ] },
      {},
    );
    assert.deepEqual(results[0], { checkId: "loop", passed: false, output: "Timed out after 3s" });
    assert.equal(results[1].passed, true);
  } finally {
    LIMITS.checkSeconds = seconds;
  }
});

test("no network, no root, read-only system; nothing reaches the host", { skip }, async () => {
  const results = await runChecks(
    { files: {}, hiddenFiles: {}, setupCommands: null, checks: [
      { id: "net", checkOrder: 1, command: "node -e \"fetch('http://example.com').then(() => process.exit(0), () => process.exit(1))\"" },
      { id: "root", checkOrder: 2, command: "test \"$(id -u)\" = 0" },
      { id: "write", checkOrder: 3, command: "touch /etc/x" },
      { id: "expected", checkOrder: 4, command: "echo hello", expectedOutput: "hello" },
    ] },
    {},
  );
  assert.deepEqual(results.map((r) => r.passed), [false, false, false, true]);
});

test("no runner container is left behind", { skip }, () => {
  assert.equal(leftovers(), "");
});
