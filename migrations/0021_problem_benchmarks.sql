-- S7: per-problem averages of the solves with an AI session (S1-S3), updated incrementally in every solve transaction
-- (avg + (x - avg) / n). No row = no solves yet: readers fall back to the per-difficulty constants (scoring.js).
-- + avg_iterations (not in 06): the efficiency score (S3) also needs an iteration benchmark.
CREATE TABLE problem_benchmarks (
  problem_id              UUID PRIMARY KEY REFERENCES problems(id) ON DELETE CASCADE,
  avg_prompts             DECIMAL(10,4) NOT NULL,
  avg_tokens              DECIMAL(12,4) NOT NULL,
  avg_iterations          DECIMAL(10,4) NOT NULL,
  avg_time_seconds        DECIMAL(12,4) NOT NULL,
  avg_efficiency_score    DECIMAL(6,4) NOT NULL,
  avg_first_run_pass_rate DECIMAL(5,4) NOT NULL,  -- 0-1
  solve_count             INTEGER NOT NULL DEFAULT 0 CHECK (solve_count >= 0),
  updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Starting values from the solves that already have a scored session (solves before S3 have none and are left out).
INSERT INTO problem_benchmarks (problem_id, avg_prompts, avg_tokens, avg_iterations, avg_time_seconds,
  avg_efficiency_score, avg_first_run_pass_rate, solve_count)
SELECT a.problem_id, avg(s.total_prompts), avg(s.total_tokens_used), avg(s.total_ai_iterations), avg(a.time_taken_seconds),
  avg(s.efficiency_score), avg(s.tests_passed_on_first_run::int), count(*)
FROM user_problem_attempts a JOIN solve_sessions s ON s.attempt_id = a.id
WHERE a.status = 'solved' AND s.efficiency_score IS NOT NULL
GROUP BY a.problem_id;
