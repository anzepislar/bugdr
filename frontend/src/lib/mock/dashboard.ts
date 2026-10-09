// Mock of the dashboard's live contests (replaced by T1) and the sample progress shown blurred to guests.
// GET /dashboard (U3) has the rest (see md_files/06_backend_slices.md, "Register mockov").
import type { ActiveContest, ActivityDay, DashboardStats, Me, RecentWin } from "@/lib/types/dashboard";

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

/** Live contests (T1) + sample progress for the guest blur (GET /dashboard sends guests none). */
export async function mockGetDashboard(): Promise<{
  contests: ActiveContest[];
  sample: {
    stats: DashboardStats;
    activity: ActivityDay[];
    recentWins: RecentWin[];
  };
}> {
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
    sample: {
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
    },
  };
}
