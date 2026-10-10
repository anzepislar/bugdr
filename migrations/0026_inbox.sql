-- X5 + inbox: email through Resend (D68). Feedback from the "Help & feedback" form and emails to any address
-- @mail.bugdr.app are threads in /admin/inbox; replies go out by email and the answers come back to the same thread.
CREATE TABLE inbox_threads (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           VARCHAR(10) NOT NULL CHECK (kind IN ('email', 'feedback')),
  status         VARCHAR(10) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'done')),
  subject        VARCHAR(300) NOT NULL,
  feedback_type  VARCHAR(10) CHECK (feedback_type IN ('bug', 'idea', 'problem', 'other')),
  page           VARCHAR(500),
  to_address     VARCHAR(255),
  from_name      VARCHAR(255),
  from_email     VARCHAR(255) NOT NULL,
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  last_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK ((kind = 'feedback') = (feedback_type IS NOT NULL))
);
CREATE INDEX inbox_threads_last_at ON inbox_threads (last_at DESC);
CREATE INDEX inbox_threads_user_feedback ON inbox_threads (user_id, created_at) WHERE kind = 'feedback';

-- resend_id: the Resend id of a received email (the sync skips ones it has) or of a sent reply.
-- message_id: the email's Message-ID, used as In-Reply-To on replies so mail clients thread them.
CREATE TABLE inbox_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID NOT NULL REFERENCES inbox_threads(id) ON DELETE CASCADE,
  direction   VARCHAR(3) NOT NULL CHECK (direction IN ('in', 'out')),
  body        TEXT NOT NULL,
  resend_id   VARCHAR(100) UNIQUE,
  message_id  VARCHAR(500),
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX inbox_entries_thread ON inbox_entries (thread_id, created_at);

-- X5: only the SHA-256 of the emailed token is stored. Single use, 1 hour.
CREATE TABLE password_reset_tokens (
  token_hash  CHAR(64) PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMP NOT NULL,
  used_at     TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX password_reset_tokens_user ON password_reset_tokens (user_id, created_at);

-- Sessions issued before a password change stop working (requireAuth compares the JWT's iat).
ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMP;
