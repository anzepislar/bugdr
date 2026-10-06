// Mock of POST /problems/:slug/start and POST /attempts/:id/test. Replaced by slices R1 and R4
// (R6 streams results per check). See md_files/06_backend_slices.md, "Register mockov".
import { mockCodebase, mockGetProblem } from "@/lib/mock/problems";
import type { Attempt, CheckRunResult } from "@/lib/types/attempt";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function mockStartAttempt(slug: string): Promise<Attempt | null> {
  const [problem, files] = [await mockGetProblem(slug), mockCodebase(slug)];
  if (!problem || !files) return null;
  // An attempt already in progress keeps its timer (R1); a new one starts now.
  const elapsedMs = problem.status === "in_progress" ? (18 * 60 + 42) * 1000 : 0;
  return {
    id: `attempt-${slug}`,
    problemSlug: slug,
    problemTitle: problem.title,
    repositoryName: problem.repository.name,
    startedAt: new Date(Date.now() - elapsedMs).toISOString(),
    timeLimitMinutes: problem.timeLimitMinutes,
    files,
    checks: problem.checks.map((description, i) => ({ id: `check-${i + 1}`, checkOrder: i + 1, description })),
  };
}

// Which checks pass on the untouched codebase (by position) and why the others fail.
const PASSING: Record<string, number[]> = { "payment-retries-disappear": [1, 2, 3] };
const FAILURES: Record<string, Record<number, string>> = {
  "payment-retries-disappear": {
    0: "No delayed job was found after a simulated provider timeout.\nExpected: 1 queued job  Received: 0",
    4: "The retry job was never scheduled, so no back-off delay could be measured.",
    5: "Job ord_842 disappeared from the queue after the first failure.",
    6: "1 of 4 tests failed in tests/retry.test.ts",
  },
};

export async function mockRunTests(attempt: Attempt): Promise<CheckRunResult[]> {
  await delay(400);
  const passing = PASSING[attempt.problemSlug] ?? [attempt.checks.length - 1];
  return attempt.checks.map((c, i) =>
    passing.includes(i)
      ? { checkId: c.id, passed: true }
      : {
          checkId: c.id,
          passed: false,
          output: FAILURES[attempt.problemSlug]?.[i] ?? "The reported bug still reproduces.",
        },
  );
}
