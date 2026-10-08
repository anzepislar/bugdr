// Mock of POST /attempts/:id/test. Replaced by slice R4 (R6 streams results per check). See md_files/06_backend_slices.md, "Register mockov".
import type { Attempt, CheckRunResult } from "@/lib/types/attempt";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
