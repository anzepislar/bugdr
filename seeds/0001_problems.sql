-- Dev problems = the frontend mock (frontend/src/lib/mock/problems.ts), same slugs. Re-runnable: rows are
-- inserted once, the problem text is refreshed.
INSERT INTO problems (slug, title, short_description, description, thumbnail_url, difficulty, category_id, base_points,
  time_limit_minutes, is_published, average_rating, rating_count, solve_count)
SELECT v.slug, v.title, v.short, v.description, v.thumb, v.difficulty, c.id, v.points, v.minutes, TRUE, v.rating, v.ratings,
  v.solves
FROM (VALUES
  ('payment-retries-disappear', 'Payment retries disappear', 'Failed checkout jobs vanish from the queue.', '## Your assignment

You have joined the payments team at Northstar, an online marketplace.
A background worker processes checkout events and schedules retries when the payment provider is temporarily unavailable.

## What the team is seeing

Support reports that a small number of orders remain in "payment pending".
The original payment attempt is logged, but the expected follow-up never appears. The incident began during a burst of provider timeouts.

```worker.log
[WARN] gateway timeout order=ord_842 attempt=1
[INFO] retry scheduled delay=30000ms
```

## Expected behavior

Transient payment failures should be retried without charging twice.
Successful payments should complete their order exactly once.', '/mock/thumb-pipeline.svg', 'medium', 'backend', 250, 40, 4.8, 126, 842),
  ('query-slower-every-day', 'The query that keeps growing', 'A healthy endpoint slows as orders grow.', '## Your assignment

A healthy endpoint slows as orders grow.

## Expected behavior

Find the root cause and fix it without breaking existing behavior.', '/mock/thumb-query.svg', 'medium', 'database', 250, 45, 4.8, 84, 504),
  ('session-refuses-to-expire', 'A session that never expires', 'Revoked users can still access the API.', '## Your assignment

Revoked users can still access the API.

## Expected behavior

Find the root cause and fix it without breaking existing behavior.', '/mock/thumb-session.svg', 'medium', 'backend', 250, 35, 4.8, 92, 552),
  ('stale-search-results', 'The stale search results', 'New documents do not appear in results.', '## Your assignment

New documents do not appear in results.

## Expected behavior

Find the root cause and fix it without breaking existing behavior.', '/mock/thumb-pipeline.svg', 'hard', 'ai-engineer', 500, 70, 4.8, 37, 222),
  ('chart-frozen-in-time', 'A chart frozen in time', 'Incoming updates stop reaching the UI.', '## Your assignment

Incoming updates stop reaching the UI.

## Expected behavior

Find the root cause and fix it without breaking existing behavior.', '/mock/thumb-query.svg', 'easy', 'frontend', 100, 25, 4.8, 152, 912),
  ('inventory-under-pressure', 'Inventory under pressure', 'Concurrent orders oversell the same stock.', '## Your assignment

Concurrent orders oversell the same stock.

## Expected behavior

Find the root cause and fix it without breaking existing behavior.', '/mock/thumb-session.svg', 'hard', 'backend', 500, 60, 4.8, 48, 288),
  ('fixed-the-memory-leak', 'The memory leak in the image resizer', 'Memory grows with every upload until the worker is killed.', '## Your assignment

Memory grows with every upload until the worker is killed.

## Expected behavior

Find the root cause and fix it without breaking existing behavior.', NULL, 'medium', 'backend', 250, 40, 4.5, 211, 1266),
  ('webhook-signature-mismatch', 'Webhook signatures that never match', 'Every incoming webhook fails verification after an upgrade.', '## Your assignment

Every incoming webhook fails verification after an upgrade.

## Expected behavior

Find the root cause and fix it without breaking existing behavior.', NULL, 'easy', 'backend', 100, 25, 4.4, 140, 840),
  ('cart-total-flickers', 'The cart total that flickers', 'The checkout total is wrong for a split second after every change.', '## Your assignment

The checkout total is wrong for a split second after every change.

## Expected behavior

Find the root cause and fix it without breaking existing behavior.', NULL, 'medium', 'frontend', 250, 40, 4.6, 77, 462),
  ('deadlock-in-transfers', 'Transfers that lock each other out', 'Concurrent transfers between the same accounts hang until timeout.', '## Your assignment

Concurrent transfers between the same accounts hang until timeout.

## Expected behavior

Find the root cause and fix it without breaking existing behavior.', NULL, 'hard', 'database', 500, 90, 4.9, 41, 246),
  ('prompt-cache-misses', 'Every request is a cache miss', 'The LLM bill doubled after a harmless refactor.', '## Your assignment

The LLM bill doubled after a harmless refactor.

## Expected behavior

Find the root cause and fix it without breaking existing behavior.', NULL, 'get_a_job', 'ai-engineer', 1000, 180, 4.7, 19, 114),
  ('form-submits-twice', 'The form that submits twice', 'Some customers get charged two times for one order.', '## Your assignment

Some customers get charged two times for one order.

## Expected behavior

Find the root cause and fix it without breaking existing behavior.', NULL, 'easy', 'fullstack', 100, 20, 4.3, 98, 588)
) AS v (slug, title, short, description, thumb, difficulty, category, points, minutes, rating, ratings, solves)
JOIN problem_categories c ON c.slug = v.category
ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description, solve_count = EXCLUDED.solve_count;

INSERT INTO problem_tags (problem_id, tag)
SELECT p.id, v.tag
FROM (VALUES
  ('payment-retries-disappear', 'Node.js'),
  ('payment-retries-disappear', 'Redis'),
  ('query-slower-every-day', 'PostgreSQL'),
  ('query-slower-every-day', 'Express'),
  ('session-refuses-to-expire', 'TypeScript'),
  ('session-refuses-to-expire', 'JWT'),
  ('stale-search-results', 'Python'),
  ('stale-search-results', 'Vector search'),
  ('chart-frozen-in-time', 'React'),
  ('chart-frozen-in-time', 'WebSocket'),
  ('inventory-under-pressure', 'Go'),
  ('inventory-under-pressure', 'PostgreSQL'),
  ('fixed-the-memory-leak', 'Node.js'),
  ('fixed-the-memory-leak', 'Streams'),
  ('webhook-signature-mismatch', 'Express'),
  ('webhook-signature-mismatch', 'Crypto'),
  ('cart-total-flickers', 'React'),
  ('cart-total-flickers', 'TypeScript'),
  ('deadlock-in-transfers', 'PostgreSQL'),
  ('prompt-cache-misses', 'Python'),
  ('prompt-cache-misses', 'Redis'),
  ('form-submits-twice', 'Next.js'),
  ('form-submits-twice', 'PostgreSQL')
) AS v (slug, tag)
JOIN problems p ON p.slug = v.slug
ON CONFLICT (problem_id, tag) DO NOTHING;

INSERT INTO problem_codebase (problem_id, repository_name, repository_structure, files, language, framework)
SELECT p.id, v.repo, v.structure, v.files, v.language, v.framework
FROM (VALUES
  ('payment-retries-disappear', 'northstar / checkout-worker', '["src/workers/payment.ts","src/services/queue.ts","src/services/gateway.ts","tests/retry.test.ts","package.json"]'::jsonb, '{"src/workers/payment.ts":"import { queue } from \"../services/queue\";\nimport { gateway } from \"../services/gateway\";\nimport { logger } from \"../services/logger\";\nimport { markOrderPaid } from \"../services/orders\";\n\nconst MAX_ATTEMPTS = 5;\n\nexport interface PaymentJob {\n  data: { orderId: string; amount: number; attempt: number };\n}\n\nexport async function processPayment(job: PaymentJob) {\n  const { orderId, amount, attempt } = job.data;\n\n  try {\n    const result = await gateway.charge({\n      orderId,\n      amount,\n      idempotencyKey: orderId,\n    });\n\n    await markOrderPaid(orderId, result.id);\n  } catch (error) {\n    logger.warn({ orderId, attempt, error });\n    await scheduleRetry(job.data);\n  }\n}\n\nasync function scheduleRetry(data: PaymentJob[\"data\"]) {\n  if (data.attempt >= MAX_ATTEMPTS) return;\n\n  // Back off a little more after every failed attempt.\n  await queue.add(\n    \"payment\",\n    { ...data, attempt: data.attempt + 1 },\n    { delay: 30_000 * data.attempt, jobId: data.orderId },\n  );\n}\n","src/services/queue.ts":"import { Queue } from \"bullmq\";\nimport { redis } from \"./redis\";\n\nexport const queue = new Queue(\"checkout\", { connection: redis });\n","src/services/gateway.ts":"export class GatewayTimeoutError extends Error {}\n\nexport const gateway = {\n  async charge(input: { orderId: string; amount: number; idempotencyKey: string }) {\n    const response = await fetch(process.env.GATEWAY_URL + \"/charges\", {\n      method: \"POST\",\n      headers: { \"Idempotency-Key\": input.idempotencyKey },\n      body: JSON.stringify(input),\n    });\n    if (response.status === 504) throw new GatewayTimeoutError(\"gateway timeout\");\n    return (await response.json()) as { id: string };\n  },\n};\n","tests/retry.test.ts":"import { describe, expect, it } from \"vitest\";\nimport { processPayment } from \"../src/workers/payment\";\nimport { queue } from \"../src/services/queue\";\nimport { simulateTimeout } from \"./helpers\";\n\ndescribe(\"payment retries\", () => {\n  it(\"retries transient gateway failures\", async () => {\n    simulateTimeout();\n    await processPayment({ data: { orderId: \"ord_842\", amount: 4900, attempt: 1 } });\n    expect(await queue.getDelayedCount()).toBe(1);\n  });\n});\n","package.json":"{\n  \"name\": \"checkout-worker\",\n  \"private\": true,\n  \"scripts\": {\n    \"start\": \"tsx src/index.ts\",\n    \"test\": \"vitest run\",\n    \"test:scenario\": \"vitest run --reporter=dot\"\n  },\n  \"dependencies\": {\n    \"bullmq\": \"^5.12.0\"\n  },\n  \"devDependencies\": {\n    \"tsx\": \"^4.16.0\",\n    \"vitest\": \"^2.0.0\"\n  }\n}\n"}'::jsonb, 'TypeScript', 'Node 20'),
  ('query-slower-every-day', 'acme / query-slower-every-day', '["src/index.ts","tests/index.test.ts","package.json"]'::jsonb, '{"src/index.ts":"// The query that keeps growing\n// A healthy endpoint slows as orders grow.\n\nexport function main() {\n  // TODO: the bug lives somewhere in here.\n}\n","tests/index.test.ts":"import { expect, it } from \"vitest\";\nimport { main } from \"../src/index\";\n\nit(\"runs\", () => {\n  expect(main).toBeDefined();\n});\n","package.json":"{\n  \"name\": \"query-slower-every-day\",\n  \"private\": true\n}\n"}'::jsonb, 'PostgreSQL', NULL),
  ('session-refuses-to-expire', 'acme / session-refuses-to-expire', '["src/index.ts","tests/index.test.ts","package.json"]'::jsonb, '{"src/index.ts":"// A session that never expires\n// Revoked users can still access the API.\n\nexport function main() {\n  // TODO: the bug lives somewhere in here.\n}\n","tests/index.test.ts":"import { expect, it } from \"vitest\";\nimport { main } from \"../src/index\";\n\nit(\"runs\", () => {\n  expect(main).toBeDefined();\n});\n","package.json":"{\n  \"name\": \"session-refuses-to-expire\",\n  \"private\": true\n}\n"}'::jsonb, 'TypeScript', NULL),
  ('stale-search-results', 'acme / stale-search-results', '["src/index.ts","tests/index.test.ts","package.json"]'::jsonb, '{"src/index.ts":"// The stale search results\n// New documents do not appear in results.\n\nexport function main() {\n  // TODO: the bug lives somewhere in here.\n}\n","tests/index.test.ts":"import { expect, it } from \"vitest\";\nimport { main } from \"../src/index\";\n\nit(\"runs\", () => {\n  expect(main).toBeDefined();\n});\n","package.json":"{\n  \"name\": \"stale-search-results\",\n  \"private\": true\n}\n"}'::jsonb, 'Python', NULL),
  ('chart-frozen-in-time', 'acme / chart-frozen-in-time', '["src/index.ts","tests/index.test.ts","package.json"]'::jsonb, '{"src/index.ts":"// A chart frozen in time\n// Incoming updates stop reaching the UI.\n\nexport function main() {\n  // TODO: the bug lives somewhere in here.\n}\n","tests/index.test.ts":"import { expect, it } from \"vitest\";\nimport { main } from \"../src/index\";\n\nit(\"runs\", () => {\n  expect(main).toBeDefined();\n});\n","package.json":"{\n  \"name\": \"chart-frozen-in-time\",\n  \"private\": true\n}\n"}'::jsonb, 'React', NULL),
  ('inventory-under-pressure', 'acme / inventory-under-pressure', '["src/index.ts","tests/index.test.ts","package.json"]'::jsonb, '{"src/index.ts":"// Inventory under pressure\n// Concurrent orders oversell the same stock.\n\nexport function main() {\n  // TODO: the bug lives somewhere in here.\n}\n","tests/index.test.ts":"import { expect, it } from \"vitest\";\nimport { main } from \"../src/index\";\n\nit(\"runs\", () => {\n  expect(main).toBeDefined();\n});\n","package.json":"{\n  \"name\": \"inventory-under-pressure\",\n  \"private\": true\n}\n"}'::jsonb, 'Go', NULL),
  ('fixed-the-memory-leak', 'acme / fixed-the-memory-leak', '["src/index.ts","tests/index.test.ts","package.json"]'::jsonb, '{"src/index.ts":"// The memory leak in the image resizer\n// Memory grows with every upload until the worker is killed.\n\nexport function main() {\n  // TODO: the bug lives somewhere in here.\n}\n","tests/index.test.ts":"import { expect, it } from \"vitest\";\nimport { main } from \"../src/index\";\n\nit(\"runs\", () => {\n  expect(main).toBeDefined();\n});\n","package.json":"{\n  \"name\": \"fixed-the-memory-leak\",\n  \"private\": true\n}\n"}'::jsonb, 'Node.js', NULL),
  ('webhook-signature-mismatch', 'acme / webhook-signature-mismatch', '["src/index.ts","tests/index.test.ts","package.json"]'::jsonb, '{"src/index.ts":"// Webhook signatures that never match\n// Every incoming webhook fails verification after an upgrade.\n\nexport function main() {\n  // TODO: the bug lives somewhere in here.\n}\n","tests/index.test.ts":"import { expect, it } from \"vitest\";\nimport { main } from \"../src/index\";\n\nit(\"runs\", () => {\n  expect(main).toBeDefined();\n});\n","package.json":"{\n  \"name\": \"webhook-signature-mismatch\",\n  \"private\": true\n}\n"}'::jsonb, 'Express', NULL),
  ('cart-total-flickers', 'acme / cart-total-flickers', '["src/index.ts","tests/index.test.ts","package.json"]'::jsonb, '{"src/index.ts":"// The cart total that flickers\n// The checkout total is wrong for a split second after every change.\n\nexport function main() {\n  // TODO: the bug lives somewhere in here.\n}\n","tests/index.test.ts":"import { expect, it } from \"vitest\";\nimport { main } from \"../src/index\";\n\nit(\"runs\", () => {\n  expect(main).toBeDefined();\n});\n","package.json":"{\n  \"name\": \"cart-total-flickers\",\n  \"private\": true\n}\n"}'::jsonb, 'React', NULL),
  ('deadlock-in-transfers', 'acme / deadlock-in-transfers', '["src/index.ts","tests/index.test.ts","package.json"]'::jsonb, '{"src/index.ts":"// Transfers that lock each other out\n// Concurrent transfers between the same accounts hang until timeout.\n\nexport function main() {\n  // TODO: the bug lives somewhere in here.\n}\n","tests/index.test.ts":"import { expect, it } from \"vitest\";\nimport { main } from \"../src/index\";\n\nit(\"runs\", () => {\n  expect(main).toBeDefined();\n});\n","package.json":"{\n  \"name\": \"deadlock-in-transfers\",\n  \"private\": true\n}\n"}'::jsonb, 'PostgreSQL', NULL),
  ('prompt-cache-misses', 'acme / prompt-cache-misses', '["src/index.ts","tests/index.test.ts","package.json"]'::jsonb, '{"src/index.ts":"// Every request is a cache miss\n// The LLM bill doubled after a harmless refactor.\n\nexport function main() {\n  // TODO: the bug lives somewhere in here.\n}\n","tests/index.test.ts":"import { expect, it } from \"vitest\";\nimport { main } from \"../src/index\";\n\nit(\"runs\", () => {\n  expect(main).toBeDefined();\n});\n","package.json":"{\n  \"name\": \"prompt-cache-misses\",\n  \"private\": true\n}\n"}'::jsonb, 'Python', NULL),
  ('form-submits-twice', 'acme / form-submits-twice', '["src/index.ts","tests/index.test.ts","package.json"]'::jsonb, '{"src/index.ts":"// The form that submits twice\n// Some customers get charged two times for one order.\n\nexport function main() {\n  // TODO: the bug lives somewhere in here.\n}\n","tests/index.test.ts":"import { expect, it } from \"vitest\";\nimport { main } from \"../src/index\";\n\nit(\"runs\", () => {\n  expect(main).toBeDefined();\n});\n","package.json":"{\n  \"name\": \"form-submits-twice\",\n  \"private\": true\n}\n"}'::jsonb, 'Next.js', NULL)
) AS v (slug, repo, structure, files, language, framework)
JOIN problems p ON p.slug = v.slug
ON CONFLICT (problem_id) DO NOTHING;

-- ponytail: every check runs `npm test` until real checks come from Add Problem (A10).
INSERT INTO problem_checks (problem_id, check_order, description, check_type, check_command)
SELECT p.id, v.n, v.description, 'test', 'npm test'
FROM (VALUES
  ('payment-retries-disappear', 1, 'Retry transient failures'),
  ('payment-retries-disappear', 2, 'Preserve successful payments'),
  ('payment-retries-disappear', 3, 'Prevent duplicate charges'),
  ('payment-retries-disappear', 4, 'Keep the worker healthy'),
  ('payment-retries-disappear', 5, 'Back off between retries'),
  ('payment-retries-disappear', 6, 'Keep failed jobs visible in the queue'),
  ('payment-retries-disappear', 7, 'Existing tests still pass'),
  ('query-slower-every-day', 1, 'Reproduce the reported bug'),
  ('query-slower-every-day', 2, 'Fix the root cause'),
  ('query-slower-every-day', 3, 'Existing tests still pass'),
  ('session-refuses-to-expire', 1, 'Reproduce the reported bug'),
  ('session-refuses-to-expire', 2, 'Fix the root cause'),
  ('session-refuses-to-expire', 3, 'Existing tests still pass'),
  ('stale-search-results', 1, 'Reproduce the reported bug'),
  ('stale-search-results', 2, 'Fix the root cause'),
  ('stale-search-results', 3, 'Existing tests still pass'),
  ('chart-frozen-in-time', 1, 'Reproduce the reported bug'),
  ('chart-frozen-in-time', 2, 'Fix the root cause'),
  ('chart-frozen-in-time', 3, 'Existing tests still pass'),
  ('inventory-under-pressure', 1, 'Reproduce the reported bug'),
  ('inventory-under-pressure', 2, 'Fix the root cause'),
  ('inventory-under-pressure', 3, 'Existing tests still pass'),
  ('fixed-the-memory-leak', 1, 'Reproduce the reported bug'),
  ('fixed-the-memory-leak', 2, 'Fix the root cause'),
  ('fixed-the-memory-leak', 3, 'Existing tests still pass'),
  ('webhook-signature-mismatch', 1, 'Reproduce the reported bug'),
  ('webhook-signature-mismatch', 2, 'Fix the root cause'),
  ('webhook-signature-mismatch', 3, 'Existing tests still pass'),
  ('cart-total-flickers', 1, 'Reproduce the reported bug'),
  ('cart-total-flickers', 2, 'Fix the root cause'),
  ('cart-total-flickers', 3, 'Existing tests still pass'),
  ('deadlock-in-transfers', 1, 'Reproduce the reported bug'),
  ('deadlock-in-transfers', 2, 'Fix the root cause'),
  ('deadlock-in-transfers', 3, 'Existing tests still pass'),
  ('prompt-cache-misses', 1, 'Reproduce the reported bug'),
  ('prompt-cache-misses', 2, 'Fix the root cause'),
  ('prompt-cache-misses', 3, 'Existing tests still pass'),
  ('form-submits-twice', 1, 'Reproduce the reported bug'),
  ('form-submits-twice', 2, 'Fix the root cause'),
  ('form-submits-twice', 3, 'Existing tests still pass')
) AS v (slug, n, description)
JOIN problems p ON p.slug = v.slug
ON CONFLICT (problem_id, check_order) DO NOTHING;
