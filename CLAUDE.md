# BUGDR — Claude Code Reference

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

| Layer | Tech |
|-------|------|
| Frontend | Next.js + TypeScript + Tailwind CSS |
| Backend | Node.js + Express |
| Database | PostgreSQL — plain SQL, no ORM |
| Code editor | Monaco Editor (@monaco-editor/react) |
| Problem execution | Docker containers |
| Auth | JWT |
| AI | Claude API — built-in AI chat + problem analysis, server-side only |

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

**Logos** — `frontend/public/logo/` (transparent PNG, light-on-dark, cropped).
Always use these files — never recreate the logo from screenshots.

| File | Content | Size |
|------|---------|------|
| `bugdr-logo.png` | Bug mark + "bug.dr" wordmark | 447×126 |
| `bugdr-wordmark.png` | "bug.dr" wordmark, eye as the dot | 352×111 |
| `bugdr-mark.png` | Bug mark only (cut from `bugdr-logo.png`) | 90×126 |

Favicon: `frontend/src/app/favicon.ico` = bug mark on a canvas-colored rounded square.
Placement of logos per screen: follow the Figma designs.

Use with `next/image`, e.g. `<Image src="/logo/bugdr-logo.png" alt="Bugdr" width={447} height={126} />`
and scale with a CSS height. Raster files: for sharp retina display keep the rendered width at ≤ half the file width (logo ≤ ~220px wide).

---

## Routes

| Route | Page |
|-------|------|
| `/login` | Login |
| `/signup` | Signup |
| `/forgot-password` | Password reset request |
| `/onboarding` | Onboarding (4 steps: role, experience, goal, languages) |
| `/dashboard` | Main feed + contests |
| `/problems` | Browse all problems |
| `/problems/[slug]` | Problem detail |
| `/problems/[slug]/solve` | Fullscreen, 3 panels: codebase context + incident report · editor + terminal/test results · AI chat |
| `/profile/[username]` | User profile |
| `/settings` | Settings (profile, practice preferences, account) |
| `/leaderboard` | Global ranking by efficiency score (planned, not built — D52) |
| `/contests` | Contest list |
| `/contests/[id]` | Contest detail |
| `/admin` | Admin overview (stats + charts) |
| `/admin/problems/new` | Add problem (3 steps: Analysis, Review, Publish) |
| `/admin/analytics` | AI session analytics (planned, not built) |
| `/admin/contests` | Contest management (tabs by status) |
| `/admin/contests/new` | Create contest (4-step wizard) |
| `/admin/contests/[id]/edit` | Edit a draft or scheduled contest |

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
- Problem descriptions never hint at the bug — users see codebase context (what the system does) and incident report (symptoms, logs, user complaints) only. Never expected behavior, never the cause, never the file location.
- Public without login: `/dashboard`, `/problems`, `/problems/[slug]` (+ auth pages). Account-only parts are blurred with "Log in to unlock" (`Locked`, `src/components/app/Session.tsx`). The editor (`/problems/[slug]/solve`), `/settings`, `/onboarding`, `/contests/*`, `/profile/*` and `/admin/*` redirect to `/login?next=…` (`src/proxy.ts`, which checks the session with the backend; `/admin/*` is admin-only → `/dashboard`)

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
final_points = base_points × time_multiplier × efficiency_score   (efficiency 0.5–2.0, md_files/03_scoring.md)

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
Last session: 8. 10. 2026 — Seja 13 (problem text = codebase context + incident report, no expected behavior; migration 0006, seed rewritten). Before: Seja 12 (AI session docs + AI chat panel on the solve page, mock)
Phase: Backend slices (06_backend_slices.md); frontend on mock data until each slice swaps it
Frontend: 17 screens on mock data — /admin (overview), /admin/contests, /admin/contests/new, /admin/contests/[id]/edit, /onboarding, /login, /signup, /forgot-password, /profile/[username], /settings, /contests, /contests/[id], /admin/problems/new (Add Problem, 3 steps), /dashboard (+ shared sidebar/top bar in app/(app)/layout.tsx), /problems, /problems/[slug] (Overview + Discussion; + solved state), /problems/[slug]/solve (fullscreen, 3 panels: description, read-only Monaco stand-in, AI chat on mock)
Backend: M0 (F0-F4) and M1 (P1-P2) done (backend/, `docker compose up -d` in backend/, npm run migrate/test) — plan in md_files/06_backend_slices.md
Database: PostgreSQL 17 in Docker; migrations 0001 (level_thresholds), 0002 (users, user_stats), 0003 (user_profiles), 0004 (problems), 0005 (problem detail), 0006 (problem brief) applied; `npm run seed` = 12 dev problems with code and checks
Next step: slice R1 (start solving, M2); AI session = milestone M8 (S1-S5) in 06, waits for D51/D52. Admin login is not a user account (D48) — user will provide credentials via backend/.env, decide before M6
Open questions: D20 validation rule · D21-D22 · D24 feed filters vs. D19 · D25 notifications · D28 Give up · D30 comment helpful/replies · D32 contest history checks · D34 profile fields schema · D35 empty settings tabs · D36 starting difficulty · D37 GitHub sign-in · D45 Add Problem title/time limit/dry-run · D46 stats windows · D48 admin is not a user account · D50 Add Problem fields after the description split · D51 efficiency score details · D52 leaderboard rule (all in 06)
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

