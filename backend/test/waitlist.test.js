import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
const join = (body) =>
  fetch(`${base}/waitlist`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

before(async () => {
  await migrate();
  await pool.query("TRUNCATE waitlist");
});
after(async () => {
  server.close();
  await pool.end();
});

test("joining saves the email once, lowercased, and the count follows", async () => {
  assert.equal((await join({ email: " Ana@Example.com " })).status, 201);
  const again = await join({ email: "ana@example.com" });
  assert.equal(again.status, 201);
  assert.deepEqual(await again.json(), { success: true });
  const { rows } = await pool.query("SELECT email FROM waitlist");
  assert.deepEqual(rows, [{ email: "ana@example.com" }]);
  assert.deepEqual(await (await fetch(`${base}/waitlist`)).json(), { count: 1 });
});

test("an invalid email is a 400 with a message", async () => {
  for (const email of ["", "nope", "a@b", 42, "x".repeat(250) + "@a.co"]) {
    const res = await join({ email });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.message, "Please enter a valid email address.");
  }
});
