// Mock of the sample progress shown blurred to guests. GET /dashboard (U3, T1) has the rest (see md_files/06_backend_slices.md, "Register mockov").
import type { ActivityDay, DashboardStats, Me, RecentWin } from "@/lib/types/dashboard";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MIN = 60_000;
const DAY = 86_400_000;

export const MOCK_ME: Me = {
  username: "max",
  displayName: "Max",
  goalRole: "backend",
  experienceLevel: "mid",
};

// Admin overview only (A9); the sidebar badge counts real live contests (T1).
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

/** Sample progress for the guest blur (GET /dashboard sends guests none). */
export async function mockGetDashboard(): Promise<{
  sample: {
    stats: DashboardStats;
    activity: ActivityDay[];
    recentWins: RecentWin[];
  };
}> {
  await delay(300);
  const now = Date.now();
  return {
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
