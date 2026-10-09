import { test } from "node:test";
import assert from "node:assert/strict";
import { stageProgress as progress } from "../src/modules/careerPaths/careerPaths.js";

// K2 (D66 e): the thresholds from the user (= the seed of migration 0025), on the last 5 solves (Hard: 3).
const T = {
  easy: { solves: 5, efficiency: 1.2, prompts: 10, firstRun: 0.4 },
  medium: { solves: 5, efficiency: 1.4, prompts: 7, firstRun: 0.5, timeMultiplier: 1.25 },
  hard: { solves: 3, efficiency: 1.6, prompts: 5, firstRun: 0.6, timeMultiplier: 1.5 },
};
const stageProgress = (stage, solves, total) => progress(T[stage], stage, solves, total);
const good = { efficiency: 1.3, prompts: 6, firstRun: true, timeMultiplier: 2 };
const times = (n, s) => Array.from({ length: n }, () => s);

test("Easy → Medium: 5 solves, efficiency ≥ 1.2, prompts ≤ 10, first run ≥ 40% (no time rule)", () => {
  const p = stageProgress("easy", times(5, good), 5);
  assert.equal(p.met, true);
  assert.equal(p.nextStage, "medium");
  assert.deepEqual(p.metrics.map((m) => m.key), ["efficiency", "prompts", "firstRun"]);
  // Exactly on every target still passes: 1.2 · 10 prompts · 2 of 5 first runs.
  const edge = [...times(2, { ...good, efficiency: 1.2, prompts: 10 }), ...times(3, { ...good, efficiency: 1.2, prompts: 10, firstRun: false })];
  assert.equal(stageProgress("easy", edge, 5).met, true);
});

test("one missing condition keeps the stage", () => {
  assert.equal(stageProgress("easy", times(4, good), 4).met, false, "only 4 solves");
  assert.equal(stageProgress("easy", times(5, { ...good, prompts: 11 }), 5).met, false, "prompts");
  assert.equal(stageProgress("easy", times(5, { ...good, efficiency: 1.19 }), 5).met, false, "efficiency");
  assert.equal(stageProgress("easy", times(5, { ...good, firstRun: false }), 5).met, false, "first run");
  assert.equal(stageProgress("medium", times(5, { ...good, efficiency: 1.5, timeMultiplier: 1 }), 5).met, false, "time");
});

test("only the newest 5 count: a 6th good solve pushes out an old bad one", () => {
  const solves = [...times(5, good), { ...good, prompts: 40 }]; // newest first
  const p = stageProgress("easy", solves, 6);
  assert.equal(p.met, true);
  assert.equal(p.metrics.find((m) => m.key === "prompts").value, 6);
  assert.equal(p.solves, 6);
});

test("Medium needs ×1.25 time and 1.4; Hard uses the last 3, ×1.5 and 1.6; Get a job is the end", () => {
  assert.equal(stageProgress("medium", times(5, { efficiency: 1.4, prompts: 7, firstRun: true, timeMultiplier: 1.25 }), 5).met, true);
  const hard = stageProgress("hard", [...times(3, { efficiency: 1.6, prompts: 5, firstRun: true, timeMultiplier: 1.5 }), { ...good, prompts: 99 }], 4);
  assert.equal(hard.required, 3);
  assert.equal(hard.met, true);
  assert.equal(hard.nextStage, "get_a_job");
  assert.equal(stageProgress("get_a_job", [], 0), null);
});

test("no solves yet: values are null and nothing is met", () => {
  const p = stageProgress("easy", [], 0);
  assert.ok(p.metrics.every((m) => m.value === null && !m.met));
  assert.equal(p.met, false);
});
