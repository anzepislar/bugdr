-- Dev problems = the frontend mock (frontend/src/lib/mock/problems.ts, texts from problemBriefs.ts), same slugs. Re-runnable: rows are
-- inserted once, the problem text is refreshed.
INSERT INTO problems (slug, title, short_description, codebase_context, incident_report, thumbnail_url, difficulty, category_id, base_points,
  time_limit_minutes, is_published, average_rating, rating_count, solve_count)
SELECT v.slug, v.title, v.short, v.context, v.incident, v.thumb, v.difficulty, c.id, v.points, v.minutes, TRUE, v.rating, v.ratings,
  v.solves
FROM (VALUES
  ('payment-retries-disappear', 'Payment retries disappear', 'Failed checkout jobs vanish from the queue.', 'You have joined the payments team at Northstar, an online marketplace.
This service handles checkout job scheduling using a Redis queue. Background workers process checkout events and schedule payment retries when the payment provider is temporarily unavailable. The service has been running in production for 6 months.', '[WARN] gateway timeout order=ord_842 attempt=1
[INFO] retry scheduled delay=30000ms
[WARN] gateway timeout order=ord_842 attempt=2
[INFO] retry scheduled delay=30000ms
[WARN] gateway timeout order=ord_842 attempt=3
[INFO] retry scheduled delay=30000ms

Support ticket #4821: "A small number of orders remain in payment pending status. The original payment attempt is logged but the expected follow-up never appears. The incident began during a burst of provider timeouts."', '/mock/thumb-pipeline.svg', 'medium', 'backend', 250, 40, 4.8, 126, 842),
  ('query-slower-every-day', 'The query that keeps growing', 'A healthy endpoint slows as orders grow.', 'You have joined the platform team at Larder, a grocery delivery startup.
This Express API serves the merchant dashboard. Merchants open the Orders page dozens of times a day to see recent orders, filter them by status and export them for accounting. Orders are stored in PostgreSQL; the service has run for two years with the same schema.', 'ALERT p95 latency GET /api/merchants/:id/orders > 2000ms (firing 3h)

GET /api/merchants/m_118/orders?status=paid   200   184ms   (14 Jan)
GET /api/merchants/m_118/orders?status=paid   200   912ms   (14 Apr)
GET /api/merchants/m_118/orders?status=paid   200  2741ms   (14 Oct)

postgres: duration: 2698.114 ms  statement: SELECT ... FROM orders ...

Support ticket #2210: "The orders page used to be instant. Now it takes several seconds and sometimes times out. Our largest stores are hit the worst."', '/mock/thumb-query.svg', 'medium', 'database', 250, 45, 4.8, 84, 504),
  ('session-refuses-to-expire', 'A session that never expires', 'Revoked users can still access the API.', 'You have joined the identity team at Tessel, a B2B project management SaaS.
This TypeScript service issues and verifies sessions for the web app and the public API. Workspace admins can remove members and revoke their access from the admin console. Access tokens are JWTs; the API gateway calls this service on every request.', '2026-10-07T09:14:02Z INFO  admin.revoke user=u_5521 workspace=w_88 by=u_101
2026-10-07T09:31:47Z INFO  api.request user=u_5521 GET /v1/projects 200
2026-10-07T11:02:13Z INFO  api.request user=u_5521 GET /v1/projects/p_42/files 200
2026-10-07T16:40:55Z INFO  api.request user=u_5521 POST /v1/exports 202

Security ticket SEC-311: "A contractor we removed this morning was still downloading project files in the afternoon. The admin console shows them as revoked. This is a compliance issue for us."', '/mock/thumb-session.svg', 'medium', 'backend', 250, 35, 4.8, 92, 552),
  ('stale-search-results', 'The stale search results', 'New documents do not appear in results.', 'You have joined the knowledge team at Quire, an internal docs platform.
This Python service powers semantic search: documents are split into chunks, embedded and stored in a vector index. An ingestion worker picks up new and edited documents from a queue; the search API embeds the user''s question and returns the closest chunks.', 'ingest-worker  INFO  doc=d_9182 chunks=14 status=indexed
ingest-worker  INFO  doc=d_9183 chunks=6  status=indexed
search-api     INFO  q="2026 travel policy" top_k=5 hits=[d_2011, d_2011, d_1450, d_0877, d_2011]

Support ticket #7734: "We published the new travel policy yesterday. Search keeps returning last year''s version, and the new document never shows up — even when I search for its exact title."', '/mock/thumb-pipeline.svg', 'hard', 'ai-engineer', 500, 70, 4.8, 37, 222),
  ('chart-frozen-in-time', 'A chart frozen in time', 'Incoming updates stop reaching the UI.', 'You have joined the frontend team at Gridline, an energy trading dashboard.
This React app shows live prices for each market on a line chart. Prices arrive over a WebSocket several times per second; traders keep the dashboard open all day on a second monitor.', '[ws] connected wss://stream.gridline.io/prices
[ws] message market=DE-BASE price=91.20
[ws] message market=DE-BASE price=91.35
[ws] message market=DE-BASE price=91.18

Support ticket #1189: "The header says ''Live'' and the connection dot is green, but the chart line stopped moving at 09:00. Refreshing the page fixes it until we switch markets."', '/mock/thumb-query.svg', 'easy', 'frontend', 100, 25, 4.8, 152, 912),
  ('inventory-under-pressure', 'Inventory under pressure', 'Concurrent orders oversell the same stock.', 'You have joined the commerce team at Kettle & Co, a kitchenware retailer.
This Go service owns stock levels. The storefront calls it to reserve items when a customer places an order; the warehouse system calls it when deliveries arrive. Stock is stored in PostgreSQL.', '14:00:00.012 INFO  drop started sku=KC-DUTCH-OVEN stock=50
14:00:03.877 INFO  reserve sku=KC-DUTCH-OVEN qty=1 ok
14:00:03.879 INFO  reserve sku=KC-DUTCH-OVEN qty=1 ok
14:00:41.204 INFO  drop ended   sku=KC-DUTCH-OVEN orders=63

Warehouse ticket WH-902: "Flash sale on the Dutch oven: 63 orders confirmed, 50 units on the shelf. We are emailing 13 customers to cancel."', '/mock/thumb-session.svg', 'hard', 'backend', 500, 60, 4.8, 48, 288),
  ('fixed-the-memory-leak', 'The memory leak in the image resizer', 'Memory grows with every upload until the worker is killed.', 'You have joined the media team at Snapfolio, a portfolio site for photographers.
This Node.js worker resizes uploaded images into thumbnails and web sizes using streams, then stores the results in object storage. It runs as a container with a 512 MB memory limit.', 'resizer  INFO  job=img_4410 sizes=4 ms=812 rss=212MB
resizer  INFO  job=img_4411 sizes=4 ms=790 rss=246MB
resizer  INFO  job=img_4412 sizes=4 ms=845 rss=281MB
...
resizer  INFO  job=img_4497 sizes=4 ms=901 rss=498MB
kubelet  OOMKilled container=resizer restarts=17

Support ticket #3305: "Uploads during the evening rush stay on ''processing'' for minutes, then suddenly all finish at once."', NULL, 'medium', 'backend', 250, 40, 4.5, 211, 1266),
  ('webhook-signature-mismatch', 'Webhook signatures that never match', 'Every incoming webhook fails verification after an upgrade.', 'You have joined the integrations team at Ledgerly, an invoicing tool.
This Express service receives webhooks from the payment provider (payment succeeded, refund created, dispute opened) and updates invoices. Each webhook is signed by the provider with a shared secret.', 'POST /webhooks/payments 400 {"error":"invalid signature"} event=evt_1Q8x
POST /webhooks/payments 400 {"error":"invalid signature"} event=evt_1Q8y
POST /webhooks/payments 400 {"error":"invalid signature"} event=evt_1Q8z

Provider dashboard: "Webhook endpoint failing — 1,284 deliveries failed in the last 24h. Endpoint will be disabled in 48h."

Deploy log: 2026-10-06 18:02 release v4.12.0 (dependency upgrades)', NULL, 'easy', 'backend', 100, 25, 4.4, 140, 840),
  ('cart-total-flickers', 'The cart total that flickers', 'The checkout total is wrong for a split second after every change.', 'You have joined the checkout team at Thread, a clothing store.
This React + TypeScript app renders the cart and checkout pages. Customers can change quantities, apply discount codes and pick a shipping method; the total updates as they go.', 'Session replay #88213:
  00:12  quantity 1 → 2         total shows €58.00
  00:12  (120ms later)          total shows €116.00
  00:19  apply code AUTUMN10    total shows €116.00
  00:19  (90ms later)           total shows €104.40

Support ticket #6120: "When I change anything in my cart the price jumps to a wrong number for a moment. I thought I was being overcharged and almost left."', NULL, 'medium', 'frontend', 250, 40, 4.6, 77, 462),
  ('deadlock-in-transfers', 'Transfers that lock each other out', 'Concurrent transfers between the same accounts hang until timeout.', 'You have joined the ledger team at Copper, a business banking app.
This service moves money between accounts inside the bank: salary runs, transfers between a company''s own accounts and card settlements. Every transfer updates two account balances in PostgreSQL in one transaction.', 'ERROR:  deadlock detected
DETAIL: Process 41022 waits for ShareLock on transaction 9917301; blocked by process 41019.
        Process 41019 waits for ShareLock on transaction 9917298; blocked by process 41022.
transfer-api  WARN  POST /transfers 504 duration=30001ms from=acc_210 to=acc_377

Support ticket #915: "Moving money between our two operating accounts at month end hangs and then fails. Single transfers in the middle of the day work fine."', NULL, 'hard', 'database', 500, 90, 4.9, 41, 246),
  ('prompt-cache-misses', 'Every request is a cache miss', 'The LLM bill doubled after a harmless refactor.', 'You have joined the AI platform team at Parley, a customer support assistant.
This Python service builds the prompt for every chat turn (system instructions, company knowledge, conversation history) and calls the LLM provider. Responses to repeated requests are cached in Redis, and the provider''s prompt caching is enabled for the long shared prefix.', 'llm-gateway  INFO  turn=t_77120 input_tokens=18432 cache_read=0 cache_write=18210
llm-gateway  INFO  turn=t_77121 input_tokens=18440 cache_read=0 cache_write=18218
redis        INFO  keyspace_hits=12 keyspace_misses=48211

Billing alert: "LLM spend is 2.1x the 30-day average."

Engineering note from the last PR (#1402 "Tidy up prompt builder"): "No behavior change, just refactoring."', NULL, 'get_a_job', 'ai-engineer', 1000, 180, 4.7, 19, 114),
  ('form-submits-twice', 'The form that submits twice', 'Some customers get charged two times for one order.', 'You have joined the web team at Pantry Box, a meal-kit subscription.
This Next.js app handles sign-up and checkout. The checkout form creates an order in PostgreSQL and charges the customer''s card through the payment provider.', 'POST /api/orders 201 order=ord_5512 customer=c_301 12:04:51.204
POST /api/orders 201 order=ord_5513 customer=c_301 12:04:51.611
payments  INFO  charge ch_88a1 amount=49.00 order=ord_5512
payments  INFO  charge ch_88a2 amount=49.00 order=ord_5513

Support ticket #4471: "I was charged twice for my first box. The page was slow, so I might have clicked the button again."', NULL, 'easy', 'fullstack', 100, 20, 4.3, 98, 588)
) AS v (slug, title, short, context, incident, thumb, difficulty, category, points, minutes, rating, ratings, solves)
JOIN problem_categories c ON c.slug = v.category
ON CONFLICT (slug) DO UPDATE SET codebase_context = EXCLUDED.codebase_context,
  incident_report = EXCLUDED.incident_report, solve_count = EXCLUDED.solve_count;

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
