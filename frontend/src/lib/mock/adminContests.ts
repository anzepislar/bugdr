// Mock of the admin contests API. Replaced by slice A6
// (see md_files/06_backend_slices.md, "Register mockov"). Dates are relative to now.
import { mockGetProblems } from "@/lib/mock/problems";
import type { AdminContest, AdminContestDraft, ContestProblemOption } from "@/lib/types/contest";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const MIN = 60_000;
const DAY = 86_400_000;

export async function mockGetContestProblemOptions(): Promise<ContestProblemOption[]> {
  const problems = await mockGetProblems();
  return problems.map(({ slug, title, difficulty, categorySlug }) => ({ slug, title, difficulty, categorySlug }));
}

// ponytail: kept in module memory so saves show up after client-side navigation; a full reload resets it. A6 replaces it.
let store: AdminContest[] | null = null;

async function contests(): Promise<AdminContest[]> {
  if (store) return store;
  const options = await mockGetContestProblemOptions();
  const pick = (...slugs: string[]) => options.filter((p) => slugs.includes(p.slug));
  const now = Date.now();
  const at = (ms: number) => new Date(now + ms).toISOString();
  const base = { description: "", rewardType: null, rewardDescription: null, rewardSentAt: null } as const;

  // Ids of active/ended contests match src/lib/mock/contests.ts, so "View results" opens their page.
  store = [
    { ...base, id: "contest-daily", type: "daily", title: "The checkout breakdown", description: "Payments succeed. Orders never arrive.", startsAt: at(-(15 * 60 + 18) * MIN), endsAt: at((8 * 60 + 42) * MIN), problems: pick("payment-retries-disappear") },
    { ...base, id: "contest-weekly", type: "weekly", title: "Cache under pressure", description: "Restore consistency under real traffic.", startsAt: at(-(3 * DAY + 16 * 60 * MIN)), endsAt: at(3 * DAY + 8 * 60 * MIN), problems: pick("stale-search-results", "prompt-cache-misses"), rewardType: "merch", rewardDescription: "Bugdr hoodie for the top 3" },
    { ...base, id: "contest-monthly", type: "monthly", title: "The midnight incident", description: "Recover a failing production data pipeline.", startsAt: at(-4 * DAY), endsAt: at(26 * DAY), problems: pick("session-refuses-to-expire", "deadlock-in-transfers", "inventory-under-pressure"), rewardType: "subscription", rewardDescription: "1 year free subscription" },
    { ...base, id: "contest-daily-next", type: "daily", title: "Tomorrow's incident", startsAt: at((8 * 60 + 42) * MIN), endsAt: at((32 * 60 + 42) * MIN), problems: pick("deadlock-in-transfers") },
    { ...base, id: "contest-weekly-next", type: "weekly", title: "The replica that lags behind", description: "Reads drift further from writes every hour.", startsAt: at(3 * DAY + 8 * 60 * MIN), endsAt: at(10 * DAY + 8 * 60 * MIN), problems: pick("inventory-under-pressure"), rewardType: "points", rewardDescription: "+500 points for every solve" },
    { ...base, id: "draft-queue", type: "daily", title: "A queue without a consumer", description: "Orders are waiting, but nothing is picking them up.", startsAt: null, endsAt: null, problems: pick("prompt-cache-misses") },
    { ...base, id: "draft-missing-index", type: "weekly", title: "The missing index", startsAt: null, endsAt: null, problems: pick("query-slower-every-day") },
    { ...base, id: "draft-subscription", type: "monthly", title: "A runaway subscription", startsAt: null, endsAt: null, problems: [] },
    { ...base, id: "contest-cache-eviction", type: "weekly", title: "Cache eviction incident", description: "Hot keys vanish minutes after every deploy.", startsAt: at(-15 * DAY), endsAt: at(-8 * DAY), problems: pick("stale-search-results") },
    { ...base, id: "contest-duplicate-invoices", type: "daily", title: "Duplicate invoices", description: "Customers are billed twice when the network blips.", startsAt: at(-10 * DAY), endsAt: at(-9 * DAY), problems: pick("webhook-signature-mismatch") },
  ];
  return store;
}

export async function mockGetAdminContests(): Promise<AdminContest[]> {
  await delay(300);
  return [...(await contests())];
}

export async function mockGetAdminContest(id: string): Promise<AdminContest | null> {
  await delay(200);
  return (await contests()).find((c) => c.id === id) ?? null;
}

/** POST /admin/contests without `id`, PATCH /admin/contests/:id with it. */
export async function mockSaveContest(draft: AdminContestDraft, id?: string): Promise<AdminContest> {
  await delay(600);
  const options = await mockGetContestProblemOptions();
  const { problemSlugs, ...rest } = draft;
  const saved: AdminContest = {
    ...rest,
    id: id ?? `mock-${Date.now()}`,
    rewardSentAt: null,
    problems: options.filter((p) => problemSlugs.includes(p.slug)),
  };
  const all = await contests();
  store = id ? all.map((c) => (c.id === id ? saved : c)) : [saved, ...all];
  return saved;
}

/** Schedule (dates set) or cancel (dates null) from the list. */
export async function mockSetContestDates(id: string, startsAt: string | null, endsAt: string | null): Promise<void> {
  await delay(300);
  store = (await contests()).map((c) => (c.id === id ? { ...c, startsAt, endsAt } : c));
}

// ponytail: archive just drops the row from the mock; A6 needs a contests.archived_at column (04_admin.md).
export async function mockRemoveContest(id: string): Promise<void> {
  await delay(300);
  store = (await contests()).filter((c) => c.id !== id);
}
