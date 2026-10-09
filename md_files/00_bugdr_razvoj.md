# BUGDR — Development Overview

## What is Bugdr?

Bugdr is a platform where engineers solve real production bugs using AI — and we measure how well they do it.

The question is no longer "can you code?" — it's "can you use AI effectively to solve real engineering problems?"

Engineers solve problems using any AI tool they want (Claude, GPT, Gemini, Copilot — anything). Bugdr captures the full session and scores them on:
- How fast they solved it
- How many prompts they needed
- How many tokens they used
- How many iterations it took
- How much they understood the AI output (edit ratio)

This defines the next generation of engineering skill.

**Slogan:** Debug real code. With real AI. Prove you're the best at it.
**Domain:** bugdr.app

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js + TypeScript + Tailwind CSS |
| Backend | Node.js + Express |
| Database | PostgreSQL (plain SQL, no ORM) |
| Code editor | Monaco Editor (@monaco-editor/react) |
| Problem execution | Docker containers |
| Auth | JWT |
| AI | Claude API or OpenAI (by key, A9.1) for problem analysis; built-in AI chat provider decided at M8 — server-side only |

---

## Local Setup

```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend + database (Docker must be running)
cd backend
npm install
cp .env.example .env     # optional locally; JWT_SECRET is required in production
docker compose up -d     # PostgreSQL 17 (+ test database bugdr_test)
npm run migrate          # applies new files from /migrations
npm run seed             # dev data from /seeds
npm run dev              # API on http://localhost:4000/api/v1
npm test                 # node:test against bugdr_test (runner tests need Docker + `docker pull node:24-alpine`)
```

The frontend proxies `/api/*` to the backend (`next.config.ts`, `BACKEND_URL`, default `http://localhost:4000`).

---

## Repository Structure

```
bugdr/
├── frontend/          # Next.js app
├── backend/           # Node.js + Express API
├── migrations/        # Plain SQL migration files
├── seeds/             # Seed data for development
└── md_files/          # This documentation
```

---

## Current Status

```
Phase: Backend slices (06_backend_slices.md) - frontend screens swap their mocks slice by slice
Frontend: 22 screens; login, signup, logout, onboarding, /problems, /problems/[slug] (incl. rating and discussion),
  the solve page, /profile/[username], /settings (profile tab), /dashboard, the sidebar, /contests, /contests/[id],
  /admin/login, /admin (overview), /admin/problems (+ new, edit), /admin/contests (+ new, edit, results inline)
  and /admin/users (+ [id]) use the real API; still on mock data: the solve page's AI chat (M8)
Backend: Milestones M0 (F0-F4: skeleton, levels, auth, route protection, onboarding), M1 (P1-P2: problem list,
  bookmarks, problem detail, streak on view) and M2 (R1-R6: start, give up, try history, Docker check runner,
  solve + points, terminal, live results), M3 (O1-O2: ratings, comments) and M4 (U1-U3: profile + settings,
  activity grid + streak on read, dashboard) and M5 (T1-T2: contest list + detail, entries, participation,
  history) and M6 (admin: A1 login (not a user account, D48), A2 problem list + drafts, A10 ZIP upload + AI
  analysis, A3 code replacement, A4 check run, A5 publish/unpublish, A6 contests, A7 contest results + CSV +
  reward sent, A8 users + ban, A9 platform stats, A9.1 analysis with Claude or OpenAI by key) done;
  next M7 (Z1, Z2) or M8 AI session (S1-S5, waits for D51/D52)
Database: PostgreSQL 17 in Docker; migrations 0001-0017 (levels, users, profiles, problems, problem detail,
  problem brief, attempt tries, check results + points ledger, comment replies + helpful, profile fields, contests,
  contest entries, drop users.is_admin, bug summary, codebase hash, dry-run version, contest reward sent);
  `npm run seed` = 12 dev problems with code and checks, no made-up ratings (D57); only payment-retries-disappear
  is runnable so far; + 5 dev contests (dates relative to the seed run)
Detailed status: CLAUDE.md "Current Status" and 06_backend_slices.md "Stanje"
```

