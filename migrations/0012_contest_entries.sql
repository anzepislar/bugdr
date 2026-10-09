-- T2: contest_entries (01_database.md) without attempt_id (D18) and rank (D61). A row = the user took part (D60): it is
-- created on the first start of a contest problem while the contest is live; a solve inside the contest adds to it.
-- contest_attempt_links is not built: the points of each solve are already in user_problem_attempts.
CREATE TABLE contest_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id       UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_score      INTEGER NOT NULL DEFAULT 0,  -- sum of points of contest problems solved within the contest
  problems_solved  INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMP DEFAULT NOW(),
  UNIQUE (contest_id, user_id)
);
CREATE INDEX contest_entries_user ON contest_entries (user_id);
