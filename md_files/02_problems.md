# BUGDR — Problems

## What a Problem Is

A problem on Bugdr is a real production bug inside a real codebase.

The user is given:
- A codebase context (what the system does) and an incident report (symptoms from production) — never the cause
- The actual buggy code to work with
- A terminal to run the app
- A built-in AI chat (or any AI tool they like) — the session is captured, see "AI Session Capture"
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
- Add: codebase context, incident report, checks, expected output (of the checks, never shown to the user)

### 2. Claude Generation
- Feed real GitHub bugs as examples
- Generate similar problems with variations
- Different codebase, same type of bug
- Always human-reviewed before publishing

---

## Problem Structure

Every problem has these parts:

### Codebase Context
What the system does — written as if the user just joined the company.
Never mentions what is broken, never hints toward the solution.
Reads like an onboarding document.

**Good example:**
"You have joined the payments team at Northstar, an online marketplace.
This service handles checkout job scheduling using a Redis queue.
Background workers process checkout events and schedule payment retries
when the payment provider is temporarily unavailable."

**Bad example:**
"There is a bug in the retry logic that causes duplicate charges."
"The JWT refresh token has a race condition."

### Incident Report
What a real engineer would see when something breaks in production.
This is what the user reads to understand what needs fixing.
Never explains the cause — only shows symptoms.

Contains one or more of:
- User complaints: what users are reporting
- Error logs: actual terminal output, stack traces, error messages from the running app
- Monitoring alerts: what the system is showing
- Support tickets: what customers are saying

**Good example:**
```
[WARN] gateway timeout order=ord_842 attempt=1
[INFO] retry scheduled delay=30000ms
[WARN] gateway timeout order=ord_842 attempt=2
[INFO] retry scheduled delay=30000ms
Support report: "Failed orders never complete.
Customers are being charged but orders stay in pending state indefinitely."
```

**Bad example:**
"The retry delay is hardcoded and never changes between attempts."
"Expected behavior: transient failures should be retried with exponential backoff."

### No "Expected Behavior" section
Never tell the user what the correct behavior should be.
They must figure it out from the codebase, the logs, and their engineering judgment.
This is what makes the problem genuinely hard to one-shot with AI.

### Codebase
The actual files with the bug. Stored as JSONB in `problem_codebase.files`.
Loaded into Monaco Editor when user starts the problem.

**Three types of files:**

| Type | Column | Sent to browser? | Description |
|------|--------|-----------------|-------------|
| Editable files | `files` | ✅ Yes | The buggy code the user sees and edits — no comments hinting at the bug location |
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

**Example checks for a JWT refresh bug:**
1. `npm run test` — all unit tests pass
2. `curl /auth/refresh` returns 200
3. `curl /auth/refresh` with expired token returns 401
4. No console errors on startup

### Tags
Keywords for search and filtering.
Examples: `jwt`, `authentication`, `express`, `async`, `race-condition`

---

## Problem Execution Engine

When the user clicks **Submit**, this happens (R3, R4, R6):

```
1. User's current files sent to backend (POST /attempts/:id/test)
2. Backend starts a throwaway Docker container
3. Problem files are written, then the user's files, then the hidden files last
4. Setup commands run (if the problem has any)
5. Checks run one by one in order; each check's "running" and result stream to the browser as they happen
6. Every result is stored (check_results)
7. If every must_pass check passes → problem solved, points awarded (03_scoring.md)
8. Container is removed
```

A check passes when its command exits with code 0 (and its output contains `expected_output`, if set).

### Docker Container Isolation
- Official `node:24-alpine` image (D54: Node/TypeScript only in v1; more images when a problem needs them)
- A new container for every Submit, removed afterwards; it removes itself after 5 minutes even if the backend dies
- No network, 512 MB memory, 1 CPU, at most 128 processes, read-only system, non-root user, no capabilities
- Files are piped in - the host's folders are never mounted
- 20 seconds per check; a runaway check is killed and the next one still runs
- The problem's `time_limit_minutes` does not stop anything: past it the attempt stays open with a 1x time bonus (D9)

### Terminal (R5)
- One terminal container per open attempt, with the same isolation, holding the problem files and the user's
  current editor files - never the hidden files
- One command at a time, output streams live, 30 seconds per command, Stop / Ctrl+C
- Each command starts a fresh shell (`cd` does not carry over); no interactive programs (D13)
- Removed after 10 minutes without a command, on give up and on solve

