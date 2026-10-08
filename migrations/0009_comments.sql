-- O2 (D30, D58): one level of replies and "helpful" marks. Deleting a comment deletes its replies and marks.
-- The helpful count is counted from comment_helpful when read, so it can never drift.
ALTER TABLE problem_comments ADD COLUMN parent_id UUID REFERENCES problem_comments(id) ON DELETE CASCADE;
CREATE INDEX problem_comments_problem ON problem_comments (problem_id);

CREATE TABLE comment_helpful (
  comment_id  UUID NOT NULL REFERENCES problem_comments(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);
