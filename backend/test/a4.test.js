import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { hashPassword } from "../src/modules/auth/auth.service.js";

// Runs the checks in Docker (like R3): needs `docker pull node:24-alpine`.

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
let admin;
const call = (method, path, body, cookie = admin) =>
  fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }) },
    body: body && JSON.stringify(body),
  });
const events = async (res) => (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
const verified = async (id) => (await (await call("GET", `/admin/problems/${id}`)).json()).problem.checksVerified;

const CODE = {
  "package.json": '{ "type": "module" }',
  "src/total.ts": "export const total = (items: number[]): number => items.reduce((a, b) => a + b, 1);\n",
};
const TEST = `import test from "node:test";
import assert from "node:assert/strict";
import { total } from "../../src/total.ts";
test("adds up", () => assert.equal(total([1, 2]), 3));
`;
const draft = (title, checks) => ({
  title,
  shortDescription: "Checkout.",
  codebaseContext: "Adds up carts.",
  incidentReport: "Totals are one too high.",
  difficulty: "easy",
  categorySlug: "backend",
  timeLimitMinutes: 15,
  tags: [],
  checks,
  hiddenFiles: { ".bugdr/checks/total.test.ts": TEST },
  bugSummary: "",
});
const failing = { description: "Totals add up", checkType: "test", checkCommand: "node --test .bugdr/checks/total.test.ts", mustPass: true };
const passing = { description: "Always green", checkType: "custom", checkCommand: "node -e 'process.exit(0)'", mustPass: true };

/** A draft with code (as A10 would create it). */
async function withCode(title, checks) {
  const { id } = await (await call("POST", "/admin/problems", draft(title, checks))).json();
  await pool.query("UPDATE problem_codebase SET files = $2 WHERE problem_id = $1", [id, CODE]);
  return id;
}

before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems CASCADE");
  config.adminEmail = "admin@bugdr.app";
  config.adminPasswordHash = await hashPassword("admin password 1");
  const res = await call("POST", "/admin/login", { email: "admin@bugdr.app", password: "admin password 1" }, null);
  admin = res.headers.get("set-cookie").split(";")[0];
});
after(async () => {
  server.close();
  await pool.end();
});

test("dry-run: admin only; a draft without code or checks cannot run", async () => {
  const { id } = await (await call("POST", "/admin/problems", draft("No code yet", [failing]))).json();
  assert.equal((await call("POST", `/admin/problems/${id}/dry-run`, null, null)).status, 401);
  assert.equal((await call("POST", `/admin/problems/${id}/dry-run`)).status, 409); // NO_CODE
  const empty = await withCode("No checks", []);
  assert.equal((await call("POST", `/admin/problems/${empty}/dry-run`)).status, 409); // NO_CHECKS
  assert.equal((await call("POST", "/admin/problems/00000000-0000-4000-8000-000000000000/dry-run")).status, 404);
});

test("dry-run: every check fails on the buggy code → ok, recorded until the draft changes", async () => {
  const id = await withCode("All fail", [failing, { ...failing, description: "Again" }]);
  assert.equal(await verified(id), false);
  const list = await events(await call("POST", `/admin/problems/${id}/dry-run`));
  assert.deepEqual(list[0].checks.map((c) => c.description), ["Totals add up", "Again"]);
  assert.deepEqual(
    list.slice(1).map((e) => e.type),
    ["running", "result", "running", "result", "done"],
  );
  const results = list.filter((e) => e.type === "result");
  assert.ok(results.every((r) => r.passed === false && r.output.includes("adds up")));
  assert.deepEqual(list.at(-1), { type: "done", ok: true });
  assert.equal(await verified(id), true);

  // Any save (even the same content) is a new version: the run must be repeated.
  const { problem } = await (await call("GET", `/admin/problems/${id}`)).json();
  assert.equal((await call("PUT", `/admin/problems/${id}`, problem)).status, 200);
  assert.equal(await verified(id), false);
});

test("dry-run: a check that passes on the buggy code makes the run fail", async () => {
  const id = await withCode("One passes", [failing, passing]);
  const list = await events(await call("POST", `/admin/problems/${id}/dry-run`));
  const results = list.filter((e) => e.type === "result");
  assert.deepEqual(results.map((r) => r.passed), [false, true]);
  assert.equal(results[1].output, undefined);
  assert.deepEqual(list.at(-1), { type: "done", ok: false });
  assert.equal(await verified(id), false);
});

