# BUGDR — Database Schema

## Rules

- Plain SQL only — no ORM, no Supabase, no external services
- PostgreSQL 17
- All IDs are UUID
- All timestamps default to NOW()
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
  is_admin        BOOLEAN DEFAULT FALSE,
  is_banned       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT NOW(),
  last_active_at  TIMESTAMP DEFAULT NOW()   -- refreshed at most once a minute
);
CREATE UNIQUE INDEX users_username_lower_key ON users (lower(username));
```

`is_admin` is how admin access works today; admins are planned to stop being user accounts (D48 in `06_backend_slices.md`).

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
  solve_count         INTEGER DEFAULT 0,
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
  UNIQUE(user_id, problem_id)      -- enforced at DB level: solve once only
);
```

Table built in P1 (D49) for the card status; start/solve logic comes in R1-R4.

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

Planned, not built yet — slices S1 and S2 (milestone M8 in `06_backend_slices.md`).

### solve_sessions
One session per solve attempt. Tracks the full AI interaction.

```sql
CREATE TABLE solve_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id            UUID REFERENCES user_problem_attempts(id) ON DELETE CASCADE UNIQUE,
  total_prompts         INTEGER DEFAULT 0,
  total_tokens_used     INTEGER DEFAULT 0,
  total_ai_iterations   INTEGER DEFAULT 0,
  manual_edits_count    INTEGER DEFAULT 0,
  ai_accepted_count     INTEGER DEFAULT 0,
  time_to_first_prompt  INTEGER,  -- seconds from start to first prompt
  time_on_description   INTEGER,  -- seconds spent reading before first action
  test_runs_count       INTEGER DEFAULT 0,
  tests_passed_on_first_run BOOLEAN DEFAULT FALSE,
  efficiency_score      DECIMAL(5,2) DEFAULT 0,  -- calculated on solve
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);
```

### prompt_events
Every prompt sent to AI during a solve session.

```sql
CREATE TABLE prompt_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID REFERENCES solve_sessions(id) ON DELETE CASCADE,
  prompt_index    INTEGER NOT NULL,        -- 1st, 2nd, 3rd prompt etc
  prompt_text     TEXT NOT NULL,
  prompt_tokens   INTEGER NOT NULL,
  response_tokens INTEGER NOT NULL,
  total_tokens    INTEGER NOT NULL,
  ai_tool         VARCHAR(50),             -- 'claude', 'gpt-4', 'gemini', 'copilot', 'other'
  response_used   BOOLEAN DEFAULT TRUE,    -- did user accept or ignore the response
  sent_at         TIMESTAMP DEFAULT NOW()
);
```

### editor_events
Key actions during a solve session for behavioral analysis.

```sql
CREATE TABLE editor_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID REFERENCES solve_sessions(id) ON DELETE CASCADE,
  event_type  VARCHAR(30) NOT NULL,  -- 'file_open', 'file_edit', 'test_run', 'ai_prompt', 'ai_accept', 'ai_reject', 'description_open', 'description_close'
  file_name   VARCHAR(255),
  metadata    JSONB,                 -- flexible extra data per event type
  occurred_at TIMESTAMP DEFAULT NOW()
);
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
transaction (D18); a solve after `ends_at` does not count. No `rank` (D61: no contest ranking until A7).

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

## Important Notes

- **Comments** are gated by `status = 'solved'` — enforced in API layer
- **Ratings** update `problems.average_rating` and `problems.rating_count` — in the API (O1), recomputed from `problem_ratings`
- **user_stats** is updated after every solve — never let it get out of sync with point_transactions
- **UNIQUE(user_id, problem_id)** on attempts means a user cannot retry a solved problem — this is intentional
