export const DIFFICULTIES = ["easy", "medium", "hard", "get_a_job"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  get_a_job: "Get a job",
};

// 03_scoring.md
export const BASE_POINTS: Record<Difficulty, number> = {
  easy: 100,
  medium: 250,
  hard: 500,
  get_a_job: 1000,
};

// 04_admin.md "Recommended time limits by difficulty"
export const TIME_LIMIT_RANGE: Record<Difficulty, [number, number]> = {
  easy: [15, 30],
  medium: [30, 60],
  hard: [60, 120],
  get_a_job: [120, 240],
};

// Seed data of problem_categories (01_database.md)
export const CATEGORIES = [
  { slug: "ai-engineer", name: "AI Engineer" },
  { slug: "backend", name: "Backend Engineer" },
  { slug: "frontend", name: "Frontend Engineer" },
  { slug: "fullstack", name: "Full Stack" },
  { slug: "database", name: "Database Engineer" },
] as const;
export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

export const CHECK_TYPES = ["test", "build", "lint", "custom"] as const;
export type CheckType = (typeof CHECK_TYPES)[number];

export interface Check {
  id: string;
  checkOrder: number;
  description: string;
  checkType: CheckType;
  checkCommand: string;
  mustPass: boolean;
}

/** Result of POST /admin/problems/analyze (AI output, camelCased by the API). */
export interface ProblemAnalysis {
  bugSummary: string;
  title: string;
  shortDescription: string;
  codebaseContext: string;
  incidentReport: string;
  suggestedDifficulty: Difficulty;
  difficultyReasoning: string;
  checks: Check[];
  hiddenFiles: Record<string, string>;
  tags: string[];
}

export type UploadStage = "duplicate" | "production" | "analysis";
/** A stage line of the upload streams (A10 analyze, A3 code replacement). */
export interface UploadStageEvent {
  type: "stage";
  stage: UploadStage;
  status: "running" | "passed" | "failed";
  message?: string;
}
/** Last line of POST /admin/problems/analyze (A10). */
export interface AnalyzeDone {
  type: "done";
  problemId: string;
  analysis: ProblemAnalysis;
}
/** Last line of PUT /admin/problems/:id/codebase (A3). */
export interface CodeReplaced {
  type: "done";
  paths: string[];
  repositoryName: string | null;
}

/** One line of POST /admin/problems/:id/dry-run (A4). `output` only for a check that failed (R3). */
export type DryRunEvent =
  | { type: "checks"; checks: { id: string; description: string }[] }
  | { type: "running"; checkId: string }
  | { type: "result"; checkId: string; passed: boolean; output?: string }
  | { type: "done"; ok: boolean; published?: boolean; slug?: string; message?: string } // published: A5 only
  | { type: "error"; message: string };

/** One check run against the buggy codebase. `passed` = the check passed on the buggy code. */
export interface CheckValidationResult {
  checkId: string;
  passed: boolean;
  output: string;
}

/** Editable fields of the create-problem form. */
export interface ProblemForm {
  title: string;
  shortDescription: string;
  codebaseContext: string;
  incidentReport: string;
  tags: string[];
  difficulty: Difficulty;
  categorySlug: CategorySlug | null;
  timeLimitMinutes: number;
  thumbnail: File | null;
}

/** Body of POST /admin/problems and PUT /admin/problems/:id (A2). The server builds the slug from the title. */
export interface AdminProblemDraft {
  title: string;
  shortDescription: string;
  codebaseContext: string;
  incidentReport: string;
  difficulty: Difficulty;
  categorySlug: CategorySlug;
  timeLimitMinutes: number;
  tags: string[];
  checks: Check[];
  hiddenFiles: Record<string, string>;
  bugSummary: string;
}

/** GET /admin/problems/:id - a draft (or published problem) as the edit form needs it. */
export interface AdminProblem extends Omit<AdminProblemDraft, "categorySlug"> {
  id: string;
  slug: string;
  isPublished: boolean;
  categorySlug: CategorySlug | null;
  /** A3: the code is shown as its file list only and changes by uploading a new ZIP. */
  repositoryName: string | null;
  paths: string[];
  /** A4: the last check run passed (every check failed on the buggy code) and nothing changed since. */
  checksVerified: boolean;
}

