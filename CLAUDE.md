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
| AI | Claude API or OpenAI (by key, A9.1) for problem analysis; built-in AI chat = platform key with a cheap model + daily limit, or the user's own encrypted key (S1, S6; D62/D63) — server-side only |

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
| `/` | Dashboard: main feed + contests (`/dashboard` redirects here) |
| `/problems` | Browse all problems |
| `/problems/[slug]` | Problem detail |
| `/problems/[slug]/solve` | Fullscreen, 3 panels: codebase context + incident report · editor + terminal/test results · AI chat |
| `/profile/[username]` | User profile |
| `/settings` | Settings (profile, practice preferences, account) |
| `/leaderboard` | Public leaderboard: top 100 by points, All time / This month (S4, D52) |
| `/career-paths` | Career paths: the 5 role paths as an accordion - stage, threshold progress, assigned next problem (M9, K2) |
| `/contests` | Contest list |
| `/contests/[id]` | Contest detail |
| `/admin/login` | Admin login — separate from user login, credentials in backend/.env (D48) |
| `/admin` | Admin overview (stats + charts) |
| `/admin/problems` | All problems incl. drafts (search, Published / Drafts tabs) |
| `/admin/problems/new` | Add problem (3 steps: Analysis, Review, Publish) |
| `/admin/problems/[id]/edit` | Edit a draft problem (same form as Review) + replace its code with a new ZIP |
| `/admin/users` | Users (search) — A8 |
| `/admin/users/[id]` | User detail: profile, stats, attempts with tries, Ban / Unban — A8 |
| `/admin/analytics` | AI session analytics: stats, charts, per-problem table (S5) |
| `/admin/career-paths` | Career path metrics (stage distribution, pass rate, stuck + blockers) + unlock thresholds form (K3) |
| `/admin/contests` | Contest management (tabs by status) |
| `/admin/contests/new` | Create contest (4-step wizard) |
| `/admin/contests/[id]/edit` | Edit a draft or scheduled contest |

---

## Roles

| Role | Access |
|------|--------|
| User | All user-facing pages |
| Admin | `/admin/*` only — separate login, not a user account (D48) |

---

## Key Business Rules

- Users can only solve each general problem once (enforced in DB with UNIQUE constraint); career path problems can come back 3 months after the last solve on that path (D66)
- Comments are locked until the problem is solved
- Ratings are locked until the problem is solved
- Streak continues if user opens at least one problem per day
- Points are never updated directly — always insert a new point_transactions row
- Frontend never reads the database directly — always through API
- Free tier uses cheap model (Claude Haiku / GPT-3.5) — platform absorbs cost
- Premium model requires user's own API key — their credits, platform pays nothing
- Career path stages unlock by efficiency threshold (last 5 solves on the stage, D66); path problems are hidden from /problems
- During development everything is open to everyone; career paths + AI feedback go behind a paywall later (D67)
- Post-solve feedback is generated automatically after every solve — cheap model sufficient
- Problem descriptions never hint at the bug — codebase context + incident report only

---

## Business Model Summary

Free tier: cheap AI model, Easy problems, basic scoring, feedback after every solve
API key: connect own key → powerful model → better scores → natural conversion
Career paths: structured role-based progression, efficiency-gated stages
V2: company problems, hackathons, B2B hiring pipeline

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

