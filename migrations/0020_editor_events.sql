-- S2: key actions during a solve session (01). The client sends file_open / description_open / description_close
-- with its own id per event, so a batch sent twice adds nothing (ON CONFLICT (id) DO NOTHING). test_run is written by
-- the server on Submit (R4), never by the client; prompts are prompt_events (S1). Without file_edit / ai_accept /
-- ai_reject / ai_prompt: edit ratio is not measured in v1 (D51 b) and prompts have their own table.
CREATE TABLE editor_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES solve_sessions(id) ON DELETE CASCADE,
  event_type  VARCHAR(30) NOT NULL
              CHECK (event_type IN ('file_open', 'description_open', 'description_close', 'test_run')),
  file_name   VARCHAR(255),
  metadata    JSONB,
  occurred_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX editor_events_session ON editor_events (session_id, occurred_at);
