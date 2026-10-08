-- R2b (D56): every try at a problem is its own row. user_problem_attempts stays one row per user and problem;
-- its started_at is the start of the current try. Points use the sum of all tries (R4).
CREATE TABLE attempt_tries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id        UUID NOT NULL REFERENCES user_problem_attempts(id) ON DELETE CASCADE,
  try_number        INTEGER NOT NULL CHECK (try_number >= 1),
  started_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at          TIMESTAMP,
  outcome           VARCHAR(20) NOT NULL DEFAULT 'in_progress'
                    CHECK (outcome IN ('in_progress', 'abandoned', 'solved')),
  duration_seconds  INTEGER CHECK (duration_seconds >= 0),  -- set by the server when the try ends
  UNIQUE (attempt_id, try_number),
  CHECK ((outcome = 'in_progress') = (ended_at IS NULL))
);

-- At most one open try per attempt.
CREATE UNIQUE INDEX attempt_tries_one_open ON attempt_tries (attempt_id) WHERE ended_at IS NULL;

-- Existing attempts become try 1. An abandoned one has no recorded end, so its duration stays unknown (NULL).
INSERT INTO attempt_tries (attempt_id, try_number, started_at, ended_at, outcome, duration_seconds)
SELECT id, 1, started_at,
  CASE status WHEN 'in_progress' THEN NULL WHEN 'solved' THEN coalesce(solved_at, started_at) ELSE started_at END,
  status,
  CASE status WHEN 'solved' THEN time_taken_seconds END
FROM user_problem_attempts;
