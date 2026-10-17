import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { hashPassword } from "../src/modules/auth/auth.service.js";
import { importChecksIdle } from "../src/modules/admin/problems.routes.js";

// Bulk import: POST /admin/import-problem, one entry of import.json per call.
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
let admin;
const call = (body, cookie = admin) =>
  fetch(`${base}/admin/import-problem`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }) },
    body: JSON.stringify(body),
  });

const entry = (patch = {}) => ({
  title: "Payment retries silently dropped",
  slug: "payment-retries-silently-dropped",
  short_description: "Retry jobs enqueue but never execute after the queue worker restarts",
  codebase_context: "Northstar is a checkout service.",
  incident_report: "Users reported failed payments not retrying.",
  difficulty: "medium",
  category_slug: "backend",
  time_limit_minutes: 45,
  bug_summary: "The worker loses its in-memory retry map on restart.",
  source_url: "https://github.com/org/repo/pull/123",
  tags: ["nodejs", "queues"],
  codebase: {
    repository_name: "northstar / checkout-worker",
    files: { "src/index.js": "require('./queue')", "src/queue.js": "const jobs = new Map();" },
    language: "javascript",
    framework: "express",
    solution_files: { "src/queue.js": "// fixed" },
    hidden_files: {},
    setup_commands: "npm install",
    run_command: "node src/index.js",
  },
  checks: [
    { description: "Server starts", check_type: "build", check_command: "node src/index.js", expected_output: "ok", must_pass: true },
    { description: "Retries run", check_type: "test", check_command: "node --test" },
  ],
  ...patch,
});

