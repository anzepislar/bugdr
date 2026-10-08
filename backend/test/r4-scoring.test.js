import { test } from "node:test";
import assert from "node:assert/strict";
import { finalPoints, lineChanges, timeMultiplier } from "../src/modules/scoring/scoring.js";

test("the example from 03: Medium, 30 min limit - 8 min → 375, 6 min → 500", () => {
  assert.equal(finalPoints(250, timeMultiplier(8 * 60, 30)), 375);
  assert.equal(finalPoints(250, timeMultiplier(6 * 60, 30)), 500);
});

test("time multiplier boundaries are 'under' (strict), and past the limit is 1x (D9)", () => {
  const limit = 40; // minutes → 2400 s
  assert.equal(timeMultiplier(599, limit), 2);
  assert.equal(timeMultiplier(600, limit), 1.5); // exactly 25%
  assert.equal(timeMultiplier(1199, limit), 1.5);
  assert.equal(timeMultiplier(1200, limit), 1.25);
  assert.equal(timeMultiplier(1799, limit), 1.25);
  assert.equal(timeMultiplier(1800, limit), 1);
  assert.equal(timeMultiplier(99_999, limit), 1);
});

test("points are rounded and include the efficiency factor (S3)", () => {
  assert.equal(finalPoints(250, 1.5, 1.8), 675); // 03 example
  assert.equal(finalPoints(100, 1.25), 125);
  assert.equal(finalPoints(250, 1.25, 0.75), 234); // 234.375
});

test("line changes: edits, new files and removed lines", () => {
  const original = { "a.ts": "one\ntwo\nthree\n", "b.ts": "x\n" };
  assert.deepEqual(lineChanges(original, original), { added: 0, deleted: 0 });
  assert.deepEqual(lineChanges(original, { ...original, "a.ts": "one\nTWO\nthree\n" }), { added: 1, deleted: 1 });
  assert.deepEqual(lineChanges(original, { ...original, "c.ts": "new\nfile\n" }), { added: 2, deleted: 0 });
  assert.deepEqual(lineChanges(original, { ...original, "a.ts": "one\n" }), { added: 0, deleted: 2 });
});
