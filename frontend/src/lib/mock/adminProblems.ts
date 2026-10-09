// Mock check run for the unused ValidateStep (D45 removed the step; the real dry-run is A4).
// Saving (A2) and the upload + analysis (A10) are on the API.
import type { Check, CheckValidationResult } from "@/lib/types/problem";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
