# BUGDR — Database Schema

## Rules

- Plain SQL only — no ORM, no Supabase, no external services
- PostgreSQL 17
- All IDs are UUID
- All timestamps default to NOW()
- `TIMESTAMP` columns (no zone) hold UTC: every connection sets `TimeZone=UTC` and `backend/src/db.js` reads and writes them as UTC, whatever the server's local timezone
- Migrations are plain `.sql` files in `/migrations/`
- Tables that already exist are written here exactly as their migration created them. Planned changes to tables not built yet are listed in `06_backend_slices.md` ("Spremembe sheme")
- Never update points directly — always insert a transaction (see point_transactions)

---

## Overview

```
users
  └── user_profiles        (onboarding answers)
  └── user_stats           (points, level, streak)
  └── user_daily_activity  (streak tracking)
  └── user_problem_attempts
        └── attempt_tries      (one row per try: give up + restart = next try)
        └── check_results
        └── solve_sessions     (AI session, one per attempt)
              └── prompt_events
              └── editor_events

problems
  └── problem_categories
  └── problem_tags
  └── problem_codebase     (the actual files)
  └── problem_checks       (automated tests)
  └── problem_career_paths (K1: the career paths it belongs to)
  └── problem_ratings
  └── problem_comments
        └── comment_helpful

contests
  └── contest_problems
  └── contest_entries

point_transactions          (append-only ledger)
level_thresholds            (seeded, adjustable)
```

---

## Users & Auth

### users
The main user table. Passwords are always hashed (scrypt) — never store plain text.
Created in `migrations/0002_users.sql`. Emails are stored lowercased; usernames keep their case
but are unique without it (they go into `/profile/[username]`).

```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  username        VARCHAR(50) NOT NULL,
  avatar_url      VARCHAR(500),
  is_banned       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT NOW(),
  last_active_at  TIMESTAMP DEFAULT NOW(),  -- refreshed at most once a minute
  password_changed_at TIMESTAMP              -- X5: sessions issued before it stop working (migration 0026)
);
CREATE UNIQUE INDEX users_username_lower_key ON users (lower(username));
```

No `is_admin`: the admin is not a user account (D48). Its email and password hash live in `backend/.env`; migration 0013 dropped the column (A1).

### user_profiles
Stores onboarding answers and the profile fields from `/settings` (D34). One row per user, created by the first
`PUT /me/onboarding` (or `PUT /me/profile`). Created in `migrations/0003_user_profiles.sql`, profile fields in
`migrations/0010_profile_fields.sql` (U1).

```sql
CREATE TABLE user_profiles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  goal_role             VARCHAR(50),   -- problem_categories.slug: 'ai-engineer', 'backend', 'frontend', 'fullstack', 'database'; NULL = "Exploring my path"
  experience_level      VARCHAR(20),   -- 'student', 'junior', 'mid', 'senior'
  platform_goal         VARCHAR(20),   -- 'get_hired', 'improve_skills', 'both'
  languages             TEXT[] NOT NULL DEFAULT '{}',  -- from onboarding step 4 (fixed list)
  onboarding_completed  BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMP DEFAULT NOW(),
  display_name          VARCHAR(50),   -- NULL = show the username
  headline              VARCHAR(80),
  github_username       VARCHAR(39),   -- GitHub's rule, not verified
  is_public             BOOLEAN NOT NULL DEFAULT TRUE  -- FALSE: others see only the username
);
```

### user_stats
Aggregated stats per user. Updated after every problem solve.

```sql
CREATE TABLE user_stats (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  total_points     INTEGER DEFAULT 0,
  current_level    VARCHAR(20) DEFAULT 'Intern',
  problems_solved  INTEGER DEFAULT 0,
  current_streak   INTEGER DEFAULT 0,
  longest_streak   INTEGER DEFAULT 0,
  last_activity_date DATE,
  updated_at       TIMESTAMP DEFAULT NOW()
);
```

---

## Problems

### problem_categories
Groups problems by target role.

