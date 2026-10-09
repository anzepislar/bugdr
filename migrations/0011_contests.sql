-- T1: contest list (01_database.md) + changes from 06: starts_at/ends_at NULL = draft and the status is never stored (D43),
-- archived_at (A6, 04 "Archive"). contest_entries comes with T2.
CREATE TABLE contests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                VARCHAR(255) NOT NULL,
  description          TEXT,
  type                 VARCHAR(10) NOT NULL CHECK (type IN ('daily', 'weekly', 'monthly')),
  starts_at            TIMESTAMP,
  ends_at              TIMESTAMP,
  reward_type          VARCHAR(20) CHECK (reward_type IN ('subscription', 'merch', 'points')),
  reward_description   VARCHAR(255),
  archived_at          TIMESTAMP,
  created_by           UUID REFERENCES users(id),
  created_at           TIMESTAMP DEFAULT NOW(),
  -- A draft has neither date; a scheduled contest has both, in order.
  CHECK ((starts_at IS NULL) = (ends_at IS NULL)),
  CHECK (ends_at > starts_at)
);

CREATE TABLE contest_problems (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id  UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  problem_id  UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE (contest_id, problem_id)
);
-- D17: every problem query checks whether the problem belongs to a contest that has not ended.
CREATE INDEX contest_problems_problem ON contest_problems (problem_id);
