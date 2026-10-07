import type { ContestType } from "@/lib/types/dashboard";
import type { CategorySlug, Difficulty } from "@/lib/types/problem";

/** One contest in GET /contests (slice T1). Status is derived from starts_at/ends_at. */
export interface Contest {
  id: string;
  type: ContestType;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  participantCount: number;
  /** Highest difficulty among the contest's problems. null while upcoming: problems stay hidden (T1). */
  difficulty: Difficulty | null;
  tags: string[];
  thumbnailUrl: string | null;
}

/** The signed-in user's contest_entries row for an ended contest (slice T2). */
export interface ContestHistoryEntry {
  contestId: string;
  title: string;
  checksPassed: number;
  checksTotal: number;
  endedAt: string;
}

export interface ContestList {
  live: Contest[];
  upcoming: Contest[];
  past: Contest[];
  history: ContestHistoryEntry[];
}

export type ContestStatus = keyof Omit<ContestList, "history">;

/** Result of GET /contests/:id (slices T1, T2). The design shows one incident per contest. */
export interface ContestDetail extends Contest {
  status: ContestStatus;
  /** null while upcoming: the problem stays hidden (T1). */
  problem: {
    slug: string;
    /** D27: no column for it yet. */
    repositoryName: string;
    incident: string;
    checkCount: number;
  } | null;
  rewardDescription: string | null;
  /** The signed-in user's contest_entries row; null = not started. */
  participation: { solved: boolean; checksPassed: number; checksTotal: number } | null;
}

export const REWARD_TYPES = { subscription: "Subscription", merch: "Merch", points: "Points" } as const;
export type RewardType = keyof typeof REWARD_TYPES;

/** A published problem as the contest problem picker shows it (GET /admin/problems, slice A2). */
export interface ContestProblemOption {
  slug: string;
  title: string;
  difficulty: Difficulty;
  categorySlug: CategorySlug;
}

/**
 * One contest in GET /admin/contests (slice A6). There is no status field: it is always
 * derived from the dates with getContestStatus() - startsAt null = draft.
 */
export interface AdminContest {
  id: string;
  type: ContestType;
  title: string;
  description: string;
  startsAt: string | null;
  endsAt: string | null;
  problems: ContestProblemOption[];
  rewardType: RewardType | null;
  rewardDescription: string | null;
}

/** Body of POST /admin/contests and PATCH /admin/contests/:id (slice A6). At least one problem. */
export interface AdminContestDraft {
  title: string;
  type: ContestType;
  description: string;
  /** null = draft. */
  startsAt: string | null;
  endsAt: string | null;
  problemSlugs: string[];
  rewardType: RewardType | null;
  rewardDescription: string | null;
}
