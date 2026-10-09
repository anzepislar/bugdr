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

const draft = (patch = {}) => ({
  title: "Path problem",
  shortDescription: "s",
  codebaseContext: "c",
  incidentReport: "i",
  difficulty: "easy",
  categorySlug: "backend",
  timeLimitMinutes: 15,
  tags: [],
  checks: [],
  hiddenFiles: {},
  bugSummary: "",
  ...patch,
});
const publish = (id) => pool.query("UPDATE problems SET is_published = TRUE WHERE id = $1", [id]);
const slugs = (list) => list.map((p) => p.slug).sort();

let pathId, generalId;

before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems, contests CASCADE");
  config.adminEmail = "admin@bugdr.app";
  config.adminPasswordHash = await hashPassword("admin password 1");
  const res = await call("POST", "/admin/login", { email: "admin@bugdr.app", password: "admin password 1" }, null);
  admin = res.headers.get("set-cookie").split(";")[0];

  pathId = (await (await call("POST", "/admin/problems", draft({ careerPaths: ["backend", "database", "backend"] }))).json()).id;
  generalId = (await (await call("POST", "/admin/problems", draft({ title: "General problem" }))).json()).id;
  await publish(pathId);
  await publish(generalId);
});
after(async () => {
  server.close();
  await pool.end();
});

test("a problem in two paths has two rows; no paths = a general problem", async () => {
  const { problem } = await (await call("GET", `/admin/problems/${pathId}`)).json();
  assert.deepEqual(problem.careerPaths, ["backend", "database"]);
  const { problems } = await (await call("GET", "/admin/problems")).json();
  assert.deepEqual(
    Object.fromEntries(problems.map((p) => [p.slug, p.careerPaths])),
    { "path-problem": ["backend", "database"], "general-problem": [] },
  );
});

test("a path problem is not on /problems or in the dashboard feed; the general one stays", async () => {
  assert.deepEqual(slugs((await (await call("GET", "/problems", null, null)).json()).problems), ["general-problem"]);
  assert.deepEqual(slugs((await (await call("GET", "/dashboard", null, null)).json()).feed), ["general-problem"]);
});

test("a contest never takes a path problem", async () => {
  assert.deepEqual(slugs((await (await call("GET", "/admin/contests/problem-options")).json()).problems), ["general-problem"]);
  const res = await call("POST", "/admin/contests", {
    title: "C",
    type: "weekly",
    description: "d",
    startsAt: null,
    endsAt: null,
    problemSlugs: ["path-problem"],
    rewardType: null,
    rewardDescription: null,
  });
  assert.equal(res.status, 400);
  assert.deepEqual((await res.json()).error.details, { problemSlugs: "Unknown, unpublished or career path problem" });
});

test("saving a draft replaces its paths; unknown or malformed roles are 400", async () => {
  const id = (await (await call("POST", "/admin/problems", draft({ title: "Draft", careerPaths: ["frontend"] }))).json()).id;
  assert.equal((await call("PUT", `/admin/problems/${id}`, draft({ title: "Draft", careerPaths: ["ai-engineer"] }))).status, 200);
  assert.deepEqual((await (await call("GET", `/admin/problems/${id}`)).json()).problem.careerPaths, ["ai-engineer"]);
  assert.equal((await call("PUT", `/admin/problems/${id}`, draft({ title: "Draft", careerPaths: [] }))).status, 200);
  assert.deepEqual((await (await call("GET", `/admin/problems/${id}`)).json()).problem.careerPaths, []);

  for (const careerPaths of [["devops"], "backend", [1]]) {
    const res = await call("PUT", `/admin/problems/${id}`, draft({ title: "Draft", careerPaths }));
    assert.equal(res.status, 400, JSON.stringify(careerPaths));
    assert.ok((await res.json()).error.details.careerPaths);
  }
});
