// R4: pure scoring functions (03_scoring.md). No database - tested in test/r4-scoring.test.js.

/** Time bonus: under 25% of the limit → 2x, under 50% → 1.5x, under 75% → 1.25x, otherwise 1x (also past the limit, D9). */
export function timeMultiplier(seconds, limitMinutes) {
  const share = seconds / (limitMinutes * 60);
  if (share < 0.25) return 2;
  if (share < 0.5) return 1.5;
  if (share < 0.75) return 1.25;
  return 1;
}

/** final_points = base × time × efficiency, rounded. Efficiency is 1 until the AI session score (S3, D51). */
export function finalPoints(basePoints, multiplier, efficiency = 1) {
  return Math.round(basePoints * multiplier * efficiency);
}

/**
 * Lines added / deleted between the original files and the submitted ones, per file as a multiset of lines.
 * ponytail: a moved line counts as unchanged and a changed line as one added + one deleted; switch to a real
 * line diff (LCS) if the profile ever shows diffs.
 */
export function lineChanges(original, submitted) {
  let added = 0;
  let deleted = 0;
  for (const path of new Set([...Object.keys(original), ...Object.keys(submitted)])) {
    const counts = new Map();
    for (const line of splitLines(original[path])) counts.set(line, (counts.get(line) ?? 0) + 1);
    for (const line of splitLines(submitted[path])) counts.set(line, (counts.get(line) ?? 0) - 1);
    for (const n of counts.values()) n > 0 ? (deleted += n) : (added -= n);
  }
  return { added, deleted };
}

const splitLines = (text) => (text ? text.replace(/\n$/, "").split("\n") : []);