### Runnable problems
Only `payment-retries-disappear` is runnable so far (D53, seed 0002): plain Node 24 (TypeScript through Node's type
stripping, `node:test`), no npm packages, six hidden check files plus "Existing tests still pass". The other dev
problems are display-only; Submit answers "Checks for this problem are not available yet".

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
- Solve count (on the detail page; the current card design does not show it)
- Time limit
- Tags, the user's status (Solved / In progress) and a bookmark ("Saved problems", D23)

**Card colors by difficulty:**
- Easy: #22c55e (green)
- Medium: #f59e0b (yellow)
- Hard: #f97316 (orange)
- Get a job: #ef4444 (red)

---

## Problem Detail Page

When user opens a problem:

- "Your assignment" (codebase context) and "What the team is seeing" (incident report in a terminal-style block)
- Difficulty + category + tags
- Average rating (always visible) and solve count
- Acceptance checks: only their descriptions, in order (D26) - never commands or expected output
- Repository panel: name, stack (language + framework + tags) and file paths, never file contents (D27)
- Comments (locked until solved — shows count but not content)
- **Start button** → starts (or resumes) the attempt, loads the editor
- A solved problem shows its result first (time, checks, lines changed, points, time bonus, every try - "Solved on try N") and the problem below it
- Opening the page while signed in counts toward the streak (`03_scoring.md`)

---

## Problem Editor (Solve Screen)

When user clicks Start:

- Fullscreen page (own layout, no app sidebar); opens with the editor sliding in from the right
- Top bar: logo + title, timer, **Give up** (confirm dialog, marks the attempt as abandoned), **Submit** (runs checks)
- Three panels side by side at every width, each a third of the screen on open, freely resizable by dragging
  (dragging a side panel past half its minimum closes it; a chevron tab reopens it)
- Left: codebase context + incident report + acceptance checks
- Center: Monaco Editor with the buggy codebase, one tab per file (sorted by path) + language selector; unsaved edits
  are kept in the browser per try (D14)
- Bottom of the editor: Terminal (real commands, R5) and Test Results (live per check, R6) tabs
- Right: AI chat panel (open on load, resizable, collapsible): AI tool selector, live session stats (prompts, tokens, test runs), "Session Efficiency" vs. the difficulty benchmark — see "AI Session Capture"

### Check Panel States

Each check shows:
- Description (always visible)
- Status: pending / running / passed / failed
- Output (shown on failed)

### Timer Display
- Counts up across all tries (D56): after giving up and starting again it continues from the earlier total
- Hover shows the try number and the time limit
- Turns red when 80% of time limit passed

---

## Solving Rules

- Timer starts on click of Start
- User can open the problem description at any time during solving
- User can run the app in the terminal at any time
- Clicking Submit runs all checks — partial results shown in real time
- If all checks pass → solved, timer stops, points calculated
- Can only solve each problem once (enforced in DB)
- Give up → the attempt is abandoned; starting again opens the next try with the original code. Every try is stored
  (attempt_tries), and the time bonus counts all of them (D56)

---

## AI Session Capture

Every action in the editor is tracked during a solve session.

**What is captured:**
- Every prompt sent to AI: text, token count, AI tool used, timestamp
- Whether the user accepted or modified the AI response
- Every file edit: manual vs AI-generated
- Every test run: timestamp, which checks passed/failed
- Time spent reading the description before first action
- Time to first prompt
- Total test runs before solving

**AI tools supported:**
Users can use any AI tool. The editor has a built-in AI chat panel (connected to an AI API server-side; the provider is decided at M8 - the upload analysis already works with Claude or OpenAI, A9.1). If they use an external tool and paste the result, that counts as a manual edit. If they use the built-in panel, every prompt is automatically captured.

**Why this matters:**
- Fewer prompts + fewer tokens + fewer iterations = higher efficiency
- Reading the description before prompting = better understanding
- Passing tests on first run = clean solution
- Accepting AI output without editing = either very good prompting or blindly copy-pasting (context matters)

---

## Comments & Ratings

### Comments
- Visible (count only) to everyone
- Content unlocked only after solving
- Users can share approach, tips, alternative solutions
- No spoilers before solving
- Replies one level deep; "helpful" marks (not on your own comment); sort by most helpful or newest (D30)
- Up to 2000 characters, plain text (never rendered as HTML)
- The author can delete their own comment, with its replies; no editing (D58)

### Ratings
- 1-5 stars
- Only after solving; rating again replaces your rating
- Visible to everyone (average + count), always computed from real ratings (D57)
- Encourages quality problem curation

---

## Future: VS Code Extension
Later, users will be able to open problems directly in their local VS Code instead of the browser editor. Same checks, same Docker execution, just local environment.

Not in scope for v1.