```sql
CREATE TABLE problem_categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(100) NOT NULL,        -- 'AI Engineer', 'Backend Engineer', etc
  slug         VARCHAR(100) UNIQUE NOT NULL, -- 'ai-engineer', 'backend', etc
  description  TEXT,
  icon_url     VARCHAR(500),
  created_at   TIMESTAMP DEFAULT NOW()
);
```

**Seed data:**
- AI Engineer / ai-engineer
- Backend Engineer / backend
- Frontend Engineer / frontend
- Full Stack / fullstack
- Database Engineer / database

### problems
The main problem table.

```sql
CREATE TABLE problems (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               VARCHAR(255) NOT NULL,
  slug                VARCHAR(255) UNIQUE NOT NULL,
  short_description   VARCHAR(300) NOT NULL,  -- shown on problem card: symptom only e.g. "Payment retries disappear"
  codebase_context    TEXT NOT NULL,          -- what the system does, no bug hints, reads like onboarding
  incident_report     TEXT NOT NULL,          -- error logs, user complaints, symptoms — never the cause
  thumbnail_url       VARCHAR(500),           -- card thumbnail image
  difficulty          VARCHAR(20) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'get_a_job')),
  category_id         UUID REFERENCES problem_categories(id),
  base_points         INTEGER NOT NULL,  -- see 03_scoring.md
  time_limit_minutes  INTEGER NOT NULL,
  source              VARCHAR(20),       -- 'github', 'claude_generated'
  source_url          VARCHAR(500),      -- original GitHub issue URL if applicable
  is_published        BOOLEAN DEFAULT FALSE,
  average_rating      DECIMAL(3,2) DEFAULT 0,
  rating_count        INTEGER DEFAULT 0,
  solve_count         INTEGER DEFAULT 0,  -- not maintained yet; the admin list counts solved attempts
  bug_summary         TEXT NOT NULL DEFAULT '',  -- AI analysis note about the bug, admin only (A2, 0014)
  dry_run_passed_for  TIMESTAMP,         -- A4: updated_at of the version whose checks all failed on the buggy code (0016)
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW(),
  CHECK ((difficulty, base_points) IN (('easy', 100), ('medium', 250), ('hard', 500), ('get_a_job', 1000)))
);
```

Built in P1 (`migrations/0004_problems.sql`); `description` split into `codebase_context` + `incident_report` in
`migrations/0006_problem_brief.sql`. No `summary` (cards use `short_description`, D16) and no
`is_contest_problem` (derived from `contest_problems`, D17). `category_id` may be NULL on a draft; only problems
with a category are listed.

### problem_tags
Tags for filtering and search.

```sql
CREATE TABLE problem_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id  UUID REFERENCES problems(id) ON DELETE CASCADE,
  tag         VARCHAR(50) NOT NULL,
  UNIQUE (problem_id, tag)
);
```

### problem_bookmarks
"Saved problems" (D23, built in P1).

```sql
CREATE TABLE problem_bookmarks (
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  problem_id  UUID REFERENCES problems(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, problem_id)
);
```

### problem_codebase
The actual buggy codebase for each problem. Stored as JSONB.

```sql
CREATE TABLE problem_codebase (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id            UUID REFERENCES problems(id) ON DELETE CASCADE UNIQUE,
  repository_name       VARCHAR(100),    -- shown on the detail page: 'northstar / checkout-worker' (D27)
  repository_structure  JSONB NOT NULL,  -- JSON array of file paths shown on the detail page (never contents)
  files                 JSONB NOT NULL,  -- { "filename": "content", ... }
  language              VARCHAR(50) NOT NULL,
  framework             VARCHAR(50),     -- 'nextjs', 'express', 'django', etc
  setup_commands        TEXT,            -- commands to set up before running
  run_command           TEXT,            -- command to start the app
  hidden_files          JSONB NOT NULL DEFAULT '{}', -- test files never sent to browser, written into container AFTER user files
  solution_files        JSONB,           -- correct fix — checks must FAIL on buggy code and PASS on this before publishing
  content_hash          CHAR(64) UNIQUE,  -- SHA-256 of an uploaded codebase (A10 duplicate check), NULL for seeds
  created_at            TIMESTAMP DEFAULT NOW()
);
```

