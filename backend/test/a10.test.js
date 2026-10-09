import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { crc32, deflateRawSync } from "node:zlib";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { analysis } from "../src/modules/admin/analysis.service.js";
import { readZip } from "../src/modules/admin/zip.js";
import { hashPassword } from "../src/modules/auth/auth.service.js";

// The production test runs in Docker (like R3): needs `docker pull node:24-alpine`. Claude is never called here.

/** A minimal ZIP writer: { name: string | Buffer }, deflated unless `stored`. */
function zip(entries, { stored = false } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const body = stored ? data : deflateRawSync(data);
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(stored ? 0 : 8, 10);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, body);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const CODE = {
  "shop/package.json": '{ "name": "shop", "type": "module" }',
  "shop/src/total.ts": "export const total = (items: number[]): number => items.reduce((a, b) => a + b, 1);\n",
};
const ANALYSIS = {
  bug_summary: "reduce starts at 1 instead of 0.",
  title: "Cart totals are off",
  short_description: "Checkout service for a small shop.",
  codebase_context: "The checkout service adds up cart items.",
  incident_report: "Support: every total is one euro too high.",
  suggested_difficulty: "easy",
  difficulty_reasoning: "One file, one line.",
  checks: [
    { description: "Totals add up", check_type: "test", check_command: "node --test .bugdr/checks/total.test.ts", must_pass: true },
    { description: "Empty cart is zero", check_type: "test", check_command: "node --test .bugdr/checks/empty.test.ts", must_pass: true },
    { description: "Single item", check_type: "custom", check_command: "node .bugdr/checks/one.ts", must_pass: false },
  ],
  hidden_files: [{ path: ".bugdr/checks/total.test.ts", content: "import test from 'node:test';\n" }],
  tags: ["typescript", "math"],
};

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
let admin;
const upload = (body, { cookie = admin, type = "application/zip", name = "shop.zip" } = {}) =>
  fetch(`${base}/admin/problems/analyze?name=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "Content-Type": type, ...(cookie && { Cookie: cookie }) },
    body,
  });
const events = async (res) => (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
const failure = (list) => list.find((e) => e.status === "failed");
const originalAnalyze = analysis.analyze;

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
  analysis.analyze = originalAnalyze;
  server.close();
  await pool.end();
});

test("readZip: strips the top folder, skips node_modules/.git/lock/binary files, rejects ../ paths", () => {
  const { files, hash } = readZip(
    zip({
      "repo-main/src/a.ts": "export const a = 1;\n",
      "repo-main/README.md": "# Repo",
      "repo-main/node_modules/x/index.js": "x",
      "repo-main/.git/HEAD": "ref",
      "repo-main/package-lock.json": "{}",
      "repo-main/logo.png": Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      "repo-main/data.bin2": Buffer.from([0, 1, 2, 3]),
      "repo-main/docs/": "",
    }),
  );
  assert.deepEqual(files, { "src/a.ts": "export const a = 1;\n", "README.md": "# Repo" });
  assert.match(hash, /^[0-9a-f]{64}$/);
  // Same files, stored instead of deflated, other order → same hash.
  assert.equal(readZip(zip({ "README.md": "# Repo", "src/a.ts": "export const a = 1;\n" }, { stored: true })).hash, hash);

  assert.throws(() => readZip(zip({ "../evil.js": "x" })), { code: "INVALID_ZIP" });
  assert.throws(() => readZip(zip({ "a/../../evil.js": "x" })), { code: "INVALID_ZIP" });
  assert.throws(() => readZip(zip({ "/etc/passwd": "x" })), { code: "INVALID_ZIP" });
  assert.throws(() => readZip(Buffer.from("not a zip at all, just text")), { code: "INVALID_ZIP" });
  assert.throws(() => readZip(zip({ "node_modules/a.js": "x" })), { code: "INVALID_ZIP" }); // nothing left
});

test("analyze: admin only, ZIP body only, 10 MB limit, unsafe paths are 400 before anything runs", async () => {
  assert.equal((await upload(zip(CODE), { cookie: null })).status, 401);
  assert.equal((await upload(JSON.stringify({ a: 1 }), { type: "application/json" })).status, 400);
  assert.equal((await upload(Buffer.from("plain text"))).status, 400);
  assert.equal((await upload(Buffer.alloc(10 * 1024 * 1024 + 1))).status, 413);
  const res = await upload(zip({ "../x.ts": "export {}" }));
  assert.deepEqual([res.status, (await res.json()).error.code], [400, "INVALID_ZIP"]);
});

test("analyze: duplicate → production → analysis stream, then a draft with the code, checks and hidden files", async () => {
  let sent;
  analysis.analyze = async (files) => ((sent = files), structuredClone(ANALYSIS));
  const list = await events(await upload(zip(CODE)));
  assert.deepEqual(
    list.filter((e) => e.type === "stage").map((e) => `${e.stage}:${e.status}`),
    ["duplicate:running", "duplicate:passed", "production:running", "production:passed", "analysis:running", "analysis:passed"],
  );
  assert.deepEqual(Object.keys(sent).sort(), ["package.json", "src/total.ts"]);
  const done = list.at(-1);
  assert.equal(done.type, "done");
  assert.equal(done.analysis.title, "Cart totals are off");
  assert.equal(done.analysis.difficultyReasoning, "One file, one line.");
  assert.deepEqual(done.analysis.hiddenFiles, { ".bugdr/checks/total.test.ts": "import test from 'node:test';\n" });
  assert.deepEqual(done.analysis.checks.map((c) => c.checkOrder), [1, 2, 3]);

  const { rows } = await pool.query(
    `SELECT p.slug, p.is_published, p.category_id, p.base_points, p.time_limit_minutes, cb.repository_name,
       cb.repository_structure, cb.language, cb.content_hash IS NOT NULL AS hashed
     FROM problems p JOIN problem_codebase cb ON cb.problem_id = p.id WHERE p.id = $1`,
    [done.problemId],
  );
  assert.deepEqual(rows[0], {
    slug: "cart-totals-are-off",
    is_published: false,
    category_id: null,
    base_points: 100,
    time_limit_minutes: 15,
    repository_name: "shop",
    repository_structure: ["package.json", "src/total.ts"],
    language: "typescript",
    hashed: true,
  });
  // Review then saves the draft with PUT (A2): the code stays.
  const { problem } = await (await fetch(`${base}/admin/problems/${done.problemId}`, { headers: { Cookie: admin } })).json();
  const put = await fetch(`${base}/admin/problems/${done.problemId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: admin },
    body: JSON.stringify({ ...problem, categorySlug: "backend" }),
  });
  assert.equal(put.status, 200);
  const { rows: code } = await pool.query("SELECT files FROM problem_codebase WHERE problem_id = $1", [done.problemId]);
  assert.deepEqual(Object.keys(code[0].files).sort(), ["package.json", "src/total.ts"]);

  // The same code again stops at the duplicate check, before Docker or Claude.
  analysis.analyze = async () => assert.fail("Claude must not be called for a duplicate");
  const again = failure(await events(await upload(zip(CODE, { stored: true }))));
  assert.equal(again.stage, "duplicate");
  assert.match(again.message, /already added as "Cart totals are off"/);
});

