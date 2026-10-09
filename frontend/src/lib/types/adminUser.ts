import type { DashboardStats, ExperienceLevel, PlatformGoal } from "@/lib/types/dashboard";
import type { CategorySlug, Difficulty } from "@/lib/types/problem";

/** One row of GET /admin/users?q= (slice A8), newest first. */
export interface AdminUserListItem {
  id: string;
  username: string;
  email: string;
  /** Level name from the user's points (03). */
  level: string;
  joinedAt: string;
  lastActiveAt: string | null;
  isBanned: boolean;
}

export type AttemptStatus = "in_progress" | "solved" | "abandoned";

/** One try at a problem (attempt_tries, R2b). */
export interface AdminAttemptTry {
  tryNumber: number;
  startedAt: string;
  /** null = still open. */
  endedAt: string | null;
  outcome: AttemptStatus;
  durationSeconds: number | null;
}

export interface AdminUserAttempt {
  problemSlug: string;
  title: string;
  difficulty: Difficulty;
  status: AttemptStatus;
  pointsEarned: number;
  timeTakenSeconds: number | null;
  solvedAt: string | null;
  tries: AdminAttemptTry[];
}

/** GET /admin/users/:id (slice A8). Profile fields are null until the user fills them in. */
export interface AdminUserDetail extends Omit<AdminUserListItem, "level"> {
  profile: {
    displayName: string | null;
    headline: string | null;
    githubUsername: string | null;
    /** null = "Exploring my path" (D41) or onboarding not done. */
    goalRole: CategorySlug | null;
    experienceLevel: ExperienceLevel | null;
    platformGoal: PlatformGoal | null;
    languages: string[];
    isPublic: boolean;
    onboardingCompleted: boolean;
  };
  stats: DashboardStats;
  attempts: AdminUserAttempt[];
}
