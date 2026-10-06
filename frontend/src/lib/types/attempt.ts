import type { Check } from "@/lib/types/problem";

export type CheckStatus = "pending" | "running" | "passed" | "failed";

/** Result of POST /problems/:slug/start (slice R1). Never contains hidden files or check commands. */
export interface Attempt {
  id: string;
  problemSlug: string;
  problemTitle: string;
  /** D27: no column yet. */
  repositoryName: string;
  startedAt: string;
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
