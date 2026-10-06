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