before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems CASCADE");
  config.adminEmail = "admin@bugdr.app";
  config.adminPasswordHash = await hashPassword("admin password 1");
  const res = await fetch(`${base}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@bugdr.app", password: "admin password 1" }),
  });
  admin = res.headers.get("set-cookie").split(";")[0];
});
after(async () => {
  await importChecksIdle();
  server.close();
  await pool.end();
});

test("import needs the admin session", async () => {
  assert.equal((await call(entry(), null)).status, 401);
});

test("import writes a github draft with its codebase, checks and tags", async () => {
  const res = await call(entry());
  assert.equal(res.status, 201);
  const { id, slug, isPublished } = await res.json();
  assert.deepEqual({ slug, isPublished }, { slug: "payment-retries-silently-dropped", isPublished: false });

  const { rows: [p] } = await pool.query(
    `SELECT p.source, p.source_url, p.base_points, c.slug AS category, cb.language, cb.framework, cb.solution_files,
       cb.setup_commands, cb.run_command, cb.repository_structure, cb.content_hash IS NOT NULL AS hashed
     FROM problems p JOIN problem_categories c ON c.id = p.category_id JOIN problem_codebase cb ON cb.problem_id = p.id
     WHERE p.id = $1`,
    [id],
  );
  assert.deepEqual(p, {
    source: "github",
    source_url: "https://github.com/org/repo/pull/123",
    base_points: 250,
    category: "backend",
    language: "javascript",
    framework: "express",
    solution_files: { "src/queue.js": "// fixed" },
    setup_commands: "npm install",
    run_command: "node src/index.js",
    repository_structure: ["src/index.js", "src/queue.js"],
    hashed: true,
  });
  const { rows: checks } = await pool.query(
    "SELECT check_order, expected_output, must_pass FROM problem_checks WHERE problem_id = $1 ORDER BY check_order",
    [id],
  );
  assert.deepEqual(checks, [
    { check_order: 1, expected_output: "ok", must_pass: true },
    { check_order: 2, expected_output: null, must_pass: true },
  ]);
  const { rows: tags } = await pool.query("SELECT tag FROM problem_tags WHERE problem_id = $1 ORDER BY tag", [id]);
  assert.deepEqual(tags.map((t) => t.tag), ["nodejs", "queues"]);
});

test("the same entry again is refused, nothing half-written", async () => {
  const res = await call(entry({ slug: "another-slug" }));
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, "DUPLICATE_CODEBASE");
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM problems");
  assert.equal(rows[0].n, 1);
});

test("invalid entries get a 400 with the fields", async () => {
  const res = await call(entry({ slug: "Bad Slug", difficulty: "insane", checks: "x", codebase: { files: {} } }));
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.ok(error.details.difficulty && error.details.checks);
  const res2 = await call(entry({ slug: "Bad Slug", codebase: { files: {} } }));
  assert.deepEqual(Object.keys((await res2.json()).error.details).sort(), ["files", "slug"]);
  const res3 = await call(entry({ slug: "x", codebase: { files: { "../etc/passwd": "x" } } }));
  assert.equal((await res3.json()).error.code, "INVALID_FILES");
});

const bulk = (body) =>
  fetch(`${base}/admin/bulk-import-problem`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin },
    body: JSON.stringify(body),
  });
const withHidden = (patch = {}) =>
  entry({ codebase: { ...entry().codebase, files: { "src/x.js": `// ${Math.random()}` }, hidden_files: { ".bugdr/checks/x.test.js": "t" } }, ...patch });

test("bulk import confirm saves a draft with a pending check run; import-problem has none", async () => {
  assert.equal((await fetch(`${base}/admin/bulk-import-problem`, { method: "POST" })).status, 401);
  const res = await bulk(withHidden({ slug: "pending-on-import" }));
  assert.equal(res.status, 201);
  const saved = await res.json();
  assert.deepEqual([saved.isPublished, saved.importCheckStatus], [false, "pending"]);
  const draft = await (await call(withHidden({ slug: "still-a-draft" }))).json();
  const { rows } = await pool.query("SELECT import_check_status FROM problems WHERE id = $1", [draft.id]);
  assert.deepEqual([draft.isPublished, rows[0].import_check_status], [false, null]);
  await importChecksIdle();
});

// Runs the checks in Docker (like a4): needs `docker pull node:24-alpine`.
const CODE = {
  "package.json": '{ "type": "module" }',
  "src/total.js": "export const total = (items) => items.reduce((a, b) => a + b, 1);\n",
};
const TOTAL_TEST = `import test from "node:test";
import assert from "node:assert/strict";
import { total } from "../../src/total.js";
test("adds up", () => assert.equal(total([1, 2]), 3));
`;
const dockerEntry = (slug, checks) =>
  entry({
    slug,
    title: slug,
    codebase: { files: CODE, hidden_files: { ".bugdr/checks/total.test.js": TOTAL_TEST }, language: "javascript" },
    checks,
  });
const catchesBug = { description: "Totals add up", check_type: "test", check_command: "node --test .bugdr/checks/total.test.js", must_pass: true };
const alwaysGreen = { description: "Always green", check_type: "custom", check_command: "node -e 'process.exit(0)'", must_pass: true };
const state = async (id) =>
  (await pool.query("SELECT is_published, import_check_status, import_check_error FROM problems WHERE id = $1", [id])).rows[0];

test("background check run: publishes when every check fails on the buggy code, else keeps the draft with why", async () => {
  const good = await (await bulk(dockerEntry("catches-the-bug", [catchesBug]))).json();
  CODE["src/total.js"] += "// another codebase\n";
  const bad = await (await bulk(dockerEntry("misses-the-bug", [catchesBug, alwaysGreen]))).json();
  await importChecksIdle();
  assert.deepEqual(await state(good.id), { is_published: true, import_check_status: "passed", import_check_error: null });
  assert.deepEqual(await state(bad.id), {
    is_published: false,
    import_check_status: "failed",
    import_check_error: "Passes on the buggy code, so it does not catch the bug: Always green",
  });
});

test("bulk import refuses a problem users could not run: no role or no hidden tests", async () => {
  const noRole = await bulk(withHidden({ slug: "no-role", category_slug: null }));
  assert.equal(noRole.status, 400);
  assert.ok((await noRole.json()).error.details.categorySlug);
  const noTests = await bulk(entry({ slug: "no-tests", codebase: { ...entry().codebase, files: { "src/y.js": "y" } } }));
  assert.equal(noTests.status, 400);
  assert.ok((await noTests.json()).error.details.hiddenFiles);
});
