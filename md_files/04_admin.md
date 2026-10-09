# BUGDR — Admin Dashboard

## Who is the Admin?

Admin is Bugdr's internal team — not users, not companies.
Admin manages problems, contests, and platform settings.

Access: the admin is **not a user account** (D48, decided 9. 10. 2026). Email + password hash live only in `backend/.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, made with `npm run hash-password`); login at `/admin/login` sets a separate admin session cookie (8 h). Built in slice A1; `users.is_admin` is gone (migration 0013).
Route: `/admin` — fully protected, redirects non-admins.

---

## Admin Pages

### 1. Problems Management (`/admin/problems`)

**View all problems (built, A2):**
- Table with title, difficulty, role, status (published/draft), solves, rating; tabs All / Published / Drafts
- Search by title (difficulty/category filters not built yet)
- Drafts open "Edit", published problems "Manage" (View + Unpublish)

**Create new problem (`/admin/problems/new`, built A2 + A10, 3 steps):**
1. Analysis: upload a ZIP (max 10 MB; node_modules, .git, lock and binary files are left out) → Duplicate Check
   (same files already added?) → Production Test (no npm packages, every .js/.ts file loads under Node 24) →
   AI Analysis (Claude Sonnet 5.5, server only). The analysis creates the draft with the code right away (D22).
2. Review: title, short description, codebase context + incident report (`02_problems.md` rules), tags, difficulty
   (AI suggestion marked), role, acceptance checks (3+). Time limit = low end of the recommended range (D45).
3. Publish: Save as Draft, Run checks, Publish Problem.
- Source (github / claude_generated) + source URL: not built
- Planned: the analysis also with an OpenAI key (slice A9.1)

**Problem code (A3, decided 9. 10. 2026):**
- The code is never edited in the admin - the whole codebase is replaced by uploading a new ZIP
  (duplicate check + production test run again; text, checks and hidden tests stay)
- The edit page shows the repository name and the file list

**Problem checks (Review step / edit page):**
- Add, edit, delete checks; order = position in the list (no drag yet)
- Check type selector, command input, must pass toggle (expected output not in the UI)

**Check run + publish (built A4 + A5, D20):**
- Run checks: every check runs in Docker against the buggy code and must FAIL (a check that passes does not
  catch the bug). A passing run only counts for the version it ran on - any save or code replacement clears it.
- Publish Problem always runs the checks again and publishes only if all fail. Needs a role, at least 3 checks,
  the code and hidden test files.
- Unpublish: back to an editable draft; not while the problem is in a contest that has not ended.

---

### 2. Contests Management (`/admin/contests`)

**Status is calculated, never stored.**
There is no status column. Every screen and API derives it from the dates
(frontend: `src/lib/getContestStatus.ts`):

| Status | Rule |
|--------|------|
| Draft | `starts_at` is null (not scheduled yet) |
| Scheduled | `starts_at` is set and `starts_at > now()` |
| Active | `starts_at <= now()` and `ends_at >= now()` |
| Ended | `ends_at < now()` |

Lifecycle: **Draft → Scheduled → Active → Ended.** A scheduled contest can be
cancelled, which sets `starts_at` (and `ends_at`) back to null, so it is a
draft again. Contests become active and end on their own; there is no
manual "start" or "end".

Schema impact: `contests.starts_at` / `ends_at` must allow NULL (drafts).

**View all contests (`/admin/contests`):**
- Search by title
- Contests grouped by status: Active, Scheduled, Drafts, Ended
- Status badges: Draft and Ended muted gray, Scheduled Action blue,
  Active green with a pulsing dot
- Each row: title, type, status, date range ("Not scheduled" for drafts),
  number of problems, reward
- Actions per status:
  - Draft: Edit, Schedule (uses the automatic dates for its type), Delete
  - Scheduled: Edit, Cancel (back to draft)
  - Active: View results (read only)
  - Ended: View results, Archive
- Only drafts and scheduled contests can be edited.

**Create / edit contest (`/admin/contests/new`, `/admin/contests/[id]/edit`) - 4 steps:**

1. **Basic info** - title, description, contest type.
   The type drives the dates automatically (UTC, frontend: `src/lib/getContestDates.ts`):
   - Daily: starts at the next midnight, runs 24 hours (00:00-23:59:59)
   - Weekly: starts next Monday 00:00, ends Sunday 23:59:59
   - Monthly: starts on the 1st of next month 00:00, ends on its last day 23:59:59

   A preview shows "This contest will run from [date] to [date]".
   **Custom dates** (off by default) overrides the automatic dates with a
   manual start and end. Custom dates must end after they start and start
   in the future.
2. **Problems** - search published problems (title, difficulty, category),
   click to add, remove from the added list. **At least 1 problem per
   contest.** Recommended: Hard or Get a job difficulty.
3. **Reward** - reward type (subscription / merch / points) or no reward;
   reward description is free text ("1 year free subscription", "Bugdr
   hoodie") and required once a type is chosen.
4. **Review** - summary of everything, then:
   - **Save as Draft** - saved with `starts_at = null` (status Draft)
   - **Schedule Contest** - saved with the automatic or custom dates
     (status Scheduled)

**View contest results:**
- Leaderboard for ended contests
- Rank, username, score, solve time
- Export to CSV (for sending rewards)

**Archive:** ended contests can be archived to hide them from the list.
`contests.archived_at TIMESTAMP` (null = not archived) exists since T1 (migration 0011); archiving itself comes with A6.

---

### 3. Users Management (`/admin/users`)

**View all users:**
- Table with username, email, level, join date, last active, ban status
- Search by username or email

**User detail:**
- Profile info
- Stats
- All attempts (solved, abandoned, in progress), each with its tries (`attempt_tries`: start, end, outcome, duration)
- Ban / unban toggle

---

### 4. Platform Stats (`/admin/stats`)

**Overview:**
- Total users
- Active users (last 7 days, last 30 days)
- Total problems
- Total solves today / this week / this month
- Most solved problems
- Hardest problems (lowest solve rate)
- Most popular categories

---

## AI Session Analytics (/admin/analytics)

Additional admin page for AI usage insights:

**Platform-wide metrics:**
- Average prompts per problem by difficulty
- Average tokens per solve
- Most used AI tools (Claude vs GPT vs Gemini vs other)
- Efficiency score distribution across all users
- First-run pass rate across all problems

**Per-problem insights:**
- Average prompts needed to solve this problem
- Average tokens used
- Most common AI tools used
- Efficiency benchmark (used for scoring calibration)

These benchmarks are used to calibrate the efficiency score — a "good" prompt count for a Hard problem is different from an Easy problem.

---

## Contest Rewards

### Current rewards (pre-subscription):
- **Monthly contest winner** — Bugdr merch (hoodie ~€20, t-shirt ~€10)
- Admin manually contacts winner after contest ends
- Winner selected from contest leaderboard (rank 1)

### Future rewards (post-subscription launch):
- **Monthly contest winner** — 1 year free subscription
- Weekly contest winner — TBD

### Reward flow:
1. Contest ends automatically at `ends_at`
2. Admin views contest results in `/admin/contests`
3. Admin contacts winner via email (shown in user detail)
4. Admin marks reward as sent

---

## Problem Quality Guidelines

Before publishing a problem, admin should verify:

- [ ] Codebase context explains what the system does clearly — reads like a real job scenario
- [ ] Incident report shows only symptoms (logs, alerts, user complaints) — never the cause
- [ ] No "expected behavior" anywhere, and no comments in `files` hinting at the bug location
- [ ] All checks are working correctly (enforced: Publish runs them and every one must fail on the buggy code)
- [ ] At least 3 checks that actually validate the fix (enforced: Publish refuses fewer than 3)
- [ ] Time limit is fair for the difficulty level
- [ ] Codebase is clean — no sensitive data, no real company names
- [ ] Tags are accurate and useful for search

**Recommended time limits by difficulty:**

| Difficulty | Time Limit |
|-----------|-----------|
| Easy | 15-30 minutes |
| Medium | 30-60 minutes |
| Hard | 60-120 minutes |
| Get a job | 120-240 minutes |

---

## Admin Rules

- Never publish a problem without testing all checks first
- Never delete a problem that has been solved by users — unpublish instead
- Contest problems should be Hard or Get a job difficulty
- Reward merch is only for monthly contests — not daily or weekly in v1