test("analyze: npm dependencies and code that does not parse fail the production test", async () => {
  analysis.analyze = async () => assert.fail("Claude must not be called");
  const deps = failure(
    await events(await upload(zip({ "package.json": '{ "dependencies": { "express": "^5" } }', "a.js": "export {}" }))),
  );
  assert.deepEqual([deps.stage, deps.message.includes("express")], ["production", true]);

  const broken = failure(await events(await upload(zip({ "README.md": "# x", "src/a.ts": "export function f( {\n", "src/b.ts": "enum E { A }\n" }))));
  assert.equal(broken.stage, "production");
  assert.match(broken.message, /src\/a\.ts: .*\n.*src\/b\.ts: .*enum/s);
});

test("analyze: an unusable or failed analysis creates no draft and never leaks the API key", async () => {
  const before = (await pool.query("SELECT count(*)::int AS n FROM problems")).rows[0].n;
  const other = { "src/other.ts": "export const x = 2;\n" };

  analysis.analyze = async () => ({ ...ANALYSIS, title: "", checks: [{ nope: true }] });
  const bad = failure(await events(await upload(zip(other))));
  assert.equal(bad.stage, "analysis");
  assert.match(bad.message, /unusable analysis \(title, checks\)/);

  // The real call without a key.
  analysis.analyze = originalAnalyze;
  config.anthropicApiKey = "";
  const off = failure(await events(await upload(zip(other))));
  assert.deepEqual([off.stage, off.message], ["analysis", "ANTHROPIC_API_KEY is not set on the server"]);

  // A rejected key: the message names the setting, never the value.
  config.anthropicApiKey = "sk-ant-test-not-a-real-key";
  const rejected = await (await upload(zip(other))).text();
  assert.ok(!rejected.includes("sk-ant-test-not-a-real-key"));
  config.anthropicApiKey = "";

  assert.equal((await pool.query("SELECT count(*)::int AS n FROM problems")).rows[0].n, before);
});

