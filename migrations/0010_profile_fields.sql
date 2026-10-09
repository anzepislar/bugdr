-- U1: profile fields edited on /settings (D34). display_name NULL = show the username.
ALTER TABLE user_profiles
  ADD COLUMN display_name    VARCHAR(50),
  ADD COLUMN headline        VARCHAR(80),
  ADD COLUMN github_username VARCHAR(39),
  ADD COLUMN is_public       BOOLEAN NOT NULL DEFAULT TRUE;