**Example files JSONB:**
```json
{
  "src/index.js": "const express = require('express')...",
  "src/routes/users.js": "router.get('/users', async...",
  "package.json": "{ \"name\": \"buggy-app\"... }"
}
```

### problem_checks
The automated tests that must pass for a problem to be solved.
Run in order — all must pass.

```sql
CREATE TABLE problem_checks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id       UUID REFERENCES problems(id) ON DELETE CASCADE,
  check_order      INTEGER NOT NULL,       -- run in this order
  description      VARCHAR(255) NOT NULL,  -- shown to user: "API returns 200"
  check_type       VARCHAR(20) NOT NULL CHECK (check_type IN ('test', 'lint', 'build', 'custom')),
  check_command    TEXT NOT NULL,          -- command to run in Docker
  expected_output  TEXT,                   -- optional: match stdout
  must_pass        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMP DEFAULT NOW(),
  UNIQUE (problem_id, check_order)
);
```

`problem_codebase`, `problem_checks`, `problem_ratings`, `problem_comments` and `user_daily_activity` are built in P2
(`migrations/0005_problem_detail.sql`, D49); their logic comes in R1, O1, O2.

### problem_career_paths
The career paths a problem belongs to (K1, D66, `migrations/0023_problem_career_paths.sql`). A problem with at least
one row is a path problem: not on `/problems`, in the dashboard feed or the contest picker. No rows = general problem.
Set on the admin Review form (and the edit page), saved with the draft.

```sql
CREATE TABLE problem_career_paths (
  problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  role       VARCHAR(100) NOT NULL REFERENCES problem_categories(slug),  -- 'backend', 'ai-engineer', ...
  PRIMARY KEY (problem_id, role)
);
```

---

## Problem Solving

### user_problem_attempts
One row per user per problem. Can only solve once (UNIQUE constraint).

```sql
CREATE TABLE user_problem_attempts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID REFERENCES users(id) ON DELETE CASCADE,
  problem_id              UUID REFERENCES problems(id) ON DELETE CASCADE,
  status                  VARCHAR(20) DEFAULT 'in_progress'
                          CHECK (status IN ('in_progress', 'solved', 'abandoned')),
  started_at              TIMESTAMP DEFAULT NOW(),  -- start of the current try (attempt_tries)
  solved_at               TIMESTAMP,
  time_taken_seconds      INTEGER,  -- sum of all tries (D56)
  points_earned           INTEGER DEFAULT 0,
  time_bonus_multiplier   DECIMAL(3,2) DEFAULT 1.0,
  lines_added             INTEGER DEFAULT 0,
  lines_deleted           INTEGER DEFAULT 0,
  final_code              JSONB,   -- snapshot of files on solve
  career_path             VARCHAR(100) REFERENCES problem_categories(slug)  -- K2: NULL = general problem
);
-- K2 (migration 0024): solve once only for general problems; a path has one open attempt at a time.
CREATE UNIQUE INDEX user_problem_attempts_general_key ON user_problem_attempts (user_id, problem_id)
  WHERE career_path IS NULL;
CREATE UNIQUE INDEX user_problem_attempts_path_open_key ON user_problem_attempts (user_id, career_path)
  WHERE career_path IS NOT NULL AND status = 'in_progress';
```

Table built in P1 (D49) for the card status; start/solve logic comes in R1-R4. A career path problem (K2, D66) has
one row per assignment on each path: it can be solved again 3 months after it was last finished there, and a solve on
one path does not count on another.

### career_path_thresholds
The unlock thresholds, the same for every path (K3, `migrations/0025_career_path_thresholds.sql`), edited on
`/admin/career-paths`; seeded with the D66 values. Read on every unlock check and on `GET /career-paths`.

```sql
CREATE TABLE career_path_thresholds (
  stage           VARCHAR(20) PRIMARY KEY CHECK (stage IN ('easy', 'medium', 'hard')),  -- the stage being left
  solves          INTEGER NOT NULL CHECK (solves BETWEEN 1 AND 50),       -- minimum solves = averaging window
  efficiency      DECIMAL(3,2) NOT NULL CHECK (efficiency BETWEEN 0.5 AND 2.0),
  prompts         DECIMAL(5,1) NOT NULL CHECK (prompts > 0 AND prompts <= 100),
  first_run       DECIMAL(3,2) NOT NULL CHECK (first_run BETWEEN 0 AND 1),
  time_multiplier DECIMAL(3,2) CHECK (time_multiplier BETWEEN 1 AND 2),  -- NULL = no time rule
  updated_at      TIMESTAMP NOT NULL DEFAULT now()
);
```

