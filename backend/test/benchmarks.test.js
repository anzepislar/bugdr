import { test } from "node:test";
import assert from "node:assert/strict";
import { benchmarkSnapshot, getBenchmark, mapUserToExperienceLevel, tier } from "../src/modules/scoring/benchmarks.js";

// Feedback benchmarks: pure functions, no database.
test("getBenchmark: difficulty × experience, none for a beginner on get_a_job", () => {
  assert.equal(getBenchmark("medium", "senior").prompts, 5);
  assert.equal(getBenchmark("get_a_job", "beginner"), null);
});

test("mapUserToExperienceLevel: student/junior → beginner, senior → senior, anything else → mid", () => {
  assert.equal(mapUserToExperienceLevel({ experience_level: "student" }), "beginner");
  assert.equal(mapUserToExperienceLevel({ experienceLevel: "junior" }), "beginner");
  assert.equal(mapUserToExperienceLevel({ experience_level: "senior" }), "senior");
  assert.equal(mapUserToExperienceLevel({ experience_level: "mid" }), "mid");
  assert.equal(mapUserToExperienceLevel(null), "mid");
});

test("tier boundaries", () => {
  assert.deepEqual([1.21, 1.2, 0.8, 0.79, 0.5, 0.49].map(tier), ["excellent", "on_target", "on_target", "below", "below", "struggling"]);
});

test("benchmarkSnapshot: target / actual, zero counts as 1, null without a benchmark", () => {
  const s = benchmarkSnapshot("easy", "mid", { seconds: 24 * 60, prompts: 0, tokens: 6000 });
  assert.deepEqual(s.ratios, { time: 0.5, prompts: 4, tokens: 0.5 });
  assert.deepEqual(benchmarkSnapshot("get_a_job", "beginner", { seconds: 60, prompts: 1, tokens: 1 }), {
    difficulty: "get_a_job", experienceLevel: "beginner", targets: null, ratios: null,
  });
});
