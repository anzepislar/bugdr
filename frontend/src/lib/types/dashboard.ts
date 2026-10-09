import type { CategorySlug, Difficulty, ProblemListItem } from "@/lib/types/problem";

export const EXPERIENCE_LEVELS = ["student", "junior", "mid", "senior"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

// Answers of onboarding step 2.
export const EXPERIENCE_LABEL: Record<ExperienceLevel, string> = {
  student: "Just getting started",
  junior: "Less than 2 years",
  mid: "2–4 years",
  senior: "5+ years",
};

// D19: recommendations start at a difficulty matching the user's experience.
export const STARTING_DIFFICULTY: Record<ExperienceLevel, Difficulty> = {
  student: "easy",
  junior: "easy",
  mid: "medium",
  senior: "hard",
};

export const PLATFORM_GOALS = ["get_hired", "improve_skills", "both"] as const;
export type PlatformGoal = (typeof PLATFORM_GOALS)[number];

/** Signed-in user, as the app shell needs it (user_profiles + users). */
export interface Me {
  username: string;
  displayName: string;
  /** null = "Exploring my path" (D41). */
  goalRole: CategorySlug | null;
  experienceLevel: ExperienceLevel;
}

export type ContestType = "daily" | "weekly" | "monthly";

export interface ActiveContest {
  id: string;
  type: ContestType;
  title: string;
  description: string;
  /** Highest difficulty among the contest's problems. */
  difficulty: Difficulty;
  participantCount: number;
  endsAt: string;
}

export interface InProgressAttempt {
  problemSlug: string;
  title: string;
  language: string;
  checksPassed: number;
  checksTotal: number;
  startedAt: string;
}

export interface LevelInfo {
  name: string;
  /** 1-based position in level_thresholds. */
  order: number;
  minPoints: number;
}

export interface DashboardStats {
  totalPoints: number;
  problemsSolved: number;
  currentStreak: number;
  longestStreak: number;
  level: LevelInfo;
  /** null at the top level. */
  nextLevel: LevelInfo | null;
}

/** One row of user_daily_activity. `date` is a UTC day, YYYY-MM-DD (D7). */
export interface ActivityDay {
  date: string;
  problemsOpened: number;
  problemsSolved: number;
}

export interface RecentWin {
  problemSlug: string;
  title: string;
  solvedAt: string;
  timeTakenSeconds: number;
}

/** Result of GET /dashboard (slice U3). Guests get the feed only (stats null). Live contests come with T1. */
export interface Dashboard {
  inProgress: InProgressAttempt | null;
  /** Published problems the user has not solved (D19, D24), in the "recommended" order of GET /problems. */
  feed: ProblemListItem[];
  stats: DashboardStats | null;
  activity: ActivityDay[];
  recentWins: RecentWin[];
}

/** Body of PUT /me/onboarding (F4). `goalRole: null` = "Exploring my path" (D41). */
export interface OnboardingAnswers {
  goalRole: CategorySlug | null;
  experienceLevel: ExperienceLevel;
  platformGoal: PlatformGoal;
  languages: string[];
}
