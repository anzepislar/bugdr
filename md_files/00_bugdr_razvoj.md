# BUGDR — Development Overview

## What is Bugdr?

Bugdr is a platform where engineers solve real production bugs using AI — and we measure how efficiently they do it.

Engineers solve problems using any AI tool they want. Bugdr captures the full session and scores them on how fast they solved it, how many prompts they needed, how many tokens they used, how many iterations it took, and how much they understood the AI output.

This defines the next generation of engineering skill — not "can you code" but "can you use AI effectively to solve real production problems."

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
| AI | Claude API or OpenAI (by key, A9.1) for problem analysis; built-in AI chat = platform key with a cheap model + daily limit, or the user's own encrypted key (S1, S6; D62/D63) — server-side only |

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
  /admin/users (+ [id]), /admin/analytics and /leaderboard use the real API, incl. the solve page's AI chat (M8)
Backend: Milestones M0 (F0-F4: skeleton, levels, auth, route protection, onboarding), M1 (P1-P2: problem list,
  bookmarks, problem detail, streak on view) and M2 (R1-R6: start, give up, try history, Docker check runner,
  solve + points, terminal, live results), M3 (O1-O2: ratings, comments) and M4 (U1-U3: profile + settings,
  activity grid + streak on read, dashboard) and M5 (T1-T2: contest list + detail, entries, participation,
  history) and M6 (admin: A1 login (not a user account, D48), A2 problem list + drafts, A10 ZIP upload + AI
  analysis, A3 code replacement, A4 check run, A5 publish/unpublish, A6 contests, A7 contest results + CSV +
  reward sent, A8 users + ban, A9 platform stats, A9.1 analysis with Claude or OpenAI by key) and M8 (AI session:
  S1 chat on a free model with a daily limit, S6 own API key, S2 session capture, S3 efficiency score in the points,
  S7 per-problem benchmark, S8 post-solve feedback, S4 public leaderboard, S5 admin AI analytics) done;
  next M7 (Z1, Z2) or M9 career paths (K1-K2, waits for D66/D67)
Database: PostgreSQL 17 in Docker; migrations 0001-0022 (levels, users, profiles, problems, problem detail,
  problem brief, attempt tries, check results + points ledger, comment replies + helpful, profile fields, contests,
  contest entries, drop users.is_admin, bug summary, codebase hash, dry-run version, contest reward sent,
  solve sessions + prompts, user API keys, editor events, problem benchmarks, solve feedback);
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

## Monetization Model

### Free tier
- Access to Easy problems
- AI assistant powered by a cheap model (Claude Haiku or GPT-3.5 equivalent)
- Basic efficiency scoring
- Public leaderboard
- Daily free AI limit (20,000 tokens, resets at midnight UTC) is the trial - no separate trial problem (D62)
- Feedback after every solve

### Connect API key (free upgrade)
- User connects their own Anthropic or OpenAI API key
- Unlocks powerful model - the user picks it from a fixed list (Claude Sonnet / Opus / Haiku, GPT-4o / GPT-4o-mini); the key is tested on save (D63)
- Their credits, their bill — platform pays nothing beyond the free trial
- Efficiency scores improve with better model — natural conversion incentive
- Framing: "Connect your API key to use a more powerful AI and improve your efficiency score"

### Career paths (earned progression)
- Free to follow, locked by efficiency threshold not payment
- Must hit efficiency benchmark to unlock next difficulty tier
- Career paths cover all problem types an engineer in that role would encounter — not just role-labeled problems
- Example: AI Engineer path includes AI/ML core + backend + database + occasional frontend

### B2B (V2)
- Companies upload their own problems
- Engineers solve them for free
- Best performers get interview invites
- Companies pay to post problems and access candidate scores
- Session replay for hiring managers

### Hackathons (V2)
- Time-boxed competitive events
- Company sponsored (revenue)
- Winners get visibility and prizes
- Seasonal events drive signups

---

## Career Paths

Career paths guide engineers from Easy to "Get a job" difficulty through a structured progression that mirrors what they would actually encounter in their target role.

### How it works
- Engineer selects their target role on onboarding
- Platform assigns a curated path of problems across relevant categories
- Four stages: Easy → Medium → Hard → Get a job
- To progress to the next stage, engineer must hit an efficiency threshold across a set of problems
- Threshold is based on efficiency score: prompt count, token usage, time, first-run pass rate
- Feedback after every solve tells them exactly what to improve

### Path composition by role

| Role | Core | Supporting | Occasional |
|------|------|-----------|-----------|
| AI Engineer | AI/ML, model integration | Backend, database | Frontend |
| Backend Engineer | Backend, APIs | Database, DevOps | Frontend |
| Frontend Engineer | Frontend, UI | Backend APIs | Performance |
| Full Stack | Frontend + Backend | Database | DevOps |
| Database Engineer | Database, queries | Backend | DevOps |

### Why breadth matters
Engineers don't just need depth in their specialty — they need enough breadth to function in a real team. Career paths reflect this. An AI engineer who can't debug a broken API is incomplete. The path teaches the full picture.

### Efficiency threshold (example)
To unlock Medium from Easy:
- Solve 3 Easy problems
- Average efficiency score above 1.2
- Average prompt count below 8
- Average first-run pass rate above 50%

Thresholds increase at each stage. Exact values TBD and adjustable in admin.

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
  Docker containers, Monaco editor, test runner, terminal (done in M2); AI chat + session capture + feedback (done in M8), career paths (M9)

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
  → Claude API or OpenAI (problem analysis, A9.1; AI chat: platform cheap model or the user's own key, S1/S6) — keys server-side only

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
| Leaderboard | `/leaderboard` | Public top 100 by points (include efficiency), All time / This month (D52) |
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
