-- S8: AI feedback after every solve (02 "Post-Solve Feedback", D65). The row is created as 'pending' in the solve
-- transaction; the text is generated after the commit (Submit does not wait). requested_at = when generation last
-- started: NULL = not started yet; a 'pending' row older than 2 minutes (crash, restart) is started again on GET.
CREATE TABLE solve_feedback (
  attempt_id    UUID PRIMARY KEY REFERENCES user_problem_attempts(id) ON DELETE CASCADE,
  status        VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
  content       TEXT,
  model         VARCHAR(100),
  requested_at  TIMESTAMP,
  generated_at  TIMESTAMP,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK ((status = 'ready') = (content IS NOT NULL))
);
