// Mock of GET /admin/stats. Replaced by backend slice A9
// (see md_files/06_backend_slices.md, "Register mockov").
import { MOCK_ACTIVE_CONTEST_COUNT } from "@/lib/mock/dashboard";
import type { AdminOverview, RangedCount, StatsRange } from "@/lib/types/adminStats";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const RANGED: Record<StatsRange, { activeUsers: RangedCount; solves: RangedCount }> = {
  today: { activeUsers: { value: 1284, trendPct: 6 }, solves: { value: 342, trendPct: -3 } },
  "7d": { activeUsers: { value: 4912, trendPct: 12 }, solves: { value: 2318, trendPct: 8 } },
  "30d": { activeUsers: { value: 8730, trendPct: 18 }, solves: { value: 9642, trendPct: 14 } },
  all: { activeUsers: { value: 11904, trendPct: null }, solves: { value: 61208, trendPct: null } },
};

// Contest days (every 7th) spike; the last value is today's solves.
const SOLVES_14D = [268, 291, 305, 274, 612, 330, 298, 312, 287, 341, 705, 352, 319, 342];

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// Steady growth with a weekend dip and some noise, deterministic.
function userGrowth(): AdminOverview["userGrowth"] {
  return Array.from({ length: 30 }, (_, i) => {
    const weekend = new Date(daysAgo(29 - i)).getUTCDay() % 6 === 0;
    return {
      date: daysAgo(29 - i),
      signups: Math.round((96 + i * 3.2 + 14 * Math.sin(i * 1.7)) * (weekend ? 0.72 : 1)),
      dau: Math.round((930 + i * 12 + 40 * Math.sin(i * 0.9)) * (weekend ? 0.84 : 1)),
    };
  });
}

export async function mockGetAdminOverview(range: StatsRange): Promise<AdminOverview> {
  await delay(300);
  return {
    totalUsers: 12486,
    ...RANGED[range],
    problemsPublished: 148,
    activeContests: MOCK_ACTIVE_CONTEST_COUNT,
    userGrowth: userGrowth(),
    solvesPerDay: SOLVES_14D.map((solves, i) => ({ date: daysAgo(13 - i), solves })),
    // Sums to the all-time solves (61,208).
    solvesByDifficulty: { easy: 24812, medium: 21406, hard: 11273, get_a_job: 3717 },
    solvesByRole: [
      { categorySlug: "backend", solves: 21904 },
      { categorySlug: "fullstack", solves: 14388 },
      { categorySlug: "frontend", solves: 11872 },
      { categorySlug: "ai-engineer", solves: 8206 },
      { categorySlug: "database", solves: 4838 },
    ],
    streaks: [
      { range: "1d", users: 3412 },
      { range: "2-7d", users: 2186 },
      { range: "8-30d", users: 1043 },
      { range: "31-90d", users: 386 },
      { range: "90d+", users: 97 },
    ],
    topProblems: [
      { slug: "form-submits-twice", title: "The form that submits twice", difficulty: "easy", solves: 4120 },
      { slug: "webhook-signature-mismatch", title: "Webhook signatures that never match", difficulty: "easy", solves: 3874 },
      { slug: "chart-frozen-in-time", title: "A chart frozen in time", difficulty: "easy", solves: 3502 },
      { slug: "payment-retries-disappear", title: "Payment retries disappear", difficulty: "medium", solves: 2961 },
      { slug: "session-refuses-to-expire", title: "A session that never expires", difficulty: "medium", solves: 2708 },
      { slug: "cart-total-flickers", title: "The cart total that flickers", difficulty: "medium", solves: 2433 },
      { slug: "query-slower-every-day", title: "The query that keeps growing", difficulty: "medium", solves: 2195 },
      { slug: "inventory-under-pressure", title: "Inventory under pressure", difficulty: "hard", solves: 1287 },
    ],
    dropOff: [
      { slug: "prompt-cache-misses", title: "Every request is a cache miss", started: 1846, solved: 203 },
      { slug: "deadlock-in-transfers", title: "Transfers that lock each other out", started: 2310, solved: 512 },
      { slug: "stale-search-results", title: "The stale search results", started: 2894, solved: 781 },
      { slug: "inventory-under-pressure", title: "Inventory under pressure", started: 3652, solved: 1287 },
      { slug: "fixed-the-memory-leak", title: "The memory leak in the image resizer", started: 3120, solved: 1342 },
      { slug: "query-slower-every-day", title: "The query that keeps growing", started: 4418, solved: 2195 },
      { slug: "cart-total-flickers", title: "The cart total that flickers", started: 4205, solved: 2433 },
      { slug: "session-refuses-to-expire", title: "A session that never expires", started: 4390, solved: 2708 },
    ],
  };
}
