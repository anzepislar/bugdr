import type { CategorySlug, Difficulty } from "@/lib/types/problem";

export const EXPERIENCE_LEVELS = ["student", "junior", "mid", "senior"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

// ponytail: year ranges are a guess until the onboarding screen defines the answers.
export const EXPERIENCE_LABEL: Record<ExperienceLevel, string> = {
  student: "Student",
  junior: "0–2 years",
  mid: "2–4 years",
  senior: "5+ years",
};

/** Signed-in user, as the app shell needs it (user_profiles + users). */
export interface Me {
  username: string;
  displayName: string;
  goalRole: CategorySlug;
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

export interface FeedProblem {
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
  solved: boolean;
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

/** Result of GET /dashboard (slice U3). */
export interface Dashboard {
  contests: ActiveContest[];
  inProgress: InProgressAttempt | null;
  feed: FeedProblem[];
  stats: DashboardStats;
  activity: ActivityDay[];
  recentWins: RecentWin[];
}
