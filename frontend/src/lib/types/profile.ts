import type { ContestHistoryEntry } from "@/lib/types/contest";
import type { ActivityDay, DashboardStats, ExperienceLevel } from "@/lib/types/dashboard";
import type { CategorySlug, Difficulty } from "@/lib/types/problem";

// ponytail: fixed list until languages get a table (D34).
export const LANGUAGES = ["TypeScript", "JavaScript", "Python", "Go", "SQL", "Java", "Rust", "C#"] as const;

/** Editable on /settings (PUT /me/profile, D34). */
export interface ProfileSettings {
  displayName: string;
  headline: string;
  githubUsername: string;
  goalRole: CategorySlug;
  experienceLevel: ExperienceLevel;
  languages: string[];
  isPublic: boolean;
}

export interface SolvedProblem {
  problemSlug: string;
  title: string;
  difficulty: Difficulty;
  timeTakenSeconds: number;
  solvedAt: string;
}

/** Result of GET /users/:username (U1) + /activity (U2). Never contains the e-mail. */
export interface Profile {
  username: string;
  displayName: string;
  headline: string;
  languages: string[];
  isPublic: boolean;
  stats: DashboardStats;
  /** Last 52 weeks (U2). */
  activity: ActivityDay[];
  /** Newest first. */
  solved: SolvedProblem[];
  contests: ContestHistoryEntry[];
}
