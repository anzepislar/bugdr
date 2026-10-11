-- Feedback benchmarks (backend/src/modules/scoring/benchmarks.js): what each solve was measured against, written in
-- the solve transaction. NULL = solved before this column.
ALTER TABLE user_problem_attempts ADD COLUMN benchmark_snapshot JSONB;
