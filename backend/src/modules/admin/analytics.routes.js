import { Router } from "express";
import { pool } from "../../db.js";
import { HttpError } from "../../errors.js";
import { MIN_BENCHMARK_SOLVES, pickBenchmark } from "../scoring/scoring.js";

// S5: AI session analytics for the admin (04 "AI Session Analytics"), all time. A "scored solve" = a solved attempt
// whose session has an efficiency score (S3); solves from before the AI score are left out. Models replace the
// "AI tools" of 04 (D51 e: the chat records the model and whose key, not a picked tool).
export const adminAnalyticsRouter = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCORED = `user_problem_attempts a JOIN solve_sessions s ON s.attempt_id = a.id
  WHERE a.status = 'solved' AND s.efficiency_score IS NOT NULL`;
// Efficiency 0.5-2.0 in quarter steps; 2.0 belongs to the last bucket.
const BUCKETS = ["0.5-0.75", "0.75-1.0", "1.0-1.25", "1.25-1.5", "1.5-1.75", "1.75-2.0"];
const WEEKS = 12;
const num = (x) => (x === null ? null : Number(x));

adminAnalyticsRouter.get("/", async (req, res) => {
  const q = (sql, params = []) => pool.query(sql, params).then((r) => r.rows);
  const [[totals], byDifficulty, buckets, models, weeks, problems] = await Promise.all([
    q(`SELECT count(*)::int AS solves, avg(s.total_prompts)::float AS prompts, avg(s.total_tokens_used)::float AS tokens,
         avg(s.efficiency_score)::float AS efficiency, avg(s.tests_passed_on_first_run::int)::float AS first_run
       FROM ${SCORED}`),
    q(`SELECT p.difficulty, avg(s.total_prompts)::float AS prompts
       FROM ${SCORED.replace("WHERE", "JOIN problems p ON p.id = a.problem_id WHERE")} GROUP BY p.difficulty`),
    q(`SELECT least(floor((s.efficiency_score - 0.5) / 0.25), 5)::int AS bucket, count(*)::int AS solves
       FROM ${SCORED} GROUP BY 1`),
    q(`SELECT model, key_source, count(*)::int AS prompts FROM prompt_events GROUP BY 1, 2 ORDER BY 3 DESC, 1`),
    // Monday-based UTC weeks, the current one last; a week without scored solves has no average.
    q(
      `SELECT to_char(w, 'YYYY-MM-DD') AS week, avg(s.efficiency_score)::float AS efficiency, count(s.id)::int AS solves
       FROM generate_series(date_trunc('week', now() AT TIME ZONE 'UTC') - ($1 - 1) * interval '1 week',
         date_trunc('week', now() AT TIME ZONE 'UTC'), interval '1 week') AS w
       LEFT JOIN user_problem_attempts a ON a.status = 'solved' AND a.solved_at >= w AND a.solved_at < w + interval '1 week'
       LEFT JOIN solve_sessions s ON s.attempt_id = a.id AND s.efficiency_score IS NOT NULL
       GROUP BY w ORDER BY w`,
      [WEEKS],
    ),
    q(`SELECT p.id, p.slug, p.title, p.difficulty, b.solve_count, b.avg_prompts, b.avg_tokens, b.avg_iterations,
         b.avg_efficiency_score, b.avg_first_run_pass_rate
       FROM problems p LEFT JOIN problem_benchmarks b ON b.problem_id = p.id
       WHERE p.is_published ORDER BY coalesce(b.solve_count, 0) DESC, p.title`),
  ]);

  const promptsBy = Object.fromEntries(byDifficulty.map((r) => [r.difficulty, r.prompts]));
  const perBucket = Object.fromEntries(buckets.map((r) => [r.bucket, r.solves]));
  res.json({
    totals: {
      scoredSolves: totals.solves,
      avgPrompts: totals.prompts,
      avgTokens: totals.tokens,
      avgEfficiency: totals.efficiency,
      firstRunPassRate: totals.first_run === null ? null : Math.round(totals.first_run * 100),
    },
    promptsByDifficulty: ["easy", "medium", "hard", "get_a_job"].map((d) => ({ difficulty: d, avgPrompts: promptsBy[d] ?? null })),
    efficiencyDistribution: BUCKETS.map((range, i) => ({ range, solves: perBucket[i] ?? 0 })),
    models: models.map((m) => ({ model: m.model, keySource: m.key_source, prompts: m.prompts })),
    efficiencyByWeek: weeks.map((w) => ({ week: w.week, avgEfficiency: w.efficiency, solves: w.solves })),
    problems: problems.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      difficulty: p.difficulty,
      solves: p.solve_count ?? 0,
      avgPrompts: num(p.avg_prompts),
      avgTokens: num(p.avg_tokens),
      avgIterations: num(p.avg_iterations),
      avgEfficiency: num(p.avg_efficiency_score),
      firstRunPassRate: p.avg_first_run_pass_rate === null ? null : Math.round(Number(p.avg_first_run_pass_rate) * 100),
      // Which benchmark scores this problem's solves now (S7).
      benchmarkSource: (p.solve_count ?? 0) >= MIN_BENCHMARK_SOLVES ? "problem" : "difficulty",
    })),
  });
});

/** S5: one problem - the models used on it and the benchmark its solves are scored against now (S7). */
adminAnalyticsRouter.get("/problems/:id", async (req, res) => {
  const notFound = () => new HttpError(404, "PROBLEM_NOT_FOUND", "Problem not found");
  if (!UUID.test(req.params.id)) throw notFound();
  const { rows } = await pool.query(
    `SELECT p.difficulty, row_to_json(b) AS benchmark FROM problems p
     LEFT JOIN problem_benchmarks b ON b.problem_id = p.id WHERE p.id = $1`,
    [req.params.id],
  );
  if (!rows[0]) throw notFound();
  const { rows: models } = await pool.query(
    `SELECT pe.model, pe.key_source, count(*)::int AS prompts
     FROM prompt_events pe JOIN solve_sessions s ON s.id = pe.session_id
     JOIN user_problem_attempts a ON a.id = s.attempt_id
     WHERE a.problem_id = $1 GROUP BY 1, 2 ORDER BY 3 DESC, 1`,
    [req.params.id],
  );
  res.json({
    models: models.map((m) => ({ model: m.model, keySource: m.key_source, prompts: m.prompts })),
    benchmark: pickBenchmark(rows[0].benchmark, rows[0].difficulty),
  });
});
