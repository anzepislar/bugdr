-- R4: results of every Test run, and the points ledger (01_database.md).
CREATE TABLE check_results (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id   UUID REFERENCES user_problem_attempts(id) ON DELETE CASCADE,
  check_id     UUID REFERENCES problem_checks(id) ON DELETE CASCADE,
  passed       BOOLEAN NOT NULL,
  output       TEXT,  -- only for a failed check
  executed_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX check_results_attempt ON check_results (attempt_id, executed_at);

-- Append-only: never updated. user_stats.total_points = SUM(amount) per user, kept in the same transaction.
CREATE TABLE point_transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  amount       INTEGER NOT NULL,
  reason       VARCHAR(50) NOT NULL CHECK (reason IN ('problem_solved', 'time_bonus', 'contest_bonus')),
  reference_id UUID,  -- problem_id or contest_id
  created_at   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX point_transactions_user ON point_transactions (user_id);
