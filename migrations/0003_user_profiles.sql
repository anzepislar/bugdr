-- F4: onboarding answers (01_database.md). goal_role is a problem_categories slug ('ai-engineer', 'backend',
-- 'frontend', 'fullstack', 'database'); NULL = "Exploring my path" (D41). + languages (D42).
CREATE TABLE user_profiles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  goal_role             VARCHAR(50),
  experience_level      VARCHAR(20),
  platform_goal         VARCHAR(20),
  languages             TEXT[] NOT NULL DEFAULT '{}',
  onboarding_completed  BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMP DEFAULT NOW()
);
