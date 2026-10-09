// Mock of GET /problems and GET /problems/:slug. Replaced by slices P1 and P2 (see md_files/06_backend_slices.md, "Register mockov").
import { BRIEFS } from "@/lib/mock/problemBriefs";
import type { ProblemComment, ProblemDetail, ProblemListItem, SolveResult } from "@/lib/types/problem";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const PROBLEMS: ProblemListItem[] = [
  {
    slug: "payment-retries-disappear",
    title: "Payment retries disappear",
    shortDescription: "Failed checkout jobs vanish from the queue.",
    difficulty: "medium",
    categorySlug: "backend",
    tags: ["Node.js", "Redis"],
    timeLimitMinutes: 40,
    averageRating: 4.8,
    ratingCount: 126,
    thumbnailUrl: "/mock/thumb-pipeline.svg",
    status: null,
    saved: false,
  },
  {
    slug: "query-slower-every-day",
    title: "The query that keeps growing",
    shortDescription: "A healthy endpoint slows as orders grow.",
    difficulty: "medium",
    categorySlug: "database",
    tags: ["PostgreSQL", "Express"],
    timeLimitMinutes: 45,
    averageRating: 4.8,
    ratingCount: 84,
    thumbnailUrl: "/mock/thumb-query.svg",
    status: "in_progress",
    saved: false,
  },
  {
    slug: "session-refuses-to-expire",
    title: "A session that never expires",
    shortDescription: "Revoked users can still access the API.",
    difficulty: "medium",
    categorySlug: "backend",
    tags: ["TypeScript", "JWT"],
    timeLimitMinutes: 35,
    averageRating: 4.8,
    ratingCount: 92,
    thumbnailUrl: "/mock/thumb-session.svg",
    status: null,
    saved: false,
  },
  {
    slug: "stale-search-results",
    title: "The stale search results",
    shortDescription: "New documents do not appear in results.",
    difficulty: "hard",
    categorySlug: "ai-engineer",
    tags: ["Python", "Vector search"],
    timeLimitMinutes: 70,
    averageRating: 4.8,
    ratingCount: 37,
    thumbnailUrl: "/mock/thumb-pipeline.svg",
    status: null,
    saved: false,
  },
  {
    slug: "chart-frozen-in-time",
    title: "A chart frozen in time",
    shortDescription: "Incoming updates stop reaching the UI.",
    difficulty: "easy",
    categorySlug: "frontend",
    tags: ["React", "WebSocket"],
    timeLimitMinutes: 25,
    averageRating: 4.8,
    ratingCount: 152,
    thumbnailUrl: "/mock/thumb-query.svg",
    status: null,
    saved: false,
  },
  {
    slug: "inventory-under-pressure",
    title: "Inventory under pressure",
    shortDescription: "Concurrent orders oversell the same stock.",
    difficulty: "hard",
    categorySlug: "backend",
    tags: ["Go", "PostgreSQL"],
    timeLimitMinutes: 60,
    averageRating: 4.8,
    ratingCount: 48,
    thumbnailUrl: "/mock/thumb-session.svg",
    status: null,
    saved: false,
  },
  {
    slug: "fixed-the-memory-leak",
    title: "The memory leak in the image resizer",
    shortDescription: "Memory grows with every upload until the worker is killed.",
    difficulty: "medium",
    categorySlug: "backend",
    tags: ["Node.js", "Streams"],
    timeLimitMinutes: 40,
    averageRating: 4.5,
    ratingCount: 211,
    thumbnailUrl: null,
    status: "solved",
    saved: false,
  },
  {
    slug: "webhook-signature-mismatch",
    title: "Webhook signatures that never match",
    shortDescription: "Every incoming webhook fails verification after an upgrade.",
    difficulty: "easy",
    categorySlug: "backend",
    tags: ["Express", "Crypto"],
    timeLimitMinutes: 25,
    averageRating: 4.4,
    ratingCount: 140,
    thumbnailUrl: null,
    status: null,
    saved: false,
  },
  {
    slug: "cart-total-flickers",
    title: "The cart total that flickers",
    shortDescription: "The checkout total is wrong for a split second after every change.",
    difficulty: "medium",
    categorySlug: "frontend",
    tags: ["React", "TypeScript"],
    timeLimitMinutes: 40,
    averageRating: 4.6,
    ratingCount: 77,
    thumbnailUrl: null,
    status: null,
    saved: false,
  },
  {
    slug: "deadlock-in-transfers",
    title: "Transfers that lock each other out",
    shortDescription: "Concurrent transfers between the same accounts hang until timeout.",
    difficulty: "hard",
    categorySlug: "database",
    tags: ["PostgreSQL"],
    timeLimitMinutes: 90,
    averageRating: 4.9,
    ratingCount: 41,
    thumbnailUrl: null,
    status: null,
    saved: false,
  },
  {
    slug: "prompt-cache-misses",
    title: "Every request is a cache miss",
    shortDescription: "The LLM bill doubled after a harmless refactor.",
    difficulty: "get_a_job",
    categorySlug: "ai-engineer",
    tags: ["Python", "Redis"],
    timeLimitMinutes: 180,
    averageRating: 4.7,
    ratingCount: 19,
    thumbnailUrl: null,
    status: null,
    saved: false,
  },
  {
    slug: "form-submits-twice",
    title: "The form that submits twice",
    shortDescription: "Some customers get charged two times for one order.",
    difficulty: "easy",
    categorySlug: "fullstack",
    tags: ["Next.js", "PostgreSQL"],
    timeLimitMinutes: 20,
    averageRating: 4.3,
    ratingCount: 98,
    thumbnailUrl: null,
    status: null,
    saved: false,
  },
];