test("A3: a new ZIP replaces only the code of a draft; text, checks and hidden tests stay", async () => {
  analysis.analyze = async () => structuredClone({ ...ANALYSIS, title: "Replace me" });
  const first = await events(await upload(zip({ "README.md": "# v1", "src/v1.ts": "export const v = 1;\n" })));
  const id = first.at(-1).problemId;
  const replace = (body, opts = {}) =>
    fetch(`${base}/admin/problems/${opts.id ?? id}/codebase?name=v2.zip`, {
      method: "PUT",
      headers: { "Content-Type": "application/zip", ...(opts.cookie !== null && { Cookie: admin }) },
      body,
    });
  const detail = async () => (await (await fetch(`${base}/admin/problems/${id}`, { headers: { Cookie: admin } })).json()).problem;
  const before = await detail();
  assert.deepEqual([before.repositoryName, before.paths], ["shop", ["README.md", "src/v1.ts"]]);

  analysis.analyze = async () => assert.fail("a code replacement never calls Claude");
  assert.equal((await replace(zip({ "a.ts": "x" }), { cookie: null })).status, 401);
  assert.equal((await replace(zip({ "a.ts": "x" }), { id: "00000000-0000-4000-8000-000000000000" })).status, 404);
  assert.equal((await replace(zip({ "../a.ts": "x" }))).status, 400);

  // Another problem's code is a duplicate; broken code fails the production test; the draft keeps its code.
  const dup = failure(await events(await replace(zip(CODE))));
  assert.match(dup.message, /already added as "Cart totals are off"/);
  const broken = failure(await events(await replace(zip({ "README.md": "# v2", "src/v2.ts": "export const = ;\n" }))));
  assert.equal(broken.stage, "production");
  assert.deepEqual((await detail()).paths, ["README.md", "src/v1.ts"]);

  // The same code as its own (re-upload) is fine; new code replaces the files and the hash.
  const list = await events(await replace(zip({ "README.md": "# v2", "src/v2.js": "export const v = 2;\n" })));
  assert.deepEqual(list.at(-1), { type: "done", paths: ["README.md", "src/v2.js"], repositoryName: "v2" });
  const after = await detail();
  assert.deepEqual([after.repositoryName, after.paths], ["v2", ["README.md", "src/v2.js"]]);
  assert.deepEqual(
    [after.title, after.checks.length, after.hiddenFiles],
    [before.title, before.checks.length, before.hiddenFiles],
  );
  const { rows } = await pool.query("SELECT language, files FROM problem_codebase WHERE problem_id = $1", [id]);
  assert.deepEqual([rows[0].language, rows[0].files["src/v2.js"]], ["javascript", "export const v = 2;\n"]);
  assert.equal(failure(await events(await replace(zip({ "README.md": "# v2", "src/v2.js": "export const v = 2;\n" })))), undefined);
  // The old code is free again: uploading it as a new problem is not a duplicate.
  analysis.analyze = async () => structuredClone({ ...ANALYSIS, title: "Old code again" });
  assert.equal(failure(await events(await upload(zip({ "README.md": "# v1", "src/v1.ts": "export const v = 1;\n" })))), undefined);

  await pool.query("UPDATE problems SET is_published = TRUE WHERE id = $1", [id]);
  assert.equal((await replace(zip({ "b.ts": "export {}" }))).status, 409);
});
