import { test, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { getLevels, levelFor } from "../src/modules/levels/levels.js";

after(() => pool.end());

test("level boundaries from the seeded table", async () => {
  await migrate();
  const levels = await getLevels();
  assert.equal(levels.length, 7);

  const name = (points) => levelFor(points, levels).level.name;
  assert.equal(name(0), "Intern");
  assert.equal(name(499), "Intern");
  assert.equal(name(500), "Junior");
  assert.equal(name(29999), "Principal");
  assert.equal(name(30000), "Distinguished");

  assert.deepEqual(levelFor(0, levels).nextLevel, { name: "Junior", order: 2, minPoints: 500 });
  assert.equal(levelFor(30000, levels).nextLevel, null);
});