Every level has a rank badge: `frontend/src/components/RankBadge.tsx` (`<RankBadge rank="Staff" size={48} showLabel />`, Distinguished renders 1.3× larger). Use it wherever a level is shown - never a plain number. Helpers there: `getRankColor`, `getRankFromPoints`, `getNextRank`.

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
Last session: 10. 10. 2026 — Seja 23 (quick fixes: log out reloads the current page instead of going to /login - account-only pages go to login via the proxy; dashboard moved from /dashboard to / (old URL redirects permanently, Next.js starter page removed); rank badges: new RankBadge component (7 hexagon badges from the user's design) replaces the level number on the dashboard progress panel and sits next to the level on the leaderboard and the profile stats; docs 00/06 updated; all mock data removed: frontend/src/lib/mock/, public/mock/, unused DefineStep/ValidateStep deleted, guest dashboard blur shows an empty new-account state, /forgot-password says reset is not available yet instead of faking a sent link; sample problems + contests deleted from the dev DB (user decision) - seed files kept for the tests, do not run npm run seed on the dev DB unless samples are wanted again). timezone fix: TIMESTAMP columns were read and written in Node's local time while the database runs in UTC (2 h off in Ljubljana, e.g. the solve timer) - db.js now uses UTC (session TimeZone=UTC, UTC parser + parseInputDatesAsUTC), sessionTimes parses json_agg times as UTC, regression test in f0; marketing footage recorded from a separate demo copy outside the repo (bugdr_demo database, ~/Desktop/bugdr-marketing). Before: Seja 22 (M9 done. K3 done: migration 0025 career_path_thresholds (same for every path, admin-editable, seeded with D66 values, constants removed), GET /admin/career-paths (totals, stage distribution, pass rate = past / reached, stuck = no path solve in 30 days + blockers), PUT /admin/career-paths/thresholds, new /admin/career-paths page + sidebar item (user decisions); checked in the browser at 6 widths with a locally minted admin session and temporary data (removed). K2 done: migration 0024 (user_problem_attempts.career_path + partial unique indexes, career_path_progress), GET /career-paths, POST /problems/:slug/start takes { careerPath } (path problem only from its path and only the assigned one, 403 PATH_PROBLEM / NOT_ASSIGNED), unlock check in the solve transaction, thresholds as constants in modules/careerPaths/careerPaths.js, detail page uses the latest attempt; /career-paths = one page with an accordion (user decision, no /career-paths/[role]), Career paths in the sidebar, ?path= on the solve page + Resume links; checked in the browser at 6 widths with temporary dev data (removed). K1 done: migration 0023 problem_career_paths, careerPaths on the admin draft, "Career paths" checkboxes on the Review form (+ edit page), path problems hidden from /problems, the dashboard feed and the contest picker; /problems/[slug] of a path problem still reachable until K2. M9 prep, docs only: D66 career paths decided - every path (5 roles) has its own problems Easy → Get a job, hidden from /problems, a problem can be in several paths (admin picks on Publish); any number of paths at once; one assigned problem at a time (oldest first, no skipping); thresholds from the user (Easy→Medium 5 solves, eff ≥ 1.2, prompts ≤ 10, first run ≥ 40 %; Medium→Hard 5, 1.4, 7, 50 %, time ×1.25; Hard→Get a job 3, 1.6, 5, 60 %, ×1.5) on the last 5 solves of the stage (Hard 3); pool exhausted → rotate back after 3 months, re-solve gives points again; solves separate per path; routes /career-paths + /career-paths/[role]. D67: everything open during development, paywall later for career paths + AI feedback. M9 re-sliced: K1 admin path problems, K2 progress + assignment + unlock + pages, K3 admin thresholds + metrics). Before: Seja 21 (M8 done. S5 admin AI analytics: GET /admin/analytics + /admin/analytics/problems/:id, /admin/analytics page (user chose the full layout: 5 stat cards, 4 charts, per-problem table with expandable rows), Analytics in the admin sidebar, StatCard takes a text value; not checked in the browser (admin login needs .env credentials). S4 leaderboard: D52 = points, top 100, All time + This month (UTC), public also for guests, private/banned left out; GET /leaderboard?period=, new /leaderboard page + 'Leaderboard' sidebar item. S8 post-solve feedback: migration 0022 solve_feedback, pending row in the solve transaction, generated after commit (cheap model, platform key, top-25% comparison from 8 solves), GET /attempts/:id/feedback (failed restarts at most every 30 s, never without a key; 'unavailable' for older solves), 'AI feedback' above Validation results on the solved page (user decision); tests ignore AI keys from .env. S7 problem benchmarks: migration 0021 problem_benchmarks (+ avg_iterations), running averages updated in the solve transaction after the score, back-filled from scored solves; from 5 solves the score uses the problem's averages (floored at 1) instead of the difficulty constants, also in the chat panel. S3 efficiency score: efficiencyScore + BENCHMARKS (iterations 2/3/4/5 = guess until S7) in scoring.js, points = base × time × efficiency on solve, efficiency_score stored, live score + benchmark in the chat panel (reloads after each Submit), solved card shows the AI efficiency; fixed a session/attempt lock-order deadlock on double Submit (from S2); profile AI stats deferred (no design, no rating thresholds); mock/aiChat.ts unused. S2 editor events: POST /attempts/:id/events (file_open, description_open/close, client ids → resent batch is a no-op), migration 0020 editor_events, Submit records test_run + test runs / passed on first run / iterations (D51 a), solve sets time to first prompt + time on description in solving time; tracker sends every 10 s, before Submit and on leaving. S6 own API key: Settings → Account tab "AI model" (user decision), provider + key + model from a fixed list, tested with one call on save, stored AES-256-GCM under API_KEY_ENCRYPTION_KEY (64 hex, `openssl rand -hex 32`), GET /me/api-key/status, POST/DELETE /me/api-key, migration 0019 user_api_keys; with a key the chat uses the user's provider + model, no daily limit, key_source 'user'. S1 built-in AI chat on the API: POST/GET /attempts/:id/ai/messages, platform key + cheap model (claude-haiku-4-5 / gpt-4o-mini), 20k free tokens/day per user (429 AI_DAILY_LIMIT), the AI sees only the code + earlier turns (never the problem text - user decision), migration 0018 solve_sessions + prompt_events, chat panel shows the model + free tokens left, tool picker removed. M8 prep: D62 free limit 20,000 tokens/day, no trial problem; D51 iteration = test run after a prompt, edit ratio skipped for now (weights spread), chat tool picker replaced by a model label; D63 own key tested on save, user picks the model from a fixed list; D64 one benchmark/leaderboard for all models; D65 feedback in background, compared to the top 25% of solves (from 8 solves), no feedback rating). Before: Seja 20 (docs only: new product direction - monetization (free tier with cheap model + daily token limit, connect own API key, career paths, B2B/hackathons V2) in 00, post-solve feedback in 02, profile/admin metrics in 03/04, new Key Business Rules + Business Model Summary here; 06: S1 rewritten for the free model, new slices S6 own API key, S7 problem benchmark, S8 post-solve feedback, new milestone M9 career paths (K1, K2), open decisions D62-D67). Before: Seja 19 (A9.1 analysis with OpenAI: OPENAI_API_KEY or ANTHROPIC_API_KEY, AI_PROVIDER when both, default model gpt-4o via plain fetch, M8 chat provider decided at M8 - M6 done; A9 platform stats: GET /admin/stats?range= per D46, /admin overview on the API, mock/adminStats.ts unused; A8 admin users: /admin/users + /admin/users/[id] (new routes, Users in the admin sidebar), GET /admin/users?q=, GET /admin/users/:id with attempts + tries, POST ban/unban; A7 contest results: GET /admin/contests/:id/results + ?format=csv, ranking computed on read per 03, reward sent mark = contests.reward_sent_at (migration 0017), results expand inside the /admin/contests list (no new route); dev DB was wiped by a test run without NODE_ENV=test and re-seeded - run tests only via npm test). Before: Seja 18 (A6 admin contests on the API: list, wizard, edit, schedule/cancel from the list, delete drafts, archive ended, D44 on the server; new slice A9.1 = AI analysis with an OpenAI key (planned); A5 publish: Publish re-runs the checks and publishes only if all fail, needs role + 3 checks + hidden tests; unpublish back to a draft, blocked during a contest - admin problems done end to end; A4 check run: POST /admin/problems/:id/dry-run, every check must fail on the buggy code (D20), valid only for the version it ran on (migration 0016), Run checks on the Publish step and the edit page; A3 code replacement: no code editor, a draft's code changes only by uploading a whole new ZIP - PUT /admin/problems/:id/codebase, duplicate check + production test, text and checks stay; A10 ZIP upload + Claude analysis: POST /admin/problems/analyze streams duplicate → production test → analysis, creates the draft with the code (D22), Claude Sonnet 5.5 via @anthropic-ai/sdk, migration 0015 content_hash; A2 admin problems: list + draft save/edit on the API, Title + Codebase context + Incident report on Review, Publish disabled until A5, migration 0014 bug_summary; A1 admin login: /admin/login, bugdr_admin cookie 8 h, `npm run hash-password`, users.is_admin dropped (0013), admin pages in app/admin/(panel) with AdminShell. M6 prep: D48 admin = separate /admin/login, email + password from backend/.env, own admin layout, users.is_admin goes; D46 stats as proposed; D45 Title field on Review, time limit stays automatic; D50 two description boxes, I update the A10 prompt; D20 all checks must fail on buggy code, no solution upload; D21/D22 analysis creates a draft right away). Before: Seja 17 (M5 prep: D32 history = solved + points, D59 contest page shows one problem, D60 taking part starts on Enter contest, D61 no contest leaderboard in M5; T1 contest list + detail + D17 hiding + dev contest seed; T2 contest entries, participation, history - M5 done). Before: Seja 16 (M4 prep: D34 all profile fields saved, D36 keep experience level, D24 feed always hides solved; D35 stays open. U1 profile + settings on the API, sidebar uses the real user; U2 activity grid + streak on read; U3 dashboard on the API - M4 done). Before: Seja 15 (M3 prep: D30 replies + helpful, D57 real ratings only, D58 delete own comment; O1 ratings, O2 comments - M3 done). Before: Seja 14 (M2 prep: D53-D55; R1 start solving + Monaco + drafts; solve-page panels resizable in Safari; R2 give up + ConfirmDialog; R2b try history, D56; R3 Docker check runner + runnable payment-retries-disappear; R4 Submit runs real checks, solve + points + tries on the solved card; R5 real terminal with streamed output; R6 live check results - M2 done). Before: Seja 13 (problem text = codebase context + incident report)
Phase: Backend slices (06_backend_slices.md); no mock data left in the frontend
Frontend: 24 screens, mostly on the API (incl. /career-paths and /admin/career-paths from M9; on the API: auth pages, onboarding, /problems, /problems/[slug], the solve page, /profile/[username], /settings, the sidebar user + contest badge, / (dashboard), /contests, /contests/[id] incl. participation and history, /leaderboard) — /admin/login, /admin/problems, /admin/problems/[id]/edit, /admin/contests (+ new, edit, results inline), /admin/users (+ [id]), /admin (overview), /admin/analytics (on the API), /admin/contests, /admin/contests/new, /admin/contests/[id]/edit, /onboarding, /login, /signup, /forgot-password, /profile/[username], /settings (Profile + Account "AI model"), /contests, /contests/[id], /admin/problems/new (Add Problem, 3 steps, on the API incl. publishing), / (dashboard; + shared sidebar/top bar in app/(app)/layout.tsx; admin pages in app/admin/(panel) with their own AdminShell), /problems, /problems/[slug] (Overview + Discussion; + solved state), /problems/[slug]/solve (fullscreen, 3 resizable panels: description, Monaco editor + real terminal + live check results on the API, AI chat + session capture + efficiency score on the API (S1-S3))
Backend: M9 done (K1-K3), M8 done (S1-S8), M0 (F0-F4), M1 (P1-P2) and M2 (R1-R6 + R2b) and M3 (O1-O2) done, M4 (U1-U3) done, M5 (T1-T2) done, M6 done (A1-A10 + A9.1) (backend/, `docker compose up -d` in backend/, npm run migrate/test) — plan in md_files/06_backend_slices.md
Database: PostgreSQL 17 in Docker; migrations 0001 (level_thresholds), 0002 (users, user_stats), 0003 (user_profiles), 0004 (problems), 0005 (problem detail), 0006 (problem brief), 0007 (attempt_tries), 0008 (check_results, point_transactions), 0009 (comment replies + helpful), 0010 (profile fields), 0011 (contests, contest_problems), 0012 (contest_entries), 0013 (drop users.is_admin), 0014 (problems.bug_summary), 0015 (problem_codebase.content_hash), 0016 (problems.dry_run_passed_for), 0017 (contests.reward_sent_at), 0018 (solve_sessions, prompt_events), 0019 (user_api_keys), 0020 (editor_events), 0021 (problem_benchmarks), 0022 (solve_feedback), 0023 (problem_career_paths), 0024 (career_path_progress + attempts.career_path), 0025 (career_path_thresholds) applied; dev DB has no problems or contests since Seja 23 (add real ones in admin); `npm run seed` = 12 sample problems with code and checks (only payment-retries-disappear is runnable - seed 0002; no made-up ratings, D57) + 5 dev contests (seed 0003, dates relative to seed time - re-seed to refresh)
Next step: M7 (Z1, Z2), or the X2 paywall (career paths + AI feedback) when the user is ready; M8 done (S1-S8; deferred: profile AI stats from 03, 'most common improvement areas'); next M7 (Z1, Z2) or M9 (K1, K2) after D66/D67; D52 still open (needed at S4), M9 (K1, K2) after D66/D67; the real AI analysis needs ANTHROPIC_API_KEY or OPENAI_API_KEY in backend/.env (models: ANTHROPIC_MODEL default claude-sonnet-5-5, OPENAI_MODEL default gpt-4o; AI_PROVIDER=anthropic|openai when both are set); D35 settings tabs stay "coming soon"; tests 204/204; the AI chat needs ANTHROPIC_API_KEY or OPENAI_API_KEY too (AI_FREE_MODEL, AI_FREE_DAILY_TOKENS optional), own keys need API_KEY_ENCRYPTION_KEY; R3/R4/R5/T2/A4/A10 tests need Docker + `docker pull node:24-alpine`; AI session = milestone M8 (S1-S8) in 06, career paths = M9. User sets ADMIN_EMAIL + ADMIN_PASSWORD_HASH (from `npm run hash-password`) in backend/.env, never in chat; restart the backend after editing .env
Open questions: X2 paywall later (career paths + AI feedback) · D25 notifications · D35 empty settings tabs · D37 GitHub sign-in · incident log of payment-retries-disappear vs. the runnable code (06 Nedoslednosti) · delete the unused POST /admin/problems? · password reset (X5): /forgot-password only says it is not available yet · profile AI stats (03) + efficiency rating thresholds · 03 example (1.8) vs. v1 mapping · external AI use scores 2.0
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
