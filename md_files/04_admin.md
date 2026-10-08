# BUGDR — Admin Dashboard

## Who is the Admin?

Admin is Bugdr's internal team — not users, not companies.
Admin manages problems, contests, and platform settings.

Access: `is_admin = TRUE` in `users` table (enforced since slice F3). Planned change: the admin will not be a user account - credentials set separately (D48 in `06_backend_slices.md`, open).
Route: `/admin` — fully protected, redirects non-admins.

---

## Admin Pages

### 1. Problems Management (`/admin/problems`)

**View all problems:**
- Table with title, difficulty, category, status (published/draft), solve count, rating
- Filter by difficulty, category, status
- Search by title

**Create new problem:**
- Title
- Description (markdown editor)
- Difficulty selector
- Category selector
- Tags input
- Time limit (minutes)
- Source (github / claude_generated) + source URL

**Problem codebase editor:**
- File tree on left
- Code editor (Monaco) for each file
- Add/remove files
- Set language + framework
- Setup commands + run command

**Problem checks editor:**
- Add checks one by one
- Set order (drag to reorder)
- Check type selector
- Command input
- Expected output (optional)
- Must pass toggle

**Publish / Unpublish toggle**

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
Not in the schema yet - needs `contests.archived_at TIMESTAMP` (null = not archived).

---

### 3. Users Management (`/admin/users`)

**View all users:**
- Table with username, email, level, join date, last active, ban status
- Search by username or email

**User detail:**
- Profile info
- Stats
- All attempts (solved, abandoned, in progress)
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

- [ ] Description explains the codebase context clearly — reads like a real job scenario
- [ ] Description does NOT hint at what is broken
- [ ] All checks are working correctly (test locally before publishing)
- [ ] At least 3 checks that actually validate the fix
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
