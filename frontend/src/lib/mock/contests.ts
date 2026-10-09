// Mock of GET /contests + the user's contest entries. Replaced by slices T1 and T2
// (see md_files/06_backend_slices.md, "Register mockov"). Dates are relative to now.
import type { ContestDetail, ContestList } from "@/lib/types/contest";

const MIN = 60_000;
const DAY = 86_400_000;

export async function mockGetContests(): Promise<ContestList> {
  const now = Date.now();
  const at = (ms: number) => new Date(now + ms).toISOString();

  return {
    live: [
      {
        id: "contest-daily",
        type: "daily",
        title: "The checkout breakdown",
        description: "Payments succeed. Orders never arrive.",
        startsAt: at(-(15 * 60 + 18) * MIN),
        endsAt: at((8 * 60 + 42) * MIN),
        participantCount: 128,
        difficulty: "hard",
        tags: ["Node.js", "Redis"],
        thumbnailUrl: "/mock/thumb-pipeline.svg",
      },
      {
        id: "contest-weekly",
        type: "weekly",
        title: "Cache under pressure",
        description: "Restore consistency under real traffic.",
        startsAt: at(-(3 * DAY + 16 * 60 * MIN)),
        endsAt: at(3 * DAY + 8 * 60 * MIN),
        participantCount: 342,
        difficulty: "hard",
        tags: ["Go", "Redis"],
        thumbnailUrl: "/mock/thumb-query.svg",
      },
      {
        id: "contest-monthly",
        type: "monthly",
        title: "The midnight incident",
        description: "Recover a failing production data pipeline.",
        startsAt: at(-4 * DAY),
        endsAt: at(26 * DAY),
        participantCount: 1204,
        difficulty: "hard",
        tags: ["Python", "PostgreSQL"],
        thumbnailUrl: "/mock/thumb-session.svg",
      },
    ],
    upcoming: [
      {
        id: "contest-daily-next",
        type: "daily",
        title: "Tomorrow's incident",
        description: "A new production bug, revealed when the contest starts.",
        startsAt: at((8 * 60 + 42) * MIN),
        endsAt: at((32 * 60 + 42) * MIN),
        participantCount: 0,
        difficulty: null,
        tags: [],
        thumbnailUrl: null,
      },
      {
        id: "contest-weekly-next",
        type: "weekly",
        title: "The replica that lags behind",
        description: "Reads drift further from writes every hour.",
        startsAt: at(3 * DAY + 8 * 60 * MIN),
        endsAt: at(10 * DAY + 8 * 60 * MIN),
        participantCount: 0,
        difficulty: null,
        tags: [],
        thumbnailUrl: null,
      },
    ],
    past: [
      {
        id: "contest-cache-eviction",
        type: "weekly",
        title: "Cache eviction incident",
        description: "Hot keys vanish minutes after every deploy.",
        startsAt: at(-15 * DAY),
        endsAt: at(-8 * DAY),
        participantCount: 517,
        difficulty: "medium",
        tags: ["Node.js", "Redis"],
        thumbnailUrl: "/mock/thumb-query.svg",
      },
      {
        id: "contest-duplicate-invoices",
        type: "daily",
        title: "Duplicate invoices",
        description: "Customers are billed twice when the network blips.",
        startsAt: at(-10 * DAY),
        endsAt: at(-9 * DAY),
        participantCount: 96,
        difficulty: "medium",
        tags: ["TypeScript", "PostgreSQL"],
        thumbnailUrl: "/mock/thumb-pipeline.svg",
      },
    ],
    history: [
      {
        contestId: "contest-cache-eviction",
        title: "Cache eviction incident",
        problemsSolved: 1,
        problemCount: 1,
        score: 375,
        endedAt: at(-8 * DAY),
      },
      {
        contestId: "contest-duplicate-invoices",
        title: "Duplicate invoices",
        problemsSolved: 0,
        problemCount: 1,
        score: 0,
        endedAt: at(-9 * DAY),
      },
    ],
  };
}

// Contest problems reuse problem mocks so "Enter contest" opens a working solve screen.
const DETAILS: Record<string, Pick<ContestDetail, "problem" | "rewardDescription" | "participation">> = {
  "contest-daily": {
    problem: {
      slug: "payment-retries-disappear",
      repositoryName: "Northstar marketplace",
      incident:
        "A product launch has pushed checkout traffic to ten times its normal volume.\nPayments are reaching the provider, but the order pipeline is falling behind.\nYour team needs you to restore processing without losing or duplicating orders.",
      checkCount: 9,
    },
    rewardDescription: null,
    participation: null,
  },
  "contest-weekly": {
    problem: {
      slug: "stale-search-results",
      repositoryName: "Lumen search",
      incident:
        "Traffic doubled overnight and the cache started serving stale results.\nSome users see prices from yesterday, others see items that are sold out.\nRestore consistency without taking the cache offline.",
      checkCount: 7,
    },
    rewardDescription: "Bugdr hoodie for the top 3",
    participation: { problemsSolved: 0, problemCount: 1, score: 0 },
  },
  "contest-monthly": {
    problem: {
      slug: "session-refuses-to-expire",
      repositoryName: "Harbor data platform",
      incident:
        "The nightly pipeline failed at midnight and every retry made it worse.\nRevoked sessions keep running jobs against production data.\nRecover the pipeline and make sure revoked sessions stop for good.",
      checkCount: 8,
    },
    rewardDescription: "1 year free subscription for the winner",
    participation: { problemsSolved: 1, problemCount: 1, score: 375 },
  },
  "contest-cache-eviction": {
    problem: {
      slug: "stale-search-results",
      repositoryName: "Lumen search",
      incident: "Hot keys vanish from the cache minutes after every deploy.\nFind out what evicts them.",
      checkCount: 7,
    },
    rewardDescription: null,
    participation: { problemsSolved: 1, problemCount: 1, score: 375 },
  },
  "contest-duplicate-invoices": {
    problem: {
      slug: "webhook-signature-mismatch",
      repositoryName: "Ledger billing",
      incident: "Customers are billed twice when the network blips.\nMake invoice creation safe to retry.",
      checkCount: 6,
    },
    rewardDescription: null,
    participation: { problemsSolved: 0, problemCount: 1, score: 0 },
  },
};

export async function mockGetContest(id: string): Promise<ContestDetail | null> {
  const lists = await mockGetContests();
  for (const status of ["live", "upcoming", "past"] as const) {
    const contest = lists[status].find((c) => c.id === id);
    if (contest) {
      return {
        ...contest,
        status,
        ...(DETAILS[id] ?? { problem: null, rewardDescription: null, participation: null }),
      };
    }
  }
  return null;
}
