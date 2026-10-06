# BUGDR — Problems

## What a Problem Is

A problem on Bugdr is a real production bug inside a real codebase.

The user is given:
- A description of what the codebase does (not what is broken)
- The actual buggy code to work with
- A terminal to run the app
- A list of checks that must pass to solve the problem

The user figures out what is wrong, fixes it, and clicks Test.

---

## Difficulty Levels

| Level | Base Points | Description |
|-------|------------|-------------|
| Easy | 100 | Obvious once you look. Single file. |
| Medium | 250 | Requires understanding multiple components. |
| Hard | 500 | Subtle. Requires real domain knowledge. |
| Get a job | 1,000 | Elite level. Very few people solve these. |

**"Get a job"** — named after the internet phrase used when someone is too good at something. If you can solve these, you should literally get a job.

---

## Problem Sources

Problems come from two sources:

### 1. GitHub (real bugs)
- Filter: `label:bug` + `label:fixed` on popular repos
- Extract: broken state of the code before the fix
- Sanitize: remove sensitive data, anonymize company names
- Add: proper description, checks, expected output

### 2. Claude Generation
- Feed real GitHub bugs as examples
- Generate similar problems with variations
- Different codebase, same type of bug
- Always human-reviewed before publishing

---

## Problem Structure

Every problem has these parts:

### Description
What the codebase does — written as if the user just joined a company.

**Good example:**
> "This is the authentication service for a SaaS platform. It handles user registration, login, and JWT token refresh. The service has been running in production for 6 months. This morning, users started reporting they get logged out every time they refresh the page."

**Bad example:**
> "There is a bug in the JWT refresh function on line 42."

### Codebase
The actual files with the bug. Stored as JSONB in `problem_codebase.files`.
Loaded into Monaco Editor when user starts the problem.

**Three types of files:**

| Type | Column | Sent to browser? | Description |
|------|--------|-----------------|-------------|
| Editable files | `files` | ✅ Yes | The buggy code the user sees and edits |
| Hidden files | `hidden_files` | ❌ Never | Test files written into container AFTER user files — user cannot edit or see these |
| Solution files | `solution_files` | ❌ Never | The correct fix — used to validate checks before publishing |

**Why hidden files matter:**
Test files sit alongside the code. If tests were in `files`, the user could edit them to make `npm test` pass without actually fixing anything. Hidden files are injected into the Docker container after the user's files are written — overwriting any changes the user made to test files.

**Publishing requirement:**
Before a problem can be published, admin must verify:
1. Checks FAIL on `files` (the buggy code) — confirms the bug is real
2. Checks PASS on `solution_files` (the fix) — confirms the checks are correct

### Checks
A list of automated tests that must all pass to solve the problem.
Run in order inside a Docker container.

**Example checks for the auth bug above:**
1. `npm run test` — all unit tests pass
2. `curl /auth/refresh` returns 200
3. `curl /auth/refresh` with expired token returns 401
4. No console errors on startup

### Tags
Keywords for search and filtering.
Examples: `jwt`, `authentication`, `express`, `async`, `race-condition`

---

## Problem Execution Engine

When the user clicks **Test**, this happens:

```
1. User's modified files sent to backend
2. Backend spins up a Docker container
3. Container loads the problem's base setup
4. User's files overwrite the base files
5. Setup commands run (npm install, etc.)
6. Checks run one by one in order
7. Results returned to frontend
8. Pass/fail displayed per check
9. If all pass → problem solved
```

### Docker Container Isolation
- Each attempt runs in its own isolated container
- Container is destroyed after checks complete
- User cannot access the host system
- Network is restricted (no outbound requests unless problem requires it)
- Time limit enforced — container killed after `time_limit_minutes`

### Check Types

| Type | What it does |
|------|-------------|
| `test` | Runs test suite (`npm test`, `pytest`, etc.) |
| `build` | Runs build command, checks it succeeds |
| `lint` | Runs linter, checks no errors |
| `custom` | Runs any command, checks exit code or output |

---

## Problem Display

Problems are shown as cards on the Problems page.

**Card contains:**
- Thumbnail image
- Title
- Short description (1-2 lines)
- Difficulty badge (color coded)
- Category badge
- Rating (stars, always visible)
- Solve count
- Time limit

**Card colors by difficulty:**
- Easy: #22c55e (green)
- Medium: #f59e0b (yellow)
- Hard: #f97316 (orange)
- Get a job: #ef4444 (red)

---

## Problem Detail Page

When user opens a problem:

- Full description (codebase context)
- Difficulty + category + tags
- Average rating (always visible)
- Comments (locked until solved — shows count but not content)
- **Start button** → starts timer, loads editor

---

## Problem Editor (Solve Screen)

When user clicks Start:

- Timer starts immediately
- Monaco Editor loads with the buggy codebase
- File tree on the left (same as VS Code)
- Terminal on the bottom
- Checks panel on the right (or bottom, depends on screen space)
- **Test button** — runs checks
- **Give up button** — marks attempt as abandoned

### Check Panel States

Each check shows:
- Description (always visible)
- Status: pending / running / passed / failed
- Output (shown on failed)

### Timer Display
- Counts up from 0
- Shows time limit in header
- Turns red when 80% of time limit passed

---

## Solving Rules

- Timer starts on click of Start
- User can open the problem description at any time during solving
- User can run the app in the terminal at any time
- Clicking Test runs all checks — partial results shown in real time
- If all checks pass → solved, timer stops, points calculated
- Can only solve each problem once (enforced in DB)

---

## Comments & Ratings

### Comments
- Visible (count only) to everyone
- Content unlocked only after solving
- Users can share approach, tips, alternative solutions
- No spoilers before solving

### Ratings
- 1-5 stars
- Only after solving
- Visible to everyone (average + count)
- Encourages quality problem curation

---

## Future: VS Code Extension
Later, users will be able to open problems directly in their local VS Code instead of the browser editor. Same checks, same Docker execution, just local environment.

Not in scope for v1.
