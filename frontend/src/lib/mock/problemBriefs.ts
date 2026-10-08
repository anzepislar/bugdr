// problems.codebase_context + problems.incident_report of the mock problems (02_problems.md, "Codebase Context" and
// "Incident Report"). Also the source of seeds/0001_problems.sql. No imports, so Node can load it to regenerate the seed.
export const BRIEFS: Record<string, { codebaseContext: string; incidentReport: string }> = {
  "payment-retries-disappear": {
    codebaseContext: `You have joined the payments team at Northstar, an online marketplace.
This service handles checkout job scheduling using a Redis queue. Background workers process checkout events and schedule payment retries when the payment provider is temporarily unavailable. The service has been running in production for 6 months.`,
    incidentReport: `[WARN] gateway timeout order=ord_842 attempt=1
[INFO] retry scheduled delay=30000ms
[WARN] gateway timeout order=ord_842 attempt=2
[INFO] retry scheduled delay=30000ms
[WARN] gateway timeout order=ord_842 attempt=3
[INFO] retry scheduled delay=30000ms

Support ticket #4821: "A small number of orders remain in payment pending status. The original payment attempt is logged but the expected follow-up never appears. The incident began during a burst of provider timeouts."`,
  },
  "query-slower-every-day": {
    codebaseContext: `You have joined the platform team at Larder, a grocery delivery startup.
This Express API serves the merchant dashboard. Merchants open the Orders page dozens of times a day to see recent orders, filter them by status and export them for accounting. Orders are stored in PostgreSQL; the service has run for two years with the same schema.`,
    incidentReport: `ALERT p95 latency GET /api/merchants/:id/orders > 2000ms (firing 3h)

GET /api/merchants/m_118/orders?status=paid   200   184ms   (14 Jan)
GET /api/merchants/m_118/orders?status=paid   200   912ms   (14 Apr)
GET /api/merchants/m_118/orders?status=paid   200  2741ms   (14 Oct)

postgres: duration: 2698.114 ms  statement: SELECT ... FROM orders ...

Support ticket #2210: "The orders page used to be instant. Now it takes several seconds and sometimes times out. Our largest stores are hit the worst."`,
  },
  "session-refuses-to-expire": {
    codebaseContext: `You have joined the identity team at Tessel, a B2B project management SaaS.
This TypeScript service issues and verifies sessions for the web app and the public API. Workspace admins can remove members and revoke their access from the admin console. Access tokens are JWTs; the API gateway calls this service on every request.`,
    incidentReport: `2026-10-07T09:14:02Z INFO  admin.revoke user=u_5521 workspace=w_88 by=u_101
2026-10-07T09:31:47Z INFO  api.request user=u_5521 GET /v1/projects 200
2026-10-07T11:02:13Z INFO  api.request user=u_5521 GET /v1/projects/p_42/files 200
2026-10-07T16:40:55Z INFO  api.request user=u_5521 POST /v1/exports 202

Security ticket SEC-311: "A contractor we removed this morning was still downloading project files in the afternoon. The admin console shows them as revoked. This is a compliance issue for us."`,
  },
  "stale-search-results": {
    codebaseContext: `You have joined the knowledge team at Quire, an internal docs platform.
This Python service powers semantic search: documents are split into chunks, embedded and stored in a vector index. An ingestion worker picks up new and edited documents from a queue; the search API embeds the user's question and returns the closest chunks.`,
    incidentReport: `ingest-worker  INFO  doc=d_9182 chunks=14 status=indexed
ingest-worker  INFO  doc=d_9183 chunks=6  status=indexed
search-api     INFO  q="2026 travel policy" top_k=5 hits=[d_2011, d_2011, d_1450, d_0877, d_2011]

Support ticket #7734: "We published the new travel policy yesterday. Search keeps returning last year's version, and the new document never shows up — even when I search for its exact title."`,
  },
  "chart-frozen-in-time": {
    codebaseContext: `You have joined the frontend team at Gridline, an energy trading dashboard.
This React app shows live prices for each market on a line chart. Prices arrive over a WebSocket several times per second; traders keep the dashboard open all day on a second monitor.`,
    incidentReport: `[ws] connected wss://stream.gridline.io/prices
[ws] message market=DE-BASE price=91.20
[ws] message market=DE-BASE price=91.35
[ws] message market=DE-BASE price=91.18

Support ticket #1189: "The header says 'Live' and the connection dot is green, but the chart line stopped moving at 09:00. Refreshing the page fixes it until we switch markets."`,
  },
  "inventory-under-pressure": {
    codebaseContext: `You have joined the commerce team at Kettle & Co, a kitchenware retailer.
This Go service owns stock levels. The storefront calls it to reserve items when a customer places an order; the warehouse system calls it when deliveries arrive. Stock is stored in PostgreSQL.`,
    incidentReport: `14:00:00.012 INFO  drop started sku=KC-DUTCH-OVEN stock=50
14:00:03.877 INFO  reserve sku=KC-DUTCH-OVEN qty=1 ok
14:00:03.879 INFO  reserve sku=KC-DUTCH-OVEN qty=1 ok
14:00:41.204 INFO  drop ended   sku=KC-DUTCH-OVEN orders=63

Warehouse ticket WH-902: "Flash sale on the Dutch oven: 63 orders confirmed, 50 units on the shelf. We are emailing 13 customers to cancel."`,
  },
  "fixed-the-memory-leak": {
    codebaseContext: `You have joined the media team at Snapfolio, a portfolio site for photographers.
This Node.js worker resizes uploaded images into thumbnails and web sizes using streams, then stores the results in object storage. It runs as a container with a 512 MB memory limit.`,
    incidentReport: `resizer  INFO  job=img_4410 sizes=4 ms=812 rss=212MB
resizer  INFO  job=img_4411 sizes=4 ms=790 rss=246MB
resizer  INFO  job=img_4412 sizes=4 ms=845 rss=281MB
...
resizer  INFO  job=img_4497 sizes=4 ms=901 rss=498MB
kubelet  OOMKilled container=resizer restarts=17

Support ticket #3305: "Uploads during the evening rush stay on 'processing' for minutes, then suddenly all finish at once."`,
  },
  "webhook-signature-mismatch": {
    codebaseContext: `You have joined the integrations team at Ledgerly, an invoicing tool.
This Express service receives webhooks from the payment provider (payment succeeded, refund created, dispute opened) and updates invoices. Each webhook is signed by the provider with a shared secret.`,
    incidentReport: `POST /webhooks/payments 400 {"error":"invalid signature"} event=evt_1Q8x
POST /webhooks/payments 400 {"error":"invalid signature"} event=evt_1Q8y
POST /webhooks/payments 400 {"error":"invalid signature"} event=evt_1Q8z

Provider dashboard: "Webhook endpoint failing — 1,284 deliveries failed in the last 24h. Endpoint will be disabled in 48h."

Deploy log: 2026-10-06 18:02 release v4.12.0 (dependency upgrades)`,
  },
  "cart-total-flickers": {
    codebaseContext: `You have joined the checkout team at Thread, a clothing store.
This React + TypeScript app renders the cart and checkout pages. Customers can change quantities, apply discount codes and pick a shipping method; the total updates as they go.`,
    incidentReport: `Session replay #88213:
  00:12  quantity 1 → 2         total shows €58.00
  00:12  (120ms later)          total shows €116.00
  00:19  apply code AUTUMN10    total shows €116.00
  00:19  (90ms later)           total shows €104.40

Support ticket #6120: "When I change anything in my cart the price jumps to a wrong number for a moment. I thought I was being overcharged and almost left."`,
  },
  "deadlock-in-transfers": {
    codebaseContext: `You have joined the ledger team at Copper, a business banking app.
This service moves money between accounts inside the bank: salary runs, transfers between a company's own accounts and card settlements. Every transfer updates two account balances in PostgreSQL in one transaction.`,
    incidentReport: `ERROR:  deadlock detected
DETAIL: Process 41022 waits for ShareLock on transaction 9917301; blocked by process 41019.
        Process 41019 waits for ShareLock on transaction 9917298; blocked by process 41022.
transfer-api  WARN  POST /transfers 504 duration=30001ms from=acc_210 to=acc_377

Support ticket #915: "Moving money between our two operating accounts at month end hangs and then fails. Single transfers in the middle of the day work fine."`,
  },
  "prompt-cache-misses": {
    codebaseContext: `You have joined the AI platform team at Parley, a customer support assistant.
This Python service builds the prompt for every chat turn (system instructions, company knowledge, conversation history) and calls the LLM provider. Responses to repeated requests are cached in Redis, and the provider's prompt caching is enabled for the long shared prefix.`,
    incidentReport: `llm-gateway  INFO  turn=t_77120 input_tokens=18432 cache_read=0 cache_write=18210
llm-gateway  INFO  turn=t_77121 input_tokens=18440 cache_read=0 cache_write=18218
redis        INFO  keyspace_hits=12 keyspace_misses=48211

Billing alert: "LLM spend is 2.1x the 30-day average."

Engineering note from the last PR (#1402 "Tidy up prompt builder"): "No behavior change, just refactoring."`,
  },
  "form-submits-twice": {
    codebaseContext: `You have joined the web team at Pantry Box, a meal-kit subscription.
This Next.js app handles sign-up and checkout. The checkout form creates an order in PostgreSQL and charges the customer's card through the payment provider.`,
    incidentReport: `POST /api/orders 201 order=ord_5512 customer=c_301 12:04:51.204
POST /api/orders 201 order=ord_5513 customer=c_301 12:04:51.611
payments  INFO  charge ch_88a1 amount=49.00 order=ord_5512
payments  INFO  charge ch_88a2 amount=49.00 order=ord_5513

Support ticket #4471: "I was charged twice for my first box. The page was slow, so I might have clicked the button again."`,
  },
};
