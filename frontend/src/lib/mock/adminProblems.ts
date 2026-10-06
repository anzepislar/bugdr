// Mock of the admin create-problem API. Replaced by backend slices A2-A5
// (see md_files/06_backend_slices.md, "Register mockov").
import type {
  AdminProblemDraft,
  Check,
  CheckValidationResult,
  ProblemAnalysis,
  SavedProblem,
} from "@/lib/types/problem";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const MOCK_ANALYSIS: ProblemAnalysis = {
  bugSummary:
    "src/auth/refresh.js compares the refresh token's `exp` claim (seconds) with Date.now() (milliseconds), so every refresh token looks expired. /auth/refresh always returns 401 and the client logs the user out on every page reload.",
  shortDescription:
    "Authentication service for a SaaS platform: registration, login and JWT token refresh.",
  fullDescription:
    "Welcome to the platform team. This is the authentication service for our SaaS product. It handles user registration, login and JWT token refresh, and has been running in production for six months. This morning, support started receiving reports that users get logged out every time they refresh the page. Nothing was deployed overnight.",
  suggestedDifficulty: "medium",
  difficultyReasoning:
    "The bug is a single comparison, but finding it requires following the token flow across the client interceptor, the refresh route and the token helper, and knowing that JWT `exp` is in seconds.",
  checks: [
    {
      id: "check-1",
      checkOrder: 1,
      description: "All unit tests pass",
      checkType: "test",
      checkCommand: "npm test",
      mustPass: true,
    },
    {
      id: "check-2",
      checkOrder: 2,
      description: "POST /auth/refresh with a valid refresh token returns 200",
      checkType: "custom",
      checkCommand: "node .bugdr/checks/refresh-valid.js",
      mustPass: true,
    },
    {
      id: "check-3",
      checkOrder: 3,
      description: "The refreshed access token is accepted by GET /me",
      checkType: "custom",
      checkCommand: "node .bugdr/checks/refresh-roundtrip.js",
      mustPass: true,
    },
    {
      id: "check-4",
      checkOrder: 4,
      description: "No lint errors",
      checkType: "lint",
      checkCommand: "npm run lint",
      mustPass: true,
    },
  ],
  hiddenFiles: {
    "test/refresh.test.js": [
      'const { isExpired } = require("../src/auth/refresh");',
      "",
      'test("token expiring in one hour is not expired", () => {',
      "  const exp = Math.floor(Date.now() / 1000) + 3600;",
      "  expect(isExpired({ exp })).toBe(false);",
      "});",
      "",
    ].join("\n"),
    ".bugdr/checks/refresh-valid.js": [
      'const { request, validRefreshToken } = require("./helpers");',
      "",
      "(async () => {",
      '  const res = await request("POST", "/auth/refresh", { refreshToken: validRefreshToken() });',
      "  process.exit(res.status === 200 ? 0 : 1);",
      "})();",
      "",
    ].join("\n"),
  },
  tags: ["jwt", "authentication", "express", "dates"],
};

export async function mockAnalyzeProblem(file: File): Promise<ProblemAnalysis> {
  await delay(1800);
  if (file.size === 0) throw new Error("The ZIP file is empty.");
  return structuredClone(MOCK_ANALYSIS);
}

// ponytail: mock rule - lint checks pass on the buggy code (a lint run does not
// catch a logic bug), everything else fails. Real results come from Docker (R3/A4).
export async function mockRunCheck(check: Check): Promise<CheckValidationResult> {
  await delay(700);
  const passed = check.checkType === "lint";
  return {
    checkId: check.id,
    passed,
    output: passed
      ? `$ ${check.checkCommand}\n✔ exited with code 0`
      : `$ ${check.checkCommand}\n✖ exited with code 1`,
  };
}

export async function mockSaveProblem(draft: AdminProblemDraft): Promise<SavedProblem> {
  await delay(800);
  return { id: `mock-${Date.now()}`, slug: draft.slug, isPublished: draft.isPublished };
}
