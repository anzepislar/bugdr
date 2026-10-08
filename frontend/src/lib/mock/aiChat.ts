// Mock of the built-in AI chat (Claude API behind the backend) and the per-difficulty efficiency benchmarks
// (calibrated from /admin/analytics, md_files/04_admin.md). See md_files/06_backend_slices.md, "Register mockov".
import type { Difficulty } from "@/lib/types/problem";

export const AI_TOOLS = [
  { id: "claude", label: "Claude" },
  { id: "gpt-4", label: "GPT-4" },
  { id: "gemini", label: "Gemini" },
  { id: "other", label: "Other" },
] as const;
export type AiTool = (typeof AI_TOOLS)[number]["id"];

export const BENCHMARKS: Record<Difficulty, { prompts: number; tokens: number }> = {
  easy: { prompts: 4, tokens: 1500 },
  medium: { prompts: 8, tokens: 3200 },
  hard: { prompts: 14, tokens: 6500 },
  get_a_job: { prompts: 20, tokens: 12000 },
};

// ponytail: canned replies for payment-retries-disappear, used in order for every problem.
const RESPONSES = [
  `Looking at \`src/workers/payment.ts\`, the retry is created with a fixed job id:

\`\`\`ts
{ delay: 30_000 * data.attempt, jobId: data.orderId }
\`\`\`

BullMQ deduplicates by \`jobId\`. While the original job for \`ord_842\` still exists in the queue (it is the one currently failing), \`queue.add\` with the same id is silently ignored. That matches the failing check: "Job ord_842 disappeared from the queue after the first failure."`,
  `The smallest fix is to make the retry's job id unique per attempt, so it no longer collides with the job that is still running:

\`\`\`ts
await queue.add(
  "payment",
  { ...data, attempt: data.attempt + 1 },
  { delay: 30_000 * data.attempt, jobId: \`\${data.orderId}:\${data.attempt + 1}\` },
);
\`\`\`

The gateway call already sends \`idempotencyKey: orderId\`, so a duplicate charge is still prevented on the provider side.`,
  `One more thing to check: if the first job is created with \`attempt: 0\`, the first retry gets \`delay: 30_000 * 0 = 0\` and runs immediately, which would fail the back-off check. Use the next attempt number for the delay:

\`\`\`ts
const next = data.attempt + 1;
await queue.add("payment", { ...data, attempt: next }, { delay: 30_000 * next, jobId: \`\${data.orderId}:\${next}\` });
\`\`\`

Run \`npm run test:scenario\` after the change. The provider-timeout and back-off checks should pass.`,
  `If a check still fails, paste its output here. Also confirm the worker catches only transient errors: a \`GatewayTimeoutError\` should be retried, but a declined card should not be, otherwise you schedule up to \`MAX_ATTEMPTS\` retries that can never succeed.`,
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function mockAskAi(promptIndex: number): Promise<string> {
  await delay(1500);
  return RESPONSES[promptIndex % RESPONSES.length];
}
