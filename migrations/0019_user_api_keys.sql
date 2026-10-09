-- S6 (D63): the user's own Anthropic / OpenAI key for the built-in AI chat. One per user (a new one replaces it).
-- Encrypted with AES-256-GCM under API_KEY_ENCRYPTION_KEY (backend/.env only); never stored or returned in plain text.
CREATE TABLE user_api_keys (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider    VARCHAR(20) NOT NULL CHECK (provider IN ('anthropic', 'openai')),
  model       VARCHAR(100) NOT NULL,  -- picked by the user from a fixed list per provider (D63)
  ciphertext  BYTEA NOT NULL,
  iv          BYTEA NOT NULL,
  auth_tag    BYTEA NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
