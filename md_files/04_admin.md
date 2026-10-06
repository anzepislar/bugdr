# BUGDR — Admin Dashboard

## Who is the Admin?

Admin is Bugdr's internal team — not users, not companies.
Admin manages problems, contests, and platform settings.

Access: `is_admin = TRUE` in `users` table.
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

**View all contests:**
- Table with title, type, start date, end date, status (upcoming/active/ended)
- Filter by type and status

**Create contest:**
- Title
- Description
- Type: daily / weekly / monthly
- Start date + time
- End date + time
- Reward type: subscription / merch / points
- Reward description (free text — "1 year free subscription" or "Bugdr hoodie")

**Assign problems to contest:**
- Search and select from published problems
- Recommended: Hard or Get a job difficulty

**View contest results:**
- Leaderboard for ended contests
- Rank, username, score, solve time
- Export to CSV (for sending rewards)

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
