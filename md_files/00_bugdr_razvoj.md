# BUGDR — Development Overview

## What is Bugdr?

Bugdr is a platform where engineers fix real production bugs.

Unlike LeetCode which tests algorithmic trivia that AI can solve in seconds, Bugdr tests what actually matters — can you debug a real codebase at 3am when production is down?

**Slogan:**
```
Debug real code. Get real results.
```

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

---

## Local Setup

```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend
cd backend
npm install
npm run dev

# Database
docker-compose up -d
npm run migrate
npm run seed
```

---

## Repository Structure

```
bugdr/
├── frontend/          # Next.js app
├── backend/           # Node.js + Express API
├── docker/            # Docker configs for problem execution
├── migrations/        # Plain SQL migration files
├── seeds/             # Seed data for development
└── md_files/          # This documentation
```

---

## Current Status

```
Phase: Planning + Design
Frontend: In progress (Figma designs mostly done)
Backend: Not started
Database: Schema designed, not created yet
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
Phase 1 — Frontend (current)
  Build all screens from Figma designs with mock data

Phase 2 — Backend dev slices (alongside frontend)
  Create backend stubs for each feature as frontend builds

Phase 3 — Full backend
  Connect everything, implement business logic

Phase 4 — Problem execution engine
  Docker containers, Monaco editor, test runner

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

Backend (Node.js/Express)
  → JWT authentication
  → Business logic
  → PostgreSQL queries
  → Docker container management

Docker (Problem Execution)
  → Isolated container per problem attempt
  → Runs user code safely
  → Returns test results

PostgreSQL
  → Single database
  → Plain SQL migrations
  → No ORM
```

---

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Login / Signup | `/login` `/signup` | Standard auth |
| Onboarding | `/onboarding` | 3 questions after signup |
| Dashboard | `/dashboard` | Personalized feed + contests |
| Problems | `/problems` | Browse all problems |
| Problem detail | `/problems/[slug]` | Description + start |
| Problem editor | `/problems/[slug]/solve` | Monaco + terminal + checks |
| Profile | `/profile/[username]` | Stats + solved problems |
| Contests | `/contests` | Daily/weekly/monthly |
| Contest detail | `/contests/[id]` | Incident, rules, entry + your participation |
| Admin | `/admin` | Problem + contest management |
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
| `CLAUDE.md` | Quick reference for Claude Code |