### career_path_progress
The user's stage per career path (K2, D66, `migrations/0024_career_path_progress.sql`). The row appears on the first
start in that path; no row = Easy, not started. The threshold averages are not stored: they are read from the last
solves on the stage (last 5, Hard 3).

```sql
CREATE TABLE career_path_progress (
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role              VARCHAR(100) NOT NULL REFERENCES problem_categories(slug),
  current_stage     VARCHAR(20) NOT NULL DEFAULT 'easy' CHECK (current_stage IN ('easy', 'medium', 'hard', 'get_a_job')),
  started_at        TIMESTAMP NOT NULL DEFAULT now(),
  stage_unlocked_at TIMESTAMP,
  PRIMARY KEY (user_id, role)
);
```

### attempt_tries
Every try at a problem (R2b, D56). Giving up closes the open try; starting again opens the next one.
Points use the sum of all tries, so a restart never resets the clock.

```sql
CREATE TABLE attempt_tries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id        UUID NOT NULL REFERENCES user_problem_attempts(id) ON DELETE CASCADE,
  try_number        INTEGER NOT NULL CHECK (try_number >= 1),
  started_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at          TIMESTAMP,
  outcome           VARCHAR(20) NOT NULL DEFAULT 'in_progress'
                    CHECK (outcome IN ('in_progress', 'abandoned', 'solved')),
  duration_seconds  INTEGER CHECK (duration_seconds >= 0),  -- set by the server when the try ends
  UNIQUE (attempt_id, try_number),
  CHECK ((outcome = 'in_progress') = (ended_at IS NULL))
);
CREATE UNIQUE INDEX attempt_tries_one_open ON attempt_tries (attempt_id) WHERE ended_at IS NULL;
```

Migration 0007; attempts that existed before it became try 1 (an abandoned one with an unknown duration).

### check_results
Results for each check run during a solve attempt.

```sql
CREATE TABLE check_results (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id   UUID REFERENCES user_problem_attempts(id) ON DELETE CASCADE,
  check_id     UUID REFERENCES problem_checks(id) ON DELETE CASCADE,
  passed       BOOLEAN NOT NULL,
  output       TEXT,  -- only for a failed check
  executed_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX check_results_attempt ON check_results (attempt_id, executed_at);
```

Built in R4 (migration 0008): one row per check on every Test run.

---

## AI Session Tracking

`solve_sessions` + `prompt_events` built in S1 (migration 0018), `editor_events` in S2 (migration 0020); session counters from S2: test runs, passed on first run and iterations on every Submit, time to first prompt / on description on solve (milestone M8 in `06_backend_slices.md`). `user_api_keys` built in S6 (migration 0019). `problem_benchmarks` built in S7 (migration 0021). `solve_feedback` built in S8 (migration 0022). Also planned (not described here yet, see `06` "Spremembe sheme"): `career_path_progress` and `user_problem_attempts.career_path` (built in K2, migration 0024). They are added to this file when the slice builds them.

### solve_sessions
One session per solve attempt, across all its tries (like the solve time, D56). Tracks the full AI interaction.
Created in `migrations/0018_solve_sessions.sql` (S1) on the first prompt. No `manual_edits_count` /
`ai_accepted_count`: edit ratio is not measured in v1 (D51 b).

```sql
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
```

### prompt_events
Every prompt sent to the built-in AI chat, with its answer (earlier turns go back to the AI as context) and the
provider's real token usage. `key_source` + `model` serve the daily free limit (D62: sum of today's `platform`
tokens, UTC) and scores across models (D64). No `ai_tool` (D51 e) and no `response_used` (D51 b).

```sql
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
```

