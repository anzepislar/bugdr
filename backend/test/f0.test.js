import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { app } from "../src/app.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
after(async () => {
  server.close();
  await pool.end();
});

test("health checks the database and returns 200", async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
});

test("unknown route returns the shared error format", async () => {
  const res = await fetch(`${base}/nope`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, "NOT_FOUND");
});

test("running migrate twice applies nothing the second time", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bugdr-mig-"));
  await writeFile(path.join(dir, "0001_f0_test.sql"), "CREATE TABLE f0_test (id INT);");
  try {
    assert.deepEqual(await migrate(dir), ["0001_f0_test.sql"]);
    assert.deepEqual(await migrate(dir), []);
  } finally {
    await pool.query("DROP TABLE IF EXISTS f0_test");
    await pool.query("DELETE FROM schema_migrations WHERE name = '0001_f0_test.sql'");
  }
});

test("TIMESTAMP columns read and write as UTC, whatever the Node timezone", async () => {
  const sent = new Date();
  const { rows } = await pool.query("SELECT now()::timestamp AS now, $1::timestamp AS back", [sent]);
  assert.ok(Math.abs(rows[0].now - sent) < 5000, `now() came back ${(rows[0].now - sent) / 3_600_000} h off`);
  assert.equal(rows[0].back.toISOString(), sent.toISOString());
});
