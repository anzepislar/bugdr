-- K3 (D66 e): the unlock thresholds, the same for every path (user, 10. 10. 2026), edited on /admin/career-paths.
-- One row per stage that can be left. time_multiplier NULL = no time rule (Easy). first_run is a share 0-1.
-- A change applies from each engineer's next solve on the path.
CREATE TABLE career_path_thresholds (
  stage           VARCHAR(20) PRIMARY KEY CHECK (stage IN ('easy', 'medium', 'hard')),
  solves          INTEGER NOT NULL CHECK (solves BETWEEN 1 AND 50),
  efficiency      DECIMAL(3,2) NOT NULL CHECK (efficiency BETWEEN 0.5 AND 2.0),
  prompts         DECIMAL(5,1) NOT NULL CHECK (prompts > 0 AND prompts <= 100),
  first_run       DECIMAL(3,2) NOT NULL CHECK (first_run BETWEEN 0 AND 1),
  time_multiplier DECIMAL(3,2) CHECK (time_multiplier BETWEEN 1 AND 2),
  updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

-- The values the user gave (D66 e).
INSERT INTO career_path_thresholds (stage, solves, efficiency, prompts, first_run, time_multiplier) VALUES
  ('easy', 5, 1.2, 10, 0.4, NULL),
  ('medium', 5, 1.4, 7, 0.5, 1.25),
  ('hard', 3, 1.6, 5, 0.6, 1.5);
