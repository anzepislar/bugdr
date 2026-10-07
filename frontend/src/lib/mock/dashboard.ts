// Mock of the signed-in user and GET /dashboard. Replaced by slices F4 (Me),
// U3, T1 and U2 (see md_files/06_backend_slices.md, "Register mockov").
import type { ActivityDay, Dashboard, FeedProblem, Me } from "@/lib/types/dashboard";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MIN = 60_000;
const DAY = 86_400_000;

export const MOCK_ME: Me = {
  username: "max",
  displayName: "Max",
  goalRole: "backend",
  experienceLevel: "mid",
};

export const MOCK_ACTIVE_CONTEST_COUNT = 3;

const FEED: FeedProblem[] = [
  {
    slug: "payment-retries-disappear",
    title: "Payment retries disappear from the queue",
    shortDescription: "A checkout worker accepts failed payments, but some jobs never run again.",
    difficulty: "medium",
    categorySlug: "backend",
    tags: ["Node.js", "Redis"],
    timeLimitMinutes: 40,
    averageRating: 4.8,
    ratingCount: 126,
    thumbnailUrl: "/mock/thumb-pipeline.svg",
    solved: false,
  },
  {
    slug: "query-slower-every-day",
    title: "The query that gets slower every day",
    shortDescription: "The orders endpoint slows down as the customer database grows.",
    difficulty: "medium",
    categorySlug: "backend",
    tags: ["PostgreSQL", "Express"],
    timeLimitMinutes: 45,
    averageRating: 4.9,
    ratingCount: 84,
    thumbnailUrl: "/mock/thumb-query.svg",
    solved: false,
  },
  {
    slug: "session-refuses-to-expire",
    title: "A session that refuses to expire",
    shortDescription: "Users stay signed in after their session has been revoked.",
    difficulty: "medium",
    categorySlug: "backend",
    tags: ["TypeScript", "JWT"],
    timeLimitMinutes: 35,
    averageRating: 4.7,
    ratingCount: 92,
    thumbnailUrl: "/mock/thumb-session.svg",
    solved: false,
  },
  {
    slug: "inventory-out-of-sync",
    title: "When inventory falls out of sync",
    shortDescription: "Two warehouses report different stock after concurrent orders.",
    difficulty: "medium",
    categorySlug: "backend",
    tags: ["Node.js", "PostgreSQL"],
    timeLimitMinutes: 50,
    averageRating: 4.6,
    ratingCount: 58,
    thumbnailUrl: null,
    solved: false,
  },
  {
    slug: "fixed-the-memory-leak",
    title: "The memory leak in the image resizer",
    shortDescription: "Memory grows with every upload until the worker is killed.",
    difficulty: "medium",
    categorySlug: "backend",
    tags: ["Node.js", "Streams"],
    timeLimitMinutes: 40,
    averageRating: 4.5,
    ratingCount: 211,
    thumbnailUrl: null,
    solved: true,
  },
  {
    slug: "webhook-signature-mismatch",
    title: "Webhook signatures that never match",
    shortDescription: "Every incoming webhook fails verification after a framework upgrade.",
    difficulty: "easy",
    categorySlug: "backend",
    tags: ["Express", "Crypto"],
    timeLimitMinutes: 25,
    averageRating: 4.4,
    ratingCount: 140,
    thumbnailUrl: null,
    solved: false,
  },
  {
    slug: "cart-total-flickers",
    title: "The cart total that flickers",
    shortDescription: "The checkout page shows the wrong total for a split second after every change.",
    difficulty: "medium",
    categorySlug: "frontend",
    tags: ["React", "TypeScript"],
    timeLimitMinutes: 40,
    averageRating: 4.6,
    ratingCount: 77,
    thumbnailUrl: null,
    solved: false,
  },
  {
    slug: "deadlock-in-transfers",
    title: "Transfers that lock each other out",
    shortDescription: "Concurrent transfers between the same accounts hang until timeout.",
    difficulty: "hard",
    categorySlug: "database",
    tags: ["PostgreSQL"],
    timeLimitMinutes: 90,
    averageRating: 4.9,
    ratingCount: 41,
    thumbnailUrl: null,
    solved: false,
  },
];

// Activity ending today (~4 months by default): an 18-day streak, a gap before it.
export function mockActivity(now: number, days = 130): ActivityDay[] {
  return Array.from({ length: days }, (_, i) => {
    const daysAgo = days - 1 - i;
    const solved = daysAgo === 18 || i % 5 === 0 ? 0 : (i * 13) % 4;
    const opened = daysAgo === 18 ? 0 : daysAgo < 18 ? Math.max(1, solved) : solved;
    return {
      date: new Date(now - daysAgo * DAY).toISOString().slice(0, 10),
      problemsOpened: opened,
      problemsSolved: solved,
    };
  });
}

export async function mockGetDashboard(): Promise<Dashboard> {
  await delay(300);
  const now = Date.now();
  return {
    contests: [
      {
        id: "contest-daily",
        type: "daily",
        title: "The checkout breakdown",
        description: "Payments succeed. Orders never arrive.",
        difficulty: "hard",
        participantCount: 128,
        endsAt: new Date(now + (8 * 60 + 42) * MIN).toISOString(),
      },
      {
        id: "contest-weekly",
        type: "weekly",
        title: "Cache under pressure",
        description: "One stale read. Thousands of wrong results.",
        difficulty: "hard",
        participantCount: 342,
        endsAt: new Date(now + 3 * DAY + 8 * 60 * MIN).toISOString(),
      },
      {
        id: "contest-monthly",
        type: "monthly",
        title: "The midnight incident",
        description: "Restore a failing production pipeline.",
        difficulty: "hard",
        participantCount: 1204,
        endsAt: new Date(now + 26 * DAY).toISOString(),
      },
    ],
    inProgress: {
      problemSlug: "missing-webhook-events",
      title: "The missing webhook events",
      language: "Node.js",
      checksPassed: 3,
      checksTotal: 7,
      startedAt: new Date(now - (18 * 60 + 42) * 1000).toISOString(),
    },
    feed: FEED,
    stats: {
      totalPoints: 12840,
      problemsSolved: 147,
      currentStreak: 18,
      longestStreak: 24,
      level: { name: "Staff", order: 5, minPoints: 7500 },
      nextLevel: { name: "Principal", order: 6, minPoints: 15000 },
    },
    activity: mockActivity(now),
    recentWins: [
      {
        problemSlug: "fixed-the-memory-leak",
        title: "Fixed the memory leak",
        solvedAt: new Date(now - 2 * 60 * MIN).toISOString(),
        timeTakenSeconds: 32 * 60,
      },
      {
        problemSlug: "untangled-a-deadlock",
        title: "Untangled a deadlock",
        solvedAt: new Date(now - DAY).toISOString(),
        timeTakenSeconds: 46 * 60,
      },
    ],
  };
}