// A5: publish (runs the checks again) and unpublish.
const publish = async (id) => events(await call("POST", `/admin/problems/${id}/publish`));
const code = async (res) => [res.status, (await res.json()).error?.code];

test("publish: needs a role, 3 checks and hidden tests - checked before anything runs", async () => {
  const noRole = await withCode("No role", [failing, failing, failing]);
  await pool.query("UPDATE problems SET category_id = NULL WHERE id = $1", [noRole]);
  assert.deepEqual(await code(await call("POST", `/admin/problems/${noRole}/publish`)), [409, "NO_ROLE"]);
  const two = await withCode("Two checks", [failing, failing]);
  assert.deepEqual(await code(await call("POST", `/admin/problems/${two}/publish`)), [409, "TOO_FEW_CHECKS"]);
  const noTests = await withCode("No hidden tests", [failing, failing, failing]);
  await pool.query("UPDATE problem_codebase SET hidden_files = '{}' WHERE problem_id = $1", [noTests]);
  assert.deepEqual(await code(await call("POST", `/admin/problems/${noTests}/publish`)), [409, "NO_HIDDEN_FILES"]);
  assert.equal((await call("POST", `/admin/problems/${two}/publish`, null, null)).status, 401);
});

test("publish: a check that passes on the buggy code blocks publishing", async () => {
  const id = await withCode("Blocked", [failing, failing, passing]);
  assert.deepEqual((await publish(id)).at(-1), { type: "done", ok: false, published: false });
  const { rows } = await pool.query("SELECT is_published FROM problems WHERE id = $1", [id]);
  assert.equal(rows[0].is_published, false);
});

test("publish → visible to users and locked for edits; unpublish → a draft again; contests block unpublish", async () => {
  const id = await withCode("Ready to ship", [failing, { ...failing, description: "B" }, { ...failing, description: "C" }]);
  const list = await publish(id);
  assert.equal(list.filter((e) => e.type === "result").length, 3);
  assert.deepEqual(list.at(-1), { type: "done", ok: true, published: true, slug: "ready-to-ship" });
  assert.equal((await call("GET", "/problems/ready-to-ship", null, null)).status, 200);
  assert.ok((await (await call("GET", "/problems", null, null)).json()).problems.some((p) => p.slug === "ready-to-ship"));
  assert.equal(await verified(id), true);
  const { problem } = await (await call("GET", `/admin/problems/${id}`)).json();
  assert.deepEqual(await code(await call("PUT", `/admin/problems/${id}`, problem)), [409, "PROBLEM_PUBLISHED"]);
  assert.deepEqual(await code(await call("POST", `/admin/problems/${id}/publish`)), [409, "ALREADY_PUBLISHED"]);

  // In a contest that has not ended: stays published.
  const { rows: contest } = await pool.query(
    `INSERT INTO contests (title, type, starts_at, ends_at) VALUES ('Weekly', 'weekly', now() - interval '1 day', now() + interval '1 day')
     RETURNING id`,
  );
  await pool.query("INSERT INTO contest_problems (contest_id, problem_id) VALUES ($1, $2)", [contest[0].id, id]);
  assert.deepEqual(await code(await call("POST", `/admin/problems/${id}/unpublish`)), [409, "IN_CONTEST"]);
  await pool.query("UPDATE contests SET starts_at = now() - interval '3 days', ends_at = now() - interval '2 days' WHERE id = $1", [contest[0].id]);

  const res = await call("POST", `/admin/problems/${id}/unpublish`);
  assert.deepEqual(await res.json(), { id, slug: "ready-to-ship", isPublished: false });
  assert.equal((await call("GET", "/problems/ready-to-ship", null, null)).status, 404);
  assert.equal(await verified(id), false);
  assert.deepEqual(await code(await call("POST", `/admin/problems/${id}/unpublish`)), [409, "NOT_PUBLISHED"]);
  assert.equal((await call("PUT", `/admin/problems/${id}`, problem)).status, 200); // editable again
  assert.equal((await publish(id)).at(-1).published, true);
});
