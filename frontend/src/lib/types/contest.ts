import type { ContestType } from "@/lib/types/dashboard";
import type { Difficulty } from "@/lib/types/problem";

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
