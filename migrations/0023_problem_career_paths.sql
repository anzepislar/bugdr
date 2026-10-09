-- K1 (D66): the career paths a problem belongs to. A problem with at least one row is a path problem: it stays off
-- /problems, the dashboard feed and the contest picker. No rows = a general problem. Role = a category slug.
CREATE TABLE problem_career_paths (
  problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  role       VARCHAR(100) NOT NULL REFERENCES problem_categories(slug),
  PRIMARY KEY (problem_id, role)
);