/** One row of GET /admin/problems (drafts included). */
export interface AdminProblemListItem {
  id: string;
  slug: string;
  title: string;
  difficulty: Difficulty;
  categorySlug: CategorySlug | null;
  isPublished: boolean;
  solveCount: number;
  averageRating: number;
  ratingCount: number;
  createdAt: string;
}

export interface SavedProblem {
  id: string;
  slug: string;
  isPublished: boolean;
}

export function toSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** One card of GET /problems (slice P1). `status` is null when the user never started it (or gave up). */
export interface ProblemListItem {
  slug: string;
  title: string;
  shortDescription: string;
  difficulty: Difficulty;
  categorySlug: CategorySlug;
  tags: string[];
  timeLimitMinutes: number;
  averageRating: number;
  ratingCount: number;
  thumbnailUrl: string | null;
  status: "solved" | "in_progress" | null;
  /** Bookmarked by the signed-in user (D23); false for guests. */
  saved: boolean;
}

/** Result of GET /problems/:slug (slice P2). Never contains file contents or check commands. */
export interface ProblemDetail extends ProblemListItem {
  /** problems.codebase_context: what the system does, no bug hints; paragraphs split by a blank line. */
  codebaseContext: string;
  /** problems.incident_report: logs, alerts, support tickets — symptoms only, shown verbatim. */
  incidentReport: string;
  solveCount: number;
  commentCount: number;
  /** problem_checks.description in check_order (D26). */
  checks: string[];
  /** D27: `name` has no column yet; `files` are the paths of repository_structure. */
  repository: { name: string; stack: string[]; files: string[] };
  /** The user's solved attempt; null unless `status` is "solved". */
  result: SolveResult | null;
}

/** Solved row of user_problem_attempts, as the detail page shows it. */
export interface SolveResult {
  /** S8: for GET /attempts/:id/feedback. */
  attemptId: string;
  solvedAt: string;
  timeTakenSeconds: number;
  checksPassed: number;
  checksTotal: number;
  linesAdded: number;
  linesDeleted: number;
  pointsEarned: number;
  /** time_bonus_multiplier (03_scoring.md): 1, 1.25, 1.5 or 2. */
  timeMultiplier: number;
  /** S3: AI efficiency 0.5-2.0; null for solves from before the score (counted as 1). */
  efficiencyScore: number | null;
  /** problem_ratings.rating of this user, 1-5. */
  myRating: number | null;
  /** attempt_tries in order (R4, D56); the last one solved it. timeTakenSeconds is their sum. */
  tries: SolveTry[];
}

export interface SolveTry {
  tryNumber: number;
  outcome: "in_progress" | "abandoned" | "solved";
  /** null for a try given up before try history existed (migration 0007). */
  durationSeconds: number | null;
}

/** One comment of GET /problems/:slug/comments (slice O2). Replies are one level deep (D30). */
export interface ProblemComment {
  id: string;
  author: { username: string; displayName: string; goalRole: CategorySlug | null };
  /** Raw text; rendered as text, never as HTML. */
  content: string;
  createdAt: string;
  helpfulCount: number;
  /** The viewer marked it as helpful. */
  markedHelpful: boolean;
  /** The viewer wrote it: can delete it (D58), can't mark it helpful (D30). */
  own: boolean;
  replies: ProblemComment[];
}

/**
 * Save body from the Review form. The time limit follows the difficulty (D45: low end of the recommended range);
 * check order = position in the list.
 */
export function toAdminProblemDraft(
  form: ProblemForm & { categorySlug: CategorySlug },
  checks: Check[],
  hiddenFiles: Record<string, string>,
  bugSummary: string,
): AdminProblemDraft {
  return {
    title: form.title.trim(),
    shortDescription: form.shortDescription.trim(),
    codebaseContext: form.codebaseContext.trim(),
    incidentReport: form.incidentReport.trim(),
    difficulty: form.difficulty,
    categorySlug: form.categorySlug,
    timeLimitMinutes: TIME_LIMIT_RANGE[form.difficulty][0],
    tags: form.tags,
    checks: checks.map((c, i) => ({ ...c, checkOrder: i + 1 })),
    hiddenFiles,
    bugSummary,
  };
}