export async function mockGetProblems(): Promise<ProblemListItem[]> {
  await delay(300);
  return PROBLEMS;
}

type DetailFields = Omit<ProblemDetail, keyof ProblemListItem | "result">;

// problem_codebase.files of the mock problems. README.md is added from the codebase context.
const CODEBASES: Record<string, Record<string, string>> = {
  "payment-retries-disappear": {
    "src/workers/payment.ts": `import { queue } from "../services/queue";
import { gateway } from "../services/gateway";
import { logger } from "../services/logger";
import { markOrderPaid } from "../services/orders";

const MAX_ATTEMPTS = 5;

export interface PaymentJob {
  data: { orderId: string; amount: number; attempt: number };
}

export async function processPayment(job: PaymentJob) {
  const { orderId, amount, attempt } = job.data;

  try {
    const result = await gateway.charge({
      orderId,
      amount,
      idempotencyKey: orderId,
    });

    await markOrderPaid(orderId, result.id);
  } catch (error) {
    logger.warn({ orderId, attempt, error });
    await scheduleRetry(job.data);
  }
}

async function scheduleRetry(data: PaymentJob["data"]) {
  if (data.attempt >= MAX_ATTEMPTS) return;

  // Back off a little more after every failed attempt.
  await queue.add(
    "payment",
    { ...data, attempt: data.attempt + 1 },
    { delay: 30_000 * data.attempt, jobId: data.orderId },
  );
}
`,
    "src/services/queue.ts": `import { Queue } from "bullmq";
import { redis } from "./redis";

export const queue = new Queue("checkout", { connection: redis });
`,
    "src/services/gateway.ts": `export class GatewayTimeoutError extends Error {}

export const gateway = {
  async charge(input: { orderId: string; amount: number; idempotencyKey: string }) {
    const response = await fetch(process.env.GATEWAY_URL + "/charges", {
      method: "POST",
      headers: { "Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify(input),
    });
    if (response.status === 504) throw new GatewayTimeoutError("gateway timeout");
    return (await response.json()) as { id: string };
  },
};
`,
    "tests/retry.test.ts": `import { describe, expect, it } from "vitest";
import { processPayment } from "../src/workers/payment";
import { queue } from "../src/services/queue";
import { simulateTimeout } from "./helpers";

describe("payment retries", () => {
  it("retries transient gateway failures", async () => {
    simulateTimeout();
    await processPayment({ data: { orderId: "ord_842", amount: 4900, attempt: 1 } });
    expect(await queue.getDelayedCount()).toBe(1);
  });
});
`,
    "package.json": `{
  "name": "checkout-worker",
  "private": true,
  "scripts": {
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "test:scenario": "vitest run --reporter=dot"
  },
  "dependencies": {
    "bullmq": "^5.12.0"
  },
  "devDependencies": {
    "tsx": "^4.16.0",
    "vitest": "^2.0.0"
  }
}
`,
  },
};

function genericFiles(p: ProblemListItem): Record<string, string> {
  return {
    "src/index.ts": `// ${p.title}\n// ${p.shortDescription}\n\nexport function main() {\n  return null;\n}\n`,
    "tests/index.test.ts": `import { expect, it } from "vitest";\nimport { main } from "../src/index";\n\nit("runs", () => {\n  expect(main).toBeDefined();\n});\n`,
    "package.json": `{\n  "name": "${p.slug}",\n  "private": true\n}\n`,
  };
}

