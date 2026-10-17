import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { hashPassword } from "../src/modules/auth/auth.service.js";
import { enrichAi, Rejection } from "../src/modules/admin/enrich.service.js";
import { isBugFix, sourceFiles } from "../src/modules/admin/scrape.service.js";

// Bulk import pipeline: POST /admin/scrape (GitHub, stubbed fetch) → POST /admin/enrich (Claude, stubbed) →
// the enriched problem saves through POST /admin/import-problem.
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
let admin;
const call = (path, body, cookie = admin) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }) },
    body: JSON.stringify(body),
  });
const events = async (res) =>
  (await res.text())
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

const realFetch = globalThis.fetch;
/** Answers GitHub API calls from `routes` (path → JSON or text), everything else goes to the real fetch. */
function stubGithub(routes) {
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith("https://api.github.com")) return realFetch(url, init);
    const path = String(url).slice("https://api.github.com".length);
    const body = routes[path];
    if (body === undefined) return new Response("not found", { status: 404 });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200 });
  };
}

const patch = "@@ -1,3 +1,3 @@\n-  return a\n+  return b";
const pr = (number, title, extra = {}) => ({
  number,
  title,
  merged_at: "2026-01-01T00:00:00Z",
  html_url: `https://github.com/acme/lib/pull/${number}`,
  body: "Fixes the bug",
  base: { sha: "abc" },
  ...extra,
});

const problem = {
  title: "Retries vanish after restart",
  slug: "retries-vanish-after-restart",
  short_description: "A job queue loses retries.",
  codebase_context: "A small job queue.",
  incident_report: "Failed jobs never run again.",
  bug_summary: "The retry map lives in memory.",
  difficulty: "medium",
  category_slug: "backend",
  time_limit_minutes: 30,
  tags: ["queues"],
  codebase: {
    repository_name: "acme/lib",
    files: [{ path: "src/queue.js", content: "module.exports = {}" }],
    solution_files: [{ path: "src/queue.js", content: "module.exports = { fixed: true }" }],
    hidden_files: [{ path: ".bugdr/checks/queue.test.js", content: "require('node:test')" }],
    language: "javascript",
    framework: "",
    setup_commands: "",
    run_command: "",
  },
  checks: [{ description: "Retries run", check_type: "test", check_command: "node --test .bugdr/checks", must_pass: true }],
};

before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems CASCADE");
  config.adminEmail = "admin@bugdr.app";
  config.adminPasswordHash = await hashPassword("admin password 1");
  const res = await call("/admin/login", { email: "admin@bugdr.app", password: "admin password 1" }, null);
  admin = res.headers.get("set-cookie").split(";")[0];
});
after(async () => {
  globalThis.fetch = realFetch;
  config.anthropicApiKey = "";
  server.close();
  await pool.end();
});

test("bug-fix filter: merged fixes only, no docs or chores", () => {
  assert.equal(isBugFix(pr(1, "Fix off-by-one in parser")), true);
  assert.equal(isBugFix(pr(2, "fix(docs): typo")), false);
  assert.equal(isBugFix(pr(3, "Add streaming API")), false);
  assert.equal(isBugFix(pr(4, "Fix crash", { merged_at: null })), false);
});

test("source files: 1-3 modified JS files, tests and docs ignored, anything else rejects the PR", () => {
  const js = (filename, changes = 2) => ({ filename, status: "modified", changes, patch });
  assert.deepEqual(sourceFiles([js("lib/a.js"), js("test/a.test.js"), js("README.md")]).map((f) => f.filename), ["lib/a.js"]);
  assert.equal(sourceFiles([js("lib/a.js"), js("src/node_file.cc")]), null, "native code");
  assert.equal(sourceFiles([js("test/a.js")]), null, "tests only");
  assert.equal(sourceFiles([js("a.js"), js("b.js"), js("c.js"), js("d.js")]), null, "too many files");
  assert.equal(sourceFiles([js("lib/a.js", 500)]), null, "too large");
});

