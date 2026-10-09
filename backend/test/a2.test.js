import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { hashPassword } from "../src/modules/auth/auth.service.js";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
let admin;
const call = (method, path, body, cookie = admin) =>
  fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }) },
    body: body && JSON.stringify(body),
  });
const code = async (res) => [res.status, (await res.json()).error?.code];

const draft = (patch = {}) => ({
  title: "Refresh tokens always expired",
  shortDescription: "Auth service for a SaaS platform.",
  codebaseContext: "The authentication service.",
  incidentReport: "Users are logged out on every reload.",
  difficulty: "medium",
  categorySlug: "backend",
  timeLimitMinutes: 30,
  tags: ["JWT", "jwt", "auth"],
  checks: [
    { description: "Unit tests pass", checkType: "test", checkCommand: "npm test", mustPass: true },
    { description: "No lint errors", checkType: "lint", checkCommand: "npm run lint", mustPass: false },
  ],
  hiddenFiles: { "test/refresh.test.js": "test('x', () => {});" },
  bugSummary: "exp is in seconds, Date.now() in ms.",
  ...patch,
});

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

test("admin problem endpoints need the admin session", async () => {
  assert.deepEqual(await code(await call("GET", "/admin/problems", null, null)), [401, "UNAUTHENTICATED"]);
  assert.deepEqual(await code(await call("POST", "/admin/problems", draft(), null)), [401, "UNAUTHENTICATED"]);
});

test("POST creates a draft: slug from the title, base points from the difficulty, never published", async () => {
  const res = await call("POST", "/admin/problems", { ...draft(), isPublished: true, slug: "ignored" });
  assert.equal(res.status, 201);
  const saved = await res.json();
  assert.deepEqual({ slug: saved.slug, isPublished: saved.isPublished }, { slug: "refresh-tokens-always-expired", isPublished: false });

  const { problem } = await (await call("GET", `/admin/problems/${saved.id}`)).json();
  assert.equal(problem.categorySlug, "backend");
  assert.deepEqual(problem.tags, ["auth", "jwt"]);
  assert.deepEqual(
    problem.checks.map((c) => [c.checkOrder, c.checkType, c.mustPass]),
    [
      [1, "test", true],
      [2, "lint", false],
    ],
  );
  assert.deepEqual(problem.hiddenFiles, { "test/refresh.test.js": "test('x', () => {});" });
  assert.equal(problem.bugSummary, "exp is in seconds, Date.now() in ms.");
  const { rows } = await pool.query("SELECT base_points FROM problems WHERE id = $1", [saved.id]);
  assert.equal(rows[0].base_points, 250);

  // A draft never reaches users.
  assert.equal((await call("GET", `/problems/${saved.slug}`, null, null)).status, 404);
});

test("PUT replaces a draft; the same title twice is 409; a published problem is 409", async () => {
  const { id } = await (await call("POST", "/admin/problems", draft({ title: "Second draft" }))).json();
  const res = await call(
    "PUT",
    `/admin/problems/${id}`,
    draft({ title: "Second draft, renamed", difficulty: "hard", tags: [], checks: [], hiddenFiles: {} }),
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).slug, "second-draft-renamed");
  const { problem } = await (await call("GET", `/admin/problems/${id}`)).json();
  assert.deepEqual([problem.difficulty, problem.tags, problem.checks, problem.hiddenFiles], ["hard", [], [], {}]);
  const { rows } = await pool.query("SELECT base_points FROM problems WHERE id = $1", [id]);
  assert.equal(rows[0].base_points, 500);

  assert.deepEqual(await code(await call("POST", "/admin/problems", draft({ title: "Refresh tokens: always expired!" }))), [
    409,
    "SLUG_TAKEN",
  ]);
  assert.deepEqual(await code(await call("PUT", `/admin/problems/${id}`, draft())), [409, "SLUG_TAKEN"]);

  await pool.query("UPDATE problems SET is_published = TRUE WHERE id = $1", [id]);
  assert.deepEqual(await code(await call("PUT", `/admin/problems/${id}`, draft({ title: "Another" }))), [
    409,
    "PROBLEM_PUBLISHED",
  ]);
  assert.deepEqual(await code(await call("PUT", "/admin/problems/00000000-0000-4000-8000-000000000000", draft())), [
    404,
    "NOT_FOUND",
  ]);
});

test("invalid fields are 400 with a message per field", async () => {
  const res = await call(
    "POST",
    "/admin/problems",
    draft({
      title: "!!!",
      difficulty: "trivial",
      categorySlug: "nope",
      timeLimitMinutes: 0,
      checks: [{ description: "", checkType: "test", checkCommand: "npm test", mustPass: true }],
      hiddenFiles: { "../etc/passwd": "x" },
    }),
  );
  assert.equal(res.status, 400);
  const { details } = (await res.json()).error;
  assert.deepEqual(Object.keys(details).sort(), ["checks", "difficulty", "hiddenFiles", "timeLimitMinutes", "title"]);
  assert.deepEqual((await (await call("POST", "/admin/problems", draft({ categorySlug: "nope" }))).json()).error.details, {
    categorySlug: "Unknown role",
  });
});

test("GET /admin/problems lists drafts and published problems with their solve count", async () => {
  const { problems } = await (await call("GET", "/admin/problems")).json();
  assert.deepEqual(
    problems.map((p) => [p.title, p.isPublished, p.solveCount]).sort(),
    [
      ["Refresh tokens always expired", false, 0],
      ["Second draft, renamed", true, 0],
    ],
  );
});