const DETAILS: Record<string, DetailFields> = {
  "payment-retries-disappear": {
    ...BRIEFS["payment-retries-disappear"],
    solveCount: 842,
    commentCount: 37,
    checks: [
      "Retry transient failures",
      "Preserve successful payments",
      "Prevent duplicate charges",
      "Keep the worker healthy",
      "Back off between retries",
      "Keep failed jobs visible in the queue",
      "Existing tests still pass",
    ],
    repository: {
      name: "northstar / checkout-worker",
      stack: ["TypeScript", "Node 20", "Redis"],
      files: [...Object.keys(CODEBASES["payment-retries-disappear"]), "README.md"],
    },
  },
};

const HOUR = 3_600_000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();
const comment = (
  id: string,
  [username, displayName, goalRole]: [string, string, ProblemComment["author"]["goalRole"]],
  content: string,
  hoursAgo: number,
  helpfulCount: number,
  replies: ProblemComment[] = [],
): ProblemComment => ({
  id,
  author: { username, displayName, goalRole },
  content,
  createdAt: ago(hoursAgo),
  helpfulCount,
  markedHelpful: false,
  own: false,
  replies,
});

// Comments are only readable on solved problems; the mock user has solved this one.
const COMMENTS: Record<string, ProblemComment[]> = {
  "fixed-the-memory-leak": [
    comment(
      "c1",
      ["sara", "Sara K.", "backend"],
      "The stream that never closed was the part I had overlooked. I added a test that resizes 500 images in a loop and checks heap usage stays flat.",
      2,
      12,
      [comment("c1-r1", ["daniel", "Daniel R.", "fullstack"], "Same here. pipeline() instead of pipe() fixed it for me.", 1, 3)],
    ),
    comment(
      "c2",
      ["daniel", "Daniel R.", "fullstack"],
      "I kept the resize step and the upload step separate so each could be tested with the same fixture image.",
      4,
      8,
    ),
    comment(
      "c3",
      ["mina", "Mina L.", "backend"],
      "The heap snapshots in the incident brief gave enough context to reproduce this locally. Great scenario.",
      26,
      5,
    ),
  ],
};

const countComments = (list: ProblemComment[]): number =>
  list.reduce((n, c) => n + 1 + countComments(c.replies), 0);

/** Mock of GET /problems/:slug/comments (slice O2): content only for solved problems. */
export async function mockGetComments(slug: string): Promise<ProblemComment[] | null> {
  await delay(200);
  const p = PROBLEMS.find((x) => x.slug === slug);
  return p?.status === "solved" ? (COMMENTS[slug] ?? []) : null;
}

// Every other mock problem gets a generic detail built from its card.
function genericDetail(p: ProblemListItem): DetailFields {
  return {
    ...BRIEFS[p.slug],
    solveCount: p.ratingCount * 6,
    commentCount: COMMENTS[p.slug] ? countComments(COMMENTS[p.slug]) : Math.round(p.ratingCount / 4),
    checks: ["Reproduce the reported bug", "Fix the root cause", "Existing tests still pass"],
    repository: { name: `acme / ${p.slug}`, stack: p.tags, files: [...Object.keys(genericFiles(p)), "README.md"] },
  };
}

// Solved attempts of the mock user. 32:18 of a 40 min limit is over 75 % → 1x, Medium → 250 points (03_scoring.md).
const RESULTS: Record<string, Omit<SolveResult, "checksPassed" | "checksTotal">> = {
  "fixed-the-memory-leak": {
    attemptId: "00000000-0000-0000-0000-000000000001",
    solvedAt: "2026-10-06T08:12:00.000Z",
    timeTakenSeconds: 32 * 60 + 18,
    linesAdded: 24,
    linesDeleted: 11,
    pointsEarned: 250,
    timeMultiplier: 1,
    efficiencyScore: null,
    tries: [{ tryNumber: 1, outcome: "solved", durationSeconds: 32 * 60 + 18 }],
    myRating: null,
  },
};

export async function mockGetProblem(slug: string): Promise<ProblemDetail | null> {
  await delay(300);
  const p = PROBLEMS.find((x) => x.slug === slug);
  if (!p) return null;
  const detail = DETAILS[slug] ?? genericDetail(p);
  const solved = p.status === "solved" ? RESULTS[slug] : undefined;
  const result = solved ? { ...solved, checksPassed: detail.checks.length, checksTotal: detail.checks.length } : null;
  return { ...p, ...detail, result };
}

/** problem_codebase.files of a mock problem; README.md is the codebase context (never the incident or a hint). */
export function mockCodebase(slug: string): Record<string, string> | null {
  const p = PROBLEMS.find((x) => x.slug === slug);
  if (!p) return null;
  const detail = DETAILS[slug] ?? genericDetail(p);
  return { ...(CODEBASES[slug] ?? genericFiles(p)), "README.md": detail.codebaseContext };
}
