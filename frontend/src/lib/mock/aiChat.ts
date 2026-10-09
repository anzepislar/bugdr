// Per-difficulty efficiency benchmarks (calibrated from /admin/analytics, md_files/04_admin.md) until S3/S7.
// The chat itself is on the API since S1. See md_files/06_backend_slices.md, "Register mockov".
import type { Difficulty } from "@/lib/types/problem";

export const BENCHMARKS: Record<Difficulty, { prompts: number; tokens: number }> = {
  easy: { prompts: 4, tokens: 1500 },
  medium: { prompts: 8, tokens: 3200 },
  hard: { prompts: 14, tokens: 6500 },
  get_a_job: { prompts: 20, tokens: 12000 },
};