test("scrape and enrich need the admin session and valid input", async () => {
  assert.equal((await call("/admin/scrape", { repos: ["acme/lib"] }, null)).status, 401);
  assert.equal((await call("/admin/scrape", { repos: [] })).status, 400);
  assert.equal((await call("/admin/scrape", { repos: ["not a repo"] })).status, 400);
  assert.equal((await call("/admin/enrich", { candidates: [] })).status, 400);
  const res = await call("/admin/enrich", { candidates: [{ pr_url: "x", files: [] }] });
  assert.equal(res.status, 503, "no ANTHROPIC_API_KEY in tests");
});

test("scrape streams candidates with the buggy file, skips imported PRs and reports missing repos", async () => {
  await pool.query(
    `INSERT INTO problems (title, slug, short_description, codebase_context, incident_report, difficulty, base_points,
       time_limit_minutes, source_url)
     VALUES ('Old', 'old', 'Old', 'x', 'x', 'easy', 100, 15, 'https://github.com/acme/lib/pull/2')`,
  );
  stubGithub({
    "/repos/acme/lib/pulls?state=closed&sort=created&direction=desc&per_page=100&page=1": [
      pr(1, "Fix retry loop"),
      pr(2, "Fix already imported"),
      pr(3, "Update docs"),
    ],
    "/repos/acme/lib/pulls/1/files?per_page=100": [
      { filename: "lib/retry.js", status: "modified", changes: 2, patch },
      { filename: "test/retry.test.js", status: "modified", changes: 5, patch },
    ],
    "/repos/acme/lib/contents/lib/retry.js?ref=abc": "function retry(a, b) { return a }",
  });
  try {
    const out = await events(await call("/admin/scrape", { repos: ["acme/lib", "acme/missing"] }));
    assert.deepEqual(
      out.filter((e) => e.type === "repo_done").map((e) => [e.repo, e.fetched, e.accepted, e.duplicates]),
      [["acme/lib", 3, 1, 1]],
    );
    assert.equal(out.find((e) => e.type === "repo_error").repo, "acme/missing");
    const done = out.at(-1);
    assert.equal(done.type, "done");
    assert.equal(done.duplicates, 1);
    assert.deepEqual(done.candidates[0].files, [
      { path: "lib/retry.js", patch, before: "function retry(a, b) { return a }" },
      { path: "test/retry.test.js", patch, before: null },
    ]);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("enrich: accepted problems in import.json shape, rejections and AI failures counted, then importable", async () => {
  config.anthropicApiKey = "test-key";
  const original = enrichAi.analyze;
  enrichAi.analyze = async (c) => {
    if (c.pr_number === 1) return { accepted: true, rejection_reason: "", problem };
    if (c.pr_number === 2) return { accepted: false, rejection_reason: "Docs only", problem: null };
    throw new Rejection("The answer was cut off (problem too large)");
  };
  const candidate = (n) => ({ repo: "acme/lib", pr_number: n, pr_url: `https://github.com/acme/lib/pull/${n}`, title: "Fix", body: "", files: [] });
  try {
    const out = await events(await call("/admin/enrich", { candidates: [candidate(1), candidate(2), candidate(3)] }));
    assert.deepEqual(
      out.filter((e) => e.type === "rejected").map((e) => e.reason),
      ["Docs only", "The answer was cut off (problem too large)"],
    );
    const done = out.at(-1);
    assert.deepEqual([done.type, done.total, done.accepted, done.rejected], ["enrich_done", 3, 1, 2]);
    const entry = done.problems[0];
    assert.equal(entry.source_url, "https://github.com/acme/lib/pull/1");
    assert.deepEqual(entry.codebase.files, { "src/queue.js": "module.exports = {}" });
    assert.deepEqual(entry.codebase.hidden_files, { ".bugdr/checks/queue.test.js": "require('node:test')" });
    assert.equal(entry.codebase.framework, null);

    const saved = await call("/admin/import-problem", entry);
    assert.equal(saved.status, 201);
    const { rows } = await pool.query("SELECT source, is_published FROM problems WHERE id = $1", [(await saved.json()).id]);
    assert.deepEqual(rows[0], { source: "github", is_published: false });
  } finally {
    enrichAi.analyze = original;
    config.anthropicApiKey = "";
  }
});
