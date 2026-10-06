# BUGDR — Claude Code Reference

## What is Bugdr?

A platform where engineers fix real production bugs to prove their skills.
Unlike LeetCode — these problems can't be solved by AI copy-paste.

**Domain:** bugdr.app
**Slogan:** Debug real code. Get real results.

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js + TypeScript + Tailwind CSS |
| Backend | Node.js + Express |
| Database | PostgreSQL — plain SQL, no ORM |
| Code editor | Monaco Editor (@monaco-editor/react) |
| Problem execution | Docker containers |
| Auth | JWT |

---

## Design System — Graphite Signal

| Token | Value | Usage |
|-------|-------|-------|
| Canvas | #151618 | Page background |
| Surface | #202226 | Cards, panels, sidebar |
| Border | #383C43 | Borders and dividers |
| Action | #8BACFF | Buttons, links, active states |
| Text | #F2F3F5 | Primary text |
| Muted | #ACB2BE | Secondary text, labels |
| Passed | #22c55e | Green — test passed |
| Pending | #f59e0b | Yellow — running |
| Failed | #ef4444 | Red — test failed |
| Highlight | #EBA599 | Secondary accent — use sparingly |
| Font | Inter | All text |
| Border radius | 6px | All rounded elements |

**Difficulty colors:**
- Easy: #22c55e (green)
- Medium: #f59e0b (yellow)
- Hard: #f97316 (orange)
- Get a job: #ef4444 (red)

**Rules:**
- Content surfaces stay neutral — no heavy color use
- Action (#8BACFF) only for interactive elements
- Highlight (#EBA599) sparingly — difficulty badges, alerts only
- Never use pure black or pure white

---

## Routes

| Route | Page |
|-------|------|
| `/login` | Login |
| `/signup` | Signup |
| `/onboarding` | Onboarding (3 questions) |
| `/dashboard` | Main feed + contests |
| `/problems` | Browse all problems |
| `/problems/[slug]` | Problem detail |
| `/problems/[slug]/solve` | Editor + terminal + checks |
| `/profile/[username]` | User profile |
| `/contests` | Contest list |
| `/admin` | Admin dashboard |

---

## Roles

| Role | Access |
|------|--------|
| User | All user-facing pages |
| Admin | `/admin/*` + all user pages |

---

## Key Business Rules

- Users can only solve each problem once (enforced in DB with UNIQUE constraint)
- Comments are locked until the problem is solved
- Ratings are locked until the problem is solved
- Streak continues if user opens at least one problem per day
- Points are never updated directly — always insert a new `point_transactions` row
- Frontend never reads the database directly — always through API

---

## Level System

| Level | Min Points |
|-------|-----------|
| Intern | 0 |
| Junior | 500 |
| Mid | 1,500 |
| Senior | 3,500 |
| Staff | 7,500 |
| Principal | 15,000 |
| Distinguished | 30,000 |

---

## Points Formula

```
final_points = base_points × time_multiplier

Base points: Easy 100 / Medium 250 / Hard 500 / Get a job 1000

Time multiplier:
  Under 25% of time limit → 2x
  Under 50% → 1.5x
  Under 75% → 1.25x
  Over 75% → 1x
```

---

## Current Status

Updated at the end of every session. Read this first in a new session.

```
Last session: 6. 10. 2026 — Seja 1 (project setup, backend plan, admin Create Problem)
Phase: Frontend build from Figma designs (mock data)
Frontend: 1 screen on mock data — /admin/problems/new (Create Problem, 6 steps)
Backend: Not started — plan in md_files/06_backend_slices.md (decisions D1-D19 locked)
Database: Schema designed, not created yet
Next step: next frontend screen (waiting for user)
Open questions: add schema changes to 01_database.md? · D20 validation rule (all checks fail vs. pass on solution) · D21-D22 in 06
```

### Session tracking

- Every session gets its own entry in `md_files/05_dnevnik_dela.md`
  (Slovenian): `## D. M. YYYY — Seja N: <naslov>`, numbered continuously.
- At the end of every session (or after every finished screen/slice):
  1. add/extend the session's entry in `05_dnevnik_dela.md`,
  2. update the mock register and slices in `06_backend_slices.md` if a screen was built,
  3. update the "Current Status" block above.

---

## Development Rules

- One screen at a time
- Do exactly what is asked — nothing more
- Do not modify files not mentioned
- Do not refactor unless asked
- Always ask before deleting files or changing routes
- Run lint + typecheck + build after every screen
- Never commit .env or passwords

---

## Full Documentation

| File | Content |
|------|---------|
| `md_files/00_bugdr_razvoj.md` | Full project overview |
| `md_files/01_database.md` | Complete database schema |
| `md_files/02_problems.md` | Problem structure + execution |
| `md_files/03_scoring.md` | Points, levels, streaks |
| `md_files/04_admin.md` | Admin dashboard |
| `md_files/05_dnevnik_dela.md` | Session log — what was built, per session (Slovenian) |
| `md_files/06_backend_slices.md` | Backend plan as slices + mock register (Slovenian) |
