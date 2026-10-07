import { pool } from "../../db.js";

/** All levels as { name, order, minPoints }, lowest first. */
export async function getLevels() {
  const { rows } = await pool.query(
    `SELECT level_name AS name, level_order AS "order", min_points AS "minPoints"
     FROM level_thresholds ORDER BY min_points`,
  );
  return rows;
}

/** The level for `points` and the one after it (null at the top). `levels` sorted by minPoints, first at 0. */
export function levelFor(points, levels) {
  const i = levels.findLastIndex((l) => points >= l.minPoints);
  return { level: levels[i], nextLevel: levels[i + 1] ?? null };
}