---

## Team

| Person | Role |
|--------|------|
| Anže | Main builder — frontend, backend, architecture |
| Friend 1 | Marketing |
| Friend 2 | Landing page + marketing support |

---

## Development Rules

- One screen at a time
- Frontend first (from Figma), then backend dev slices, then full backend
- Mock data first — API connections later
- Never commit `.env`, passwords, `node_modules`
- Always run lint + typecheck + build before committing
- Work in branches, never directly on `main`
- `main` must always be stable

**Always ask before:**
- Deleting files
- Adding unclear routes
- Force pushing
- Changing Git remote
- Live API or database changes in production

---

## Development Phases

```
Phase 1 — Frontend (done for the current designs)
  Build all screens from Figma designs with mock data

Phase 2 — Backend dev slices (current)
  One vertical slice at a time (06_backend_slices.md): migration + endpoint + test + swap the screen's mock

Phase 3 — Full backend
  Connect everything, implement business logic

Phase 4 — Problem execution engine
  Docker containers, Monaco editor, test runner, terminal (done in M2); AI chat + session capture (M8)

Phase 5 — Admin dashboard
  Contest management, problem management

Phase 6 — CI/CD + deployment
  GitHub Actions, production server
```

---

## Git Workflow

```bash
# Start new feature
git checkout -b feature/screen-name

# Daily work
git status
git add .
git commit -m "feat: short description"
git push

# Merge to main only via Pull Request
```

---

## Architecture

```
Browser (Next.js)
  → API calls only, never direct DB access
  → Monaco Editor for code editing
  → Terminal UI component
  → AI chat panel (prompts go through the backend)

Backend (Node.js/Express)
  → JWT authentication
  → Business logic
  → PostgreSQL queries
  → Docker container management
  → Claude API or OpenAI (problem analysis, A9.1; AI chat provider decided at M8) — keys server-side only

Docker (Problem Execution, backend/src/modules/runner)
  → Official node:24-alpine image, driven through the docker CLI (no extra dependency)
  → One throwaway container per check run; one terminal container per open attempt
  → No network, CPU/memory/process limits, read-only system, non-root user
  → Streams check results and terminal output back to the browser

PostgreSQL
  → Single database
  → Plain SQL migrations
  → No ORM
```

---

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Login / Signup | `/login` `/signup` `/forgot-password` | Standard auth + password reset request |
| Onboarding | `/onboarding` | 4 steps after signup: role, experience, goal, languages |
| Dashboard | `/dashboard` | Personalized feed + contests |
| Problems | `/problems` | Browse all problems |
| Problem detail | `/problems/[slug]` | Codebase context + incident report + start |
| Problem editor | `/problems/[slug]/solve` | Monaco + terminal + checks + AI chat |
| Profile | `/profile/[username]` | Stats + solved problems |
| Settings | `/settings` | Profile details, engineering path, public profile |
| Contests | `/contests` | Daily/weekly/monthly |
| Contest detail | `/contests/[id]` | Incident, rules, entry + your participation |
| Leaderboard | `/leaderboard` | Global ranking by efficiency score |
| Admin | `/admin` | Problem + contest management, AI session analytics (`/admin/analytics`) |
| Landing | Separate repo | Friend 2 builds this |

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

## Connected Documents

| File | What it covers |
|------|---------------|
| `01_database.md` | Full database schema |
| `02_problems.md` | Problem structure, execution, checks |
| `03_scoring.md` | Points, levels, streaks |
| `04_admin.md` | Admin dashboard, contests |
| `05_dnevnik_dela.md` | Session log (Slovenian) |
| `06_backend_slices.md` | Backend plan as slices, decisions, mock register (Slovenian) |
| `CLAUDE.md` | Quick reference for Claude Code |
