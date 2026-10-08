-- P2: problem detail (01_database.md). Tables for code, checks, ratings and comments are created here (D49);
-- their logic comes in R1 (start), O1 (ratings), O2 (comments). + user_daily_activity for the streak (D6, D7).

-- + hidden_files (D10), solution_files (D11), repository_name (D27).
-- repository_structure = JSON array of the file paths shown on the detail page (never contents).
CREATE TABLE problem_codebase (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id            UUID REFERENCES problems(id) ON DELETE CASCADE UNIQUE,
  repository_name       VARCHAR(100),
  repository_structure  JSONB NOT NULL,
  files                 JSONB NOT NULL,
  hidden_files          JSONB NOT NULL DEFAULT '{}',
  solution_files        JSONB,
  language              VARCHAR(50) NOT NULL,
  framework             VARCHAR(50),
  setup_commands        TEXT,
  run_command           TEXT,
  created_at            TIMESTAMP DEFAULT NOW()
);

CREATE TABLE problem_checks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id       UUID REFERENCES problems(id) ON DELETE CASCADE,
  check_order      INTEGER NOT NULL,
  description      VARCHAR(255) NOT NULL,
  check_type       VARCHAR(20) NOT NULL CHECK (check_type IN ('test', 'lint', 'build', 'custom')),
  check_command    TEXT NOT NULL,
  expected_output  TEXT,
  must_pass        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMP DEFAULT NOW(),
  UNIQUE (problem_id, check_order)
);

CREATE TABLE problem_ratings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  problem_id  UUID REFERENCES problems(id) ON DELETE CASCADE,
  rating      INTEGER CHECK (rating BETWEEN 1 AND 5),
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, problem_id)
);

CREATE TABLE problem_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  problem_id  UUID REFERENCES problems(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_daily_activity (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  activity_date    DATE NOT NULL,
  problems_opened  INTEGER DEFAULT 0,
  problems_solved  INTEGER DEFAULT 0,
  points_earned    INTEGER DEFAULT 0,
  UNIQUE (user_id, activity_date)
);
