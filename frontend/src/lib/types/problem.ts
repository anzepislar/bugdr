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

/** Result of POST /admin/problems/analyze (Claude output, camelCased by the API). */
export interface ProblemAnalysis {
  bugSummary: string;
  shortDescription: string;
  fullDescription: string;
  suggestedDifficulty: Difficulty;
  difficultyReasoning: string;
  checks: Check[];
  hiddenFiles: Record<string, string>;
  tags: string[];
}

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
  fullDescription: string;
  tags: string[];
  difficulty: Difficulty;
  categorySlug: CategorySlug | null;
  timeLimitMinutes: number;
  thumbnail: File | null;
}

/** Payload of the save request (draft or publish). */
export interface AdminProblemDraft {
  title: string;
  slug: string;
  shortDescription: string;
  fullDescription: string;
  difficulty: Difficulty;
  categorySlug: CategorySlug;
  timeLimitMinutes: number;
  tags: string[];
  checks: Check[];
  hiddenFiles: Record<string, string>;
  bugSummary: string;
  codebaseFileName: string;
  thumbnailFileName: string | null;
  isPublished: boolean;
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
  solvedAt: string;
  timeTakenSeconds: number;
  checksPassed: number;
  checksTotal: number;
  linesAdded: number;
  linesDeleted: number;
  pointsEarned: number;
  /** time_bonus_multiplier (03_scoring.md): 1, 1.25, 1.5 or 2. */
  timeMultiplier: number;
  /** problem_ratings.rating of this user, 1-5. */
  myRating: number | null;
}

/** One comment of GET /problems/:slug/comments (slice O2). Replies are one level deep (D30). */
export interface ProblemComment {
  id: string;
  author: { username: string; displayName: string; goalRole: CategorySlug | null };
  /** Raw text; rendered as text, never as HTML. */
  content: string;
  createdAt: string;
  /** D30: no column yet. */
  helpfulCount: number;
  markedHelpful: boolean;
  replies: ProblemComment[];
}