- Always check existing components in src/components/ before creating new ones
- Reuse existing UI primitives (Button, Input, Modal, Table, etc.) — never duplicate them
- If a component needs a new variant, extend the existing one — don't create a parallel version

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

---

## UI Rules

Learned from fixes on `/problems` and `/problems/[slug]`. Apply to every new screen.

**Page layout**
- Page containers: full width with px-6 below 1400px, centered at max-w-[1200px] mx-auto at 1400px and above using a custom 'wide' Tailwind breakpoint — never center content on screens where it would leave minimal side space
- No `min-h-*`, fixed heights or extra bottom padding on page content — the page ends after the last element (+ the standard `py-8`).
- Two-column layouts: `flex flex-col lg:flex-row lg:items-start gap-8`; main column `min-w-0 flex-1`, side panel `shrink-0 lg:w-80 xl:w-96`. `items-start` so a short column never stretches or leaves a gap. On phones the panel goes below the main content.
- A side panel holding the primary action is sticky only where it is a side column: `lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto`.
- Keep side panels short (the primary action + a few facts). Content the user reads (descriptions, check lists) belongs in the main column, otherwise short tabs leave a gap under the main column.
- A tab with little content (empty / locked state) fills the column height (`lg:self-stretch` + `h-full` empty-state card) instead of leaving space next to the side panel.
- When a side panel spans full width (below `lg`), lay it out horizontally and give buttons `sm:w-fit` — never a full-width card with a 700px button.

- The solve page is fullscreen (100vw 100vh) with its own layout — never use the main app layout wrapper on this page
- Split pane layouts always have a collapse option for the description panel — users must be able to hide it completely

**Content**
- Never hide information the user needs to make a decision (e.g. acceptance checks) behind a toggle on first load. Long lists go in two columns (`sm:grid-cols-2`) rather than a collapsed list.
- Section headings: `font-semibold`, at least `text-lg` (description sections use `text-xl`; exception: the problem text headings "Your assignment" / "What the team is seeing" use `text-lg`), `mt-8` above each section.
- Locked / gated states are a banner, not plain text: full-width card, lock icon on the left, `bg-surface border border-border`, one sentence that says how to unlock.

**Card grids and lists**
- Columns: 1 → `md:` 2 → `lg:` 3 → `2xl:` 4. Never let cards grow unbounded; cards get `min-w-0`, long tag lists `truncate`.
- A short last row stays left-aligned (plain CSS grid, no centering tricks).
- Long lists use infinite scroll, not pagination: the first load fills the screen plus one row (so the page can scroll), each later load adds about a screenful when the end of the list comes into view (IntersectionObserver). Changing a filter resets to the first load. "Showing X of Y" left-aligned under the list.

**Controls**
- Filter bars: one column on phones (`grid gap-4 sm:grid-cols-2 md:grid-cols-4`), labels must never clip.
- Related toggles (e.g. "Saved problems") sit in the same row as the filters as the last item, using the existing button style.

**Verification after every screen**
- Check 320, 390, 768, 1024, 1440 and 2560 px wide: no horizontal scroll, no clipped labels, no text overflowing a card.
