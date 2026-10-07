-- F2: users + user_stats (01_database.md). Emails are stored lowercased by the API;
-- usernames keep their case but are unique without it (they go into /profile/[username]).
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  username        VARCHAR(50) NOT NULL,
  avatar_url      VARCHAR(500),
  is_admin        BOOLEAN DEFAULT FALSE,
  is_banned       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT NOW(),
  last_active_at  TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX users_username_lower_key ON users (lower(username));

CREATE TABLE user_stats (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  total_points       INTEGER DEFAULT 0,
  current_level      VARCHAR(20) DEFAULT 'Intern',
  problems_solved    INTEGER DEFAULT 0,
  current_streak     INTEGER DEFAULT 0,
  longest_streak     INTEGER DEFAULT 0,
  last_activity_date DATE,
  updated_at         TIMESTAMP DEFAULT NOW()
);
