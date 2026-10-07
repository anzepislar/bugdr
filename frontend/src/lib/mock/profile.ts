// Mock of GET /users/:username (+ /activity) and the /settings form. Replaced by slices U1, U2
// and D34 (see md_files/06_backend_slices.md, "Register mockov"). Dates are relative to now.
import { mockGetContests } from "@/lib/mock/contests";
import { MOCK_ME, mockActivity } from "@/lib/mock/dashboard";
import { mockGetProblems } from "@/lib/mock/problems";
import type { Profile, ProfileSettings } from "@/lib/types/profile";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DAY = 86_400_000;

export const MOCK_SETTINGS: ProfileSettings = {
  displayName: MOCK_ME.displayName,
  headline: "Backend engineer",
  githubUsername: "max-dev",
  goalRole: MOCK_ME.goalRole,
  experienceLevel: MOCK_ME.experienceLevel,
  languages: ["TypeScript", "JavaScript", "SQL"],
  isPublic: true,
};

export async function mockGetProfile(username: string): Promise<Profile | null> {
  if (username !== MOCK_ME.username) return null;
  const now = Date.now();
  const [problems, contests] = await Promise.all([mockGetProblems(), mockGetContests()]);

  return {
    username,
    displayName: MOCK_SETTINGS.displayName,
    headline: MOCK_SETTINGS.headline,
    languages: MOCK_SETTINGS.languages,
    isPublic: MOCK_SETTINGS.isPublic,
    stats: {
      totalPoints: 12840,
      problemsSolved: 147,
      currentStreak: 18,
      longestStreak: 24,
      level: { name: "Staff", order: 5, minPoints: 7500 },
      nextLevel: { name: "Principal", order: 6, minPoints: 15000 },
    },
    // Every third active day only, so the year roughly adds up to problemsSolved.
    activity: mockActivity(now, 371).map((a, i) => (i % 3 === 0 ? a : { ...a, problemsSolved: 0 })),
    // ponytail: 147 rows cycled from the problem mocks, so titles repeat; U1 returns the real solves.
    solved: Array.from({ length: 147 }, (_, i) => {
      const p = problems[i % problems.length];
      return {
        problemSlug: p.slug,
        title: p.title,
        difficulty: p.difficulty,
        timeTakenSeconds: 900 + ((i * 677) % 3600),
        solvedAt: new Date(now - Math.floor(i * 2.4) * DAY).toISOString(),
      };
    }),
    contests: contests.history,
  };
}

/** PUT /me/profile. */
export async function mockSaveSettings(settings: ProfileSettings): Promise<ProfileSettings> {
  await delay(400);
  return settings;
}
