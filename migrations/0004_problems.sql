-- P1: problem list (01_database.md) + changes from 06: thumbnail_url (D16), no summary (D16), no is_contest_problem (D17),
-- problem_bookmarks (D23), user_problem_attempts created early for the card status (D49, logic in R1).
CREATE TABLE problem_categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(100) NOT NULL,
  slug         VARCHAR(100) UNIQUE NOT NULL,
  description  TEXT,
  icon_url     VARCHAR(500),
  created_at   TIMESTAMP DEFAULT NOW()
);

-- Reference data, same list as CATEGORIES in frontend/src/lib/types/problem.ts.
INSERT INTO problem_categories (name, slug) VALUES
  ('AI Engineer', 'ai-engineer'),
  ('Backend Engineer', 'backend'),
  ('Frontend Engineer', 'frontend'),
  ('Full Stack', 'fullstack'),
  ('Database Engineer', 'database');

-- category_id may be NULL on a draft; a problem is only listed with a category.
CREATE TABLE problems (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               VARCHAR(255) NOT NULL,
  slug                VARCHAR(255) UNIQUE NOT NULL,
  short_description   VARCHAR(300) NOT NULL,
  description         TEXT NOT NULL,
  thumbnail_url       VARCHAR(500),
  difficulty          VARCHAR(20) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'get_a_job')),
  category_id         UUID REFERENCES problem_categories(id),
  base_points         INTEGER NOT NULL,
  time_limit_minutes  INTEGER NOT NULL,
  source              VARCHAR(20),
  source_url          VARCHAR(500),
  is_published        BOOLEAN DEFAULT FALSE,
  average_rating      DECIMAL(3,2) DEFAULT 0,
  rating_count        INTEGER DEFAULT 0,
  solve_count         INTEGER DEFAULT 0,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW(),
  -- 03_scoring.md: base points follow the difficulty.
  CHECK ((difficulty, base_points) IN (('easy', 100), ('medium', 250), ('hard', 500), ('get_a_job', 1000)))
);

CREATE TABLE problem_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id  UUID REFERENCES problems(id) ON DELETE CASCADE,
  tag         VARCHAR(50) NOT NULL,
  UNIQUE (problem_id, tag)
);

CREATE TABLE problem_bookmarks (
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  problem_id  UUID REFERENCES problems(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, problem_id)
);

CREATE TABLE user_problem_attempts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID REFERENCES users(id) ON DELETE CASCADE,
  problem_id              UUID REFERENCES problems(id) ON DELETE CASCADE,
  status                  VARCHAR(20) DEFAULT 'in_progress'
                          CHECK (status IN ('in_progress', 'solved', 'abandoned')),
  started_at              TIMESTAMP DEFAULT NOW(),
  solved_at               TIMESTAMP,
  time_taken_seconds      INTEGER,
  points_earned           INTEGER DEFAULT 0,
  time_bonus_multiplier   DECIMAL(3,2) DEFAULT 1.0,
  lines_added             INTEGER DEFAULT 0,
  lines_deleted           INTEGER DEFAULT 0,
  final_code              JSONB,
  UNIQUE (user_id, problem_id)
);
