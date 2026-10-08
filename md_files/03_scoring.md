# BUGDR — Scoring System

## Overview

Every problem you solve earns you points — more for solving fast and for using AI efficiently.
Points determine your level.
Your level is your reputation on the platform.

---

## Points Per Problem

Base points depend on difficulty:

| Difficulty | Base Points |
|-----------|------------|
| Easy | 100 |
| Medium | 250 |
| Hard | 500 |
| Get a job | 1,000 |

---

## Time Bonus

Solving faster earns a multiplier on top of base points.

| Speed | Multiplier |
|-------|-----------|
| Under 25% of time limit | 2x |
| Under 50% of time limit | 1.5x |
| Under 75% of time limit | 1.25x |
| Over 75% of time limit | 1x (no bonus) — also past the limit; the attempt stays open (D9) |

"Under" is strict: exactly 25% is already 1.5x.

**Time = all tries (D56):** giving up and starting again never resets the clock. The time used for the bonus is the
sum of every try (`attempt_tries`), measured on the server.

**Example:**
Problem has 30 minute limit. Base points: 250 (Medium).
User solves in 8 minutes (26% of limit) → 1.5x multiplier → 375 points.
User solves in 6 minutes (20% of limit) → 2x multiplier → 500 points.

---

## Final Points Formula

```
final_points = base_points × time_multiplier × efficiency_score
```

Rounded to nearest integer.
Stored in `point_transactions` as two rows (D15): `'problem_solved'` = the base points, `'time_bonus'` = the rest
(only when there is a bonus). `user_stats.total_points` and the level are updated in the same transaction.
Until the AI session score exists (S3, D51) the efficiency score is 1.

### Efficiency Score (0.5 to 2.0 multiplier)

Calculated from the solve session:

| Metric | Weight | How scored |
|--------|--------|-----------|
| Prompt count | 30% | Fewer prompts = higher score. Benchmark per difficulty. |
| Token usage | 25% | Less tokens = higher score. Surgical prompts score best. |
| Iterations | 20% | Fewer back-and-forth = higher score |
| Edit ratio | 15% | Modified AI output scores higher than blind accept |
| First run pass | 10% | Tests pass on first run = bonus |

**Efficiency score ranges:**
- 2.0 — exceptional: solved in 1-3 precise prompts, tests passed first run
- 1.5 — great: efficient prompting, minimal iterations
- 1.0 — average: reasonable prompt count and token usage
- 0.75 — below average: many prompts, high token usage
- 0.5 — poor: excessive prompting, many iterations, blind AI acceptance

**Example:**
Medium problem, base 250 pts.
User solves in 20 min (under 50% limit) → 1.5x time multiplier.
User used 4 prompts, 1,200 tokens, passed tests on first run → 1.8 efficiency score.
Final: 250 × 1.5 × 1.8 = 675 points.

### Profile Stats — new metrics shown:
- Average prompt count per problem
- Average tokens used per problem
- Efficiency rating (Intern / Efficient / Expert / Elite)
- Favorite AI tool
- First-run pass rate %

---

## Level System

Levels mirror real engineering career titles.
Each level requires significantly more points than the previous — early levels are easy to reach, later levels take serious dedication.

| Order | Level | Points Needed | Gap |
|-------|-------|--------------|-----|
| 1 | Intern | 0 | — |
| 2 | Junior | 500 | 500 |
| 3 | Mid | 1,500 | 1,000 |
| 4 | Senior | 3,500 | 2,000 |
| 5 | Staff | 7,500 | 4,000 |
| 6 | Principal | 15,000 | 7,500 |
| 7 | Distinguished | 30,000 | 15,000 |

**Why this progression:**
- Intern → Junior: ~5 easy problems — hooks the user immediately
- Junior → Mid: 2-3 weeks of consistent solving
- Mid → Senior: months of serious use
- Staff and above: only the most dedicated engineers
- Distinguished: elite status, very few people reach this

---

## Streak System

Streaks work like GitHub commit graphs.

**How streaks work:**
- Opening any problem counts as activity for that day
- Streak continues as long as you open at least one problem per day
- Streak resets if a full calendar day passes with no activity
- Longest streak is tracked separately from current streak
- "Opening" = a signed-in user loads the problem detail page (`GET /problems/:slug`); a day is a UTC calendar day
  (D6, D7). Built in slice P2: `user_daily_activity.problems_opened` + `user_stats.current_streak/longest_streak`

**Why opening counts (not just solving):**
Solving a Hard or "Get a job" problem can take multiple days.
Penalizing users for working on hard problems would discourage tackling them.

**Streak display:**
- GitHub-style commit graph on profile page
- Shows last 52 weeks (1 year)
- Color intensity = number of problems solved that day
- Current streak and longest streak shown as numbers

---

## Points are an Append-Only Ledger

Points are never updated directly.
Every point event creates a new row in `point_transactions`.

**This means:**
- Full audit trail of how every point was earned
- Easy to recalculate totals if needed
- No risk of data corruption from partial updates

**Reasons (stored in `point_transactions.reason`):**
- `problem_solved` — standard solve
- `time_bonus` — additional time multiplier points
- `contest_bonus` — bonus from winning/placing in contest

---

## Level Calculation

Level is determined by total points at any given moment.

```
SELECT level_name
FROM level_thresholds
WHERE min_points <= user_total_points
ORDER BY min_points DESC
LIMIT 1;
```

Level is recalculated and stored in `user_stats.current_level` after every solve.

---

## Contest Scoring

Contest problems use the same points formula as regular problems.

**Contest total score:**
```
contest_total = sum of points earned across all solved contest problems
```

**Ranking within a contest:**
1. Most problems solved wins
2. Tiebreak: highest total score
3. Tiebreak: fastest total solve time across all problems

**Example — contest with 3 problems:**
- User A solves all 3: 100 + 375 + 800 = 1,275 pts → rank 1
- User B solves all 3: 100 + 250 + 500 = 850 pts → rank 2
- User C solves 2: 100 + 500 = 600 pts → rank 3

Ranks are calculated and written to `contest_entries.rank` when the contest ends (`ends_at` passes).

**Rewards go to rank 1 only** — monthly contests, see `04_admin.md`.

---

## Stats Shown on Profile

| Stat | Description |
|------|-------------|
| Total Points | Sum of all point transactions |
| Current Level | Calculated from total points |
| Problems Solved | Count of solved attempts |
| Current Streak | Consecutive days with activity |
| Longest Streak | Historical best streak |
| Problems by difficulty | How many Easy / Medium / Hard / Get a job solved |
| Problems by category | How many per role category |
| Average solve time | Average time taken across all solves |
| Average prompts / tokens | Per solved problem (from `solve_sessions`) |
| Efficiency rating | Intern / Efficient / Expert / Elite (from average `efficiency_score`) |
| Favorite AI tool | Most used `prompt_events.ai_tool` |
| First-run pass rate | Share of solves with `tests_passed_on_first_run` |
