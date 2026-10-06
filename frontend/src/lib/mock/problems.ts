// Mock of GET /problems and GET /problems/:slug. Replaced by slices P1 and P2 (see md_files/06_backend_slices.md, "Register mockov").
import type { ProblemDetail, ProblemListItem } from "@/lib/types/problem";

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
  },
];

export async function mockGetProblems(): Promise<ProblemListItem[]> {
  await delay(300);
  return PROBLEMS;
}

type DetailFields = Omit<ProblemDetail, keyof ProblemListItem>;

const DETAILS: Record<string, DetailFields> = {
  "payment-retries-disappear": {
    description: `## Your assignment

You have joined the payments team at Northstar, an online marketplace.
A background worker processes checkout events and schedules retries when the payment provider is temporarily unavailable.

## What the team is seeing

Support reports that a small number of orders remain in "payment pending".
The original payment attempt is logged, but the expected follow-up never appears. The incident began during a burst of provider timeouts.

\`\`\`worker.log
[WARN] gateway timeout order=ord_842 attempt=1
[INFO] retry scheduled delay=30000ms
\`\`\`

## Expected behavior

Transient payment failures should be retried without charging twice.
Successful payments should complete their order exactly once.`,
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
      files: [
        "package.json",
        "tsconfig.json",
        "src/index.ts",
        "src/queue.ts",
        "src/retry.ts",
        "src/gateway.ts",
        "src/orders.ts",
        "test/retry.test.ts",
      ],
    },
  },
};

// Every other mock problem gets a generic detail built from its card.
function genericDetail(p: ProblemListItem): DetailFields {
  return {
    description: `## Your assignment\n\n${p.shortDescription}\n\n## Expected behavior\n\nFind the root cause and fix it without breaking existing behavior.`,
    solveCount: p.ratingCount * 6,
    commentCount: Math.round(p.ratingCount / 4),
    checks: ["Reproduce the reported bug", "Fix the root cause", "Existing tests still pass"],
    repository: { name: `acme / ${p.slug}`, stack: p.tags, files: ["package.json", "src/index.ts", "test/index.test.ts"] },
  };
}

export async function mockGetProblem(slug: string): Promise<ProblemDetail | null> {
  await delay(300);
  const p = PROBLEMS.find((x) => x.slug === slug);
  return p ? { ...p, ...(DETAILS[slug] ?? genericDetail(p)) } : null;
}
