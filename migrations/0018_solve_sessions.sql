-- S1: the built-in AI chat. One session per attempt (01), counters across all tries like the solve time (D56).
-- Without manual_edits_count / ai_accepted_count: edit ratio is not measured in v1 (D51 b).
CREATE TABLE solve_sessions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id                UUID NOT NULL UNIQUE REFERENCES user_problem_attempts(id) ON DELETE CASCADE,
  total_prompts             INTEGER NOT NULL DEFAULT 0,
  total_tokens_used         INTEGER NOT NULL DEFAULT 0,
  total_ai_iterations       INTEGER NOT NULL DEFAULT 0,
  time_to_first_prompt      INTEGER,  -- seconds from start to first prompt (S2)
  time_on_description       INTEGER,  -- seconds spent reading before first action (S2)
  test_runs_count           INTEGER NOT NULL DEFAULT 0,
  tests_passed_on_first_run BOOLEAN NOT NULL DEFAULT FALSE,
  efficiency_score          DECIMAL(5,2),  -- set on solve (S3)
  created_at                TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Every prompt and its answer. Tokens come from the provider's usage, never an estimate.
-- key_source + model: the daily free limit (D62) and scores across models (D64). No ai_tool (D51 e).
CREATE TABLE prompt_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES solve_sessions(id) ON DELETE CASCADE,
  prompt_index    INTEGER NOT NULL CHECK (prompt_index >= 1),
  prompt_text     TEXT NOT NULL,
  response_text   TEXT NOT NULL,  -- earlier turns go back to the AI as context
  prompt_tokens   INTEGER NOT NULL CHECK (prompt_tokens >= 0),
  response_tokens INTEGER NOT NULL CHECK (response_tokens >= 0),
  total_tokens    INTEGER NOT NULL CHECK (total_tokens >= 0),
  key_source      VARCHAR(10) NOT NULL CHECK (key_source IN ('platform', 'user')),
  model           VARCHAR(100) NOT NULL,
  sent_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, prompt_index)
);
