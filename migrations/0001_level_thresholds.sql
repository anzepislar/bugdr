-- F1: levels are configuration, not test data, so they are seeded here (01_database.md, 03_scoring.md).
CREATE TABLE level_thresholds (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level_name   VARCHAR(20) UNIQUE NOT NULL,
  min_points   INTEGER NOT NULL,
  level_order  INTEGER NOT NULL
);

INSERT INTO level_thresholds (level_name, min_points, level_order) VALUES
  ('Intern', 0, 1),
  ('Junior', 500, 2),
  ('Mid', 1500, 3),
  ('Senior', 3500, 4),
  ('Staff', 7500, 5),
  ('Principal', 15000, 6),
  ('Distinguished', 30000, 7);
