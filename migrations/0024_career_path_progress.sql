-- K2 (D66): attempts on a career path. NULL = a general problem (one attempt per user and problem, as before).
-- A path problem is solved per path and can come back 3 months after it was last finished there, so its attempts
-- are one row per assignment; a path has at most one attempt in progress (the assigned problem).
ALTER TABLE user_problem_attempts ADD COLUMN career_path VARCHAR(100) REFERENCES problem_categories(slug);
ALTER TABLE user_problem_attempts DROP CONSTRAINT user_problem_attempts_user_id_problem_id_key;
CREATE UNIQUE INDEX user_problem_attempts_general_key ON user_problem_attempts (user_id, problem_id)
  WHERE career_path IS NULL;
CREATE UNIQUE INDEX user_problem_attempts_path_open_key ON user_problem_attempts (user_id, career_path)
  WHERE career_path IS NOT NULL AND status = 'in_progress';

-- The user's stage per path; the row appears on the first start in that path. The threshold averages are not stored:
-- they are read from the last solves on the stage (like the streak, U2).
CREATE TABLE career_path_progress (
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role              VARCHAR(100) NOT NULL REFERENCES problem_categories(slug),
  current_stage     VARCHAR(20) NOT NULL DEFAULT 'easy' CHECK (current_stage IN ('easy', 'medium', 'hard', 'get_a_job')),
  started_at        TIMESTAMP NOT NULL DEFAULT now(),
  stage_unlocked_at TIMESTAMP,
  PRIMARY KEY (user_id, role)
);
