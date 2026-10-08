import type { Check } from "@/lib/types/problem";

export type CheckStatus = "pending" | "running" | "passed" | "failed";

/** Result of POST /problems/:slug/start (slice R1). Never contains hidden files or check commands. */
export interface Attempt {
  id: string;
  problemSlug: string;
  problemTitle: string;
  /** problem_codebase.repository_name (D27). */
  repositoryName: string;
  /** Start of the current try. */
  startedAt: string;
  /** R2b (D56): 1 for the first try, +1 after each give up and restart. */
  tryNumber: number;
  /** Time of the earlier (closed) tries; the clock and the time bonus count all tries. */
  previousSeconds: number;
  timeLimitMinutes: number;
  /** problem_codebase.files: path → content. */
  files: Record<string, string>;
  checks: Pick<Check, "id" | "checkOrder" | "description">[];
}

/** One check of POST /attempts/:id/test (slice R4). `output` only when the check failed. */
export interface CheckRunResult {
  checkId: string;
  passed: boolean;
  output?: string;
}