### user_api_keys
The user's own Anthropic / OpenAI key for the built-in AI chat (S6, D63), one per user - a new one replaces it.
Created in `migrations/0019_user_api_keys.sql`. Encrypted with AES-256-GCM under `API_KEY_ENCRYPTION_KEY`
(`backend/.env` only, 64 hex chars); the plain key exists only in memory for a provider call and is never returned.
`model` is picked from a fixed list per provider (`USER_MODELS` in `backend/src/modules/ai/chat.service.js`).

```sql
CREATE TABLE user_api_keys (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider    VARCHAR(20) NOT NULL CHECK (provider IN ('anthropic', 'openai')),
  model       VARCHAR(100) NOT NULL,  -- picked by the user from a fixed list per provider (D63)
  ciphertext  BYTEA NOT NULL,
  iv          BYTEA NOT NULL,
  auth_tag    BYTEA NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### problem_benchmarks
Per-problem averages of the solves with a scored AI session (S7, `migrations/0021_problem_benchmarks.sql`), updated
incrementally (`avg + (x - avg) / n`) in every solve transaction, after that solve's score. No row = no solves yet.
From 5 solves the efficiency score (S3) uses these averages (floored at 1) instead of the per-difficulty constants.

```sql
CREATE TABLE problem_benchmarks (
  problem_id              UUID PRIMARY KEY REFERENCES problems(id) ON DELETE CASCADE,
  avg_prompts             DECIMAL(10,4) NOT NULL,
  avg_tokens              DECIMAL(12,4) NOT NULL,
  avg_iterations          DECIMAL(10,4) NOT NULL,
  avg_time_seconds        DECIMAL(12,4) NOT NULL,
  avg_efficiency_score    DECIMAL(6,4) NOT NULL,
  avg_first_run_pass_rate DECIMAL(5,4) NOT NULL,  -- 0-1
  solve_count             INTEGER NOT NULL DEFAULT 0 CHECK (solve_count >= 0),
  updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### solve_feedback
AI feedback after every solve (S8, `migrations/0022_solve_feedback.sql`, D65). Created as `pending` in the solve
transaction, written after the commit with the cheap model on the platform key; only the owner reads it
(`GET /attempts/:id/feedback`). `requested_at` = when generation last started (NULL = not yet).

```sql
CREATE TABLE solve_feedback (
  attempt_id    UUID PRIMARY KEY REFERENCES user_problem_attempts(id) ON DELETE CASCADE,
  status        VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
  content       TEXT,
  model         VARCHAR(100),
  requested_at  TIMESTAMP,
  generated_at  TIMESTAMP,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK ((status = 'ready') = (content IS NOT NULL))
);
```

### editor_events
Key actions during a solve session for behavioral analysis. Created in `migrations/0020_editor_events.sql` (S2).
The client sends `file_open` / `description_open` / `description_close` in batches (`POST /attempts/:id/events`)
with its own `id` per event, so a batch sent twice adds nothing. `test_run` is written by the server on every Submit
(R4, `metadata` = passed / total / allPassed). No `file_edit` / `ai_*`: edit ratio is not measured in v1 (D51 b),
prompts are `prompt_events`.

```sql
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
```

---

## Ratings & Comments

### problem_ratings
One rating per user per problem. Only possible after solving. Rating again replaces the rating (upsert).
Built in P2 (D49), used from O1: `PUT /problems/:slug/rating` recomputes `problems.average_rating` and
`rating_count` from this table in the same transaction (D57) - they are never adjusted incrementally.

```sql
CREATE TABLE problem_ratings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  problem_id  UUID REFERENCES problems(id) ON DELETE CASCADE,
  rating      INTEGER CHECK (rating BETWEEN 1 AND 5),
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, problem_id)
);
```

### problem_comments
Comments unlocked only after solving. Enforced in API, not DB. Built in P2 (D49); O2 (migration 0009) adds
`parent_id`: replies are one level deep (D30, enforced in API), deleting a comment deletes its replies (D58).
Content is stored trimmed, 1-2000 characters (API). No editing, so `updated_at` stays the creation time.

```sql
CREATE TABLE problem_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  problem_id  UUID REFERENCES problems(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES problem_comments(id) ON DELETE CASCADE,  -- NULL = top level
  content     TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX problem_comments_problem ON problem_comments (problem_id);
```

### comment_helpful
"Helpful" marks (D30, migration 0009). Only by someone who solved the problem, never on one's own comment (API).
The helpful count is `count(*)` of this table when comments are read - no stored counter that could drift.

```sql
CREATE TABLE comment_helpful (
  comment_id  UUID NOT NULL REFERENCES problem_comments(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);
```

---

## Streak Tracking

### user_daily_activity
One row per user per day. Streak continues if problems_opened > 0.

```sql
CREATE TABLE user_daily_activity (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  activity_date    DATE NOT NULL,
  problems_opened  INTEGER DEFAULT 0,
  problems_solved  INTEGER DEFAULT 0,
  points_earned    INTEGER DEFAULT 0,
  UNIQUE(user_id, activity_date)
);
```

**Streak logic (enforced in API):**
- Opening a problem → increment `problems_opened`
- Streak continues as long as `problems_opened > 0` for each day
- Streak resets if a full day passes with no activity

---

## Contests

### contests
Admin creates these. Daily, weekly, monthly. Built in T1 (migration 0011).
The status is never stored (D43): no dates = draft, `starts_at > now()` = upcoming/scheduled,
`ends_at <= now()` = ended, otherwise active. Drafts are never public.

```sql
CREATE TABLE contests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                VARCHAR(255) NOT NULL,
  description          TEXT,
  type                 VARCHAR(10) NOT NULL CHECK (type IN ('daily', 'weekly', 'monthly')),
  starts_at            TIMESTAMP,            -- NULL = draft (D43)
  ends_at              TIMESTAMP,
  reward_type          VARCHAR(20) CHECK (reward_type IN ('subscription', 'merch', 'points')),
  reward_description   VARCHAR(255),         -- '1 year free subscription' or 'Bugdr hoodie'
  archived_at          TIMESTAMP,            -- NULL = not archived (04 "Archive", used from A6)
  reward_sent_at       TIMESTAMP,            -- NULL = reward not sent yet (04 "Reward flow", A7, migration 0017)
  created_by           UUID REFERENCES users(id),
  created_at           TIMESTAMP DEFAULT NOW(),
  CHECK ((starts_at IS NULL) = (ends_at IS NULL)),
  CHECK (ends_at > starts_at)
);
```

### contest_problems
Problems assigned to a contest (at least one, D33; the contest page shows the first by `created_at`, D59).
While its contest has not ended, a problem is off `/problems` and the dashboard feed; while the contest is
upcoming, the problem cannot be opened at all (D17).

```sql
CREATE TABLE contest_problems (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id  UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  problem_id  UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE (contest_id, problem_id)
);
CREATE INDEX contest_problems_problem ON contest_problems (problem_id);
```

### contest_entries
One row per user per contest — tracks total score across all contest problems. Built in T2 (migration 0012).
The row is created on the first start of a contest problem while the contest is live (D60, "Enter contest").
A solve while the contest is live adds 1 to `problems_solved` and its points to `total_score` in the solve
transaction (D18); a solve after `ends_at` does not count. No `rank`: the ranking is computed on read in the admin results (A7, `03`).

```sql
CREATE TABLE contest_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id       UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_score      INTEGER NOT NULL DEFAULT 0,  -- sum of points of contest problems solved within the contest
  problems_solved  INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMP DEFAULT NOW(),
  UNIQUE (contest_id, user_id)
);
CREATE INDEX contest_entries_user ON contest_entries (user_id);
```

### contest_attempt_links
**Not built (T2):** the points of each solve are already in `user_problem_attempts`. Original design kept for reference:
Links individual problem attempts to a contest entry.
One row per problem solved within a contest.

```sql
CREATE TABLE contest_attempt_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id    UUID REFERENCES contest_entries(id) ON DELETE CASCADE,
  attempt_id  UUID REFERENCES user_problem_attempts(id) ON DELETE CASCADE,
  problem_id  UUID REFERENCES problems(id),
  score       INTEGER DEFAULT 0,  -- points earned for this specific problem
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(entry_id, problem_id)    -- one attempt per problem per contest entry
);
```

---

## Points & Levels

### point_transactions
Append-only ledger. Never update — always insert a new row.
Total points = SUM of all transactions for a user.

```sql
CREATE TABLE point_transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  amount       INTEGER NOT NULL,
  reason       VARCHAR(50) NOT NULL CHECK (reason IN ('problem_solved', 'time_bonus', 'contest_bonus')),
  reference_id UUID,                  -- problem_id or contest_id
  created_at   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX point_transactions_user ON point_transactions (user_id);
```

Built in R4 (migration 0008). A solve writes two rows (D15): `problem_solved` = the base, `time_bonus` = the rest
(only when > 0), so their sum = `user_problem_attempts.points_earned`.

### level_thresholds
Seeded once. Adjustable without code changes.

```sql
CREATE TABLE level_thresholds (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level_name   VARCHAR(20) UNIQUE NOT NULL,
  min_points   INTEGER NOT NULL,
  level_order  INTEGER NOT NULL
);
```

**Seed data:**

| Order | Level | Min Points |
|-------|-------|-----------|
| 1 | Intern | 0 |
| 2 | Junior | 500 |
| 3 | Mid | 1,500 |
| 4 | Senior | 3,500 |
| 5 | Staff | 7,500 |
| 6 | Principal | 15,000 |
| 7 | Distinguished | 30,000 |

---

## Email (D68)

All email goes through Resend (`backend/src/modules/email/email.service.js`). `migrations/0026_inbox.sql`.

### inbox_threads
One conversation in `/admin/inbox`: an email to any address @mail.bugdr.app (pulled from Resend every 2 minutes
and when the inbox opens) or a message from the "Help & feedback" form (`POST /feedback`, logged-in users, 5 an
hour). A reply sets `status = 'done'`; an answer from the same address makes it `'new'` again.

```sql
CREATE TABLE inbox_threads (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           VARCHAR(10) NOT NULL CHECK (kind IN ('email', 'feedback')),
  status         VARCHAR(10) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'done')),
  subject        VARCHAR(300) NOT NULL,          -- email subject; feedback: the type label
  feedback_type  VARCHAR(10) CHECK (feedback_type IN ('bug', 'idea', 'problem', 'other')),
  page           VARCHAR(500),                   -- feedback: page the form was sent from
  to_address     VARCHAR(255),                   -- email: the address it was sent to
  from_name      VARCHAR(255),
  from_email     VARCHAR(255) NOT NULL,
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  last_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK ((kind = 'feedback') = (feedback_type IS NOT NULL))
);
```

### inbox_entries
Messages in a thread. `resend_id` = Resend id of a received email (the sync skips known ones) or of a sent reply;
`message_id` = the email's Message-ID, sent back as In-Reply-To so mail clients thread the reply. Replies go out with
Reply-To `hello+<thread id>@mail.bugdr.app`, so the answer finds its thread (Resend replaces our own Message-ID).

```sql
CREATE TABLE inbox_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID NOT NULL REFERENCES inbox_threads(id) ON DELETE CASCADE,
  direction   VARCHAR(3) NOT NULL CHECK (direction IN ('in', 'out')),
  body        TEXT NOT NULL,                     -- plain text; quoted history of replies cut off
  resend_id   VARCHAR(100) UNIQUE,
  message_id  VARCHAR(500),
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### password_reset_tokens
X5. Only the SHA-256 of the emailed token is stored; single use, 1 hour, at most one new link per account every
2 minutes. A reset sets `users.password_changed_at` and uses up the account's other open tokens.

```sql
CREATE TABLE password_reset_tokens (
  token_hash  CHAR(64) PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMP NOT NULL,
  used_at     TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

## Important Notes

- **Comments** are gated by `status = 'solved'` — enforced in API layer
- **Ratings** update `problems.average_rating` and `problems.rating_count` — in the API (O1), recomputed from `problem_ratings`
- **user_stats** is updated after every solve — never let it get out of sync with point_transactions
- **UNIQUE(user_id, problem_id)** on attempts means a user cannot retry a solved problem — this is intentional
