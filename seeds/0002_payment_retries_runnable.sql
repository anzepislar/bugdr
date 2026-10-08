-- D53: payment-retries-disappear is the first runnable problem (R3). Runs on plain Node 24 (D54): TypeScript via
-- Node's type stripping, node:test instead of vitest, an in-repo queue instead of BullMQ/Redis, no npm packages,
-- no network. The bug: a retry reuses the order id as job id while that job is still running, so the queue drops it.
-- hidden_files = the checks (never sent to the client, written last - D10); solution_files = the fix (D11).
-- Re-runnable: overwrites the codebase and checks of this one problem.
UPDATE problem_codebase SET
  repository_structure = '["package.json","src/checkout.ts","src/index.ts","src/services/gateway.ts","src/services/logger.ts","src/services/orders.ts","src/services/queue.ts","src/workers/payment.ts","tests/payment.test.ts"]'::jsonb,
  framework = 'Node 24',
  setup_commands = NULL,
  run_command = 'node src/index.ts',
  files = jsonb_build_object(
    'package.json', $f${
  "name": "checkout-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node src/index.ts",
    "test": "node --test tests/*.test.ts"
  }
}
$f$,
    'src/checkout.ts', $f$import { queue } from "./services/queue.ts";
import { createOrder } from "./services/orders.ts";

/** Called when a customer confirms checkout. One payment job per order, so a double click cannot charge twice. */
export async function checkout(orderId: string, amount: number) {
  await createOrder(orderId, amount);
  await queue.add("payment", { orderId, amount, attempt: 1 }, { jobId: orderId });
}
$f$,
    'src/index.ts', $f$import { queue } from "./services/queue.ts";
import { processPayment } from "./workers/payment.ts";

// Worker loop: picks up due payment jobs every second.
setInterval(() => void queue.processDue(processPayment), 1000);
$f$,
    'src/services/gateway.ts', $f$export class GatewayTimeoutError extends Error {}

export const gateway = {
  async charge(input: { orderId: string; amount: number; idempotencyKey: string }): Promise<{ id: string }> {
    const response = await fetch(process.env.GATEWAY_URL + "/charges", {
      method: "POST",
      headers: { "Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify(input),
    });
    if (response.status === 504) throw new GatewayTimeoutError("gateway timeout");
    return (await response.json()) as { id: string };
  },
};
$f$,
    'src/services/logger.ts', $f$type Fields = Record<string, unknown>;

function write(level: string, message: string, fields: Fields) {
  if (process.env.LOG_LEVEL === "silent") return;
  console.log(JSON.stringify({ level, message, ...fields, time: new Date().toISOString() }));
}

export const logger = {
  info: (message: string, fields: Fields = {}) => write("info", message, fields),
  warn: (message: string, fields: Fields = {}) => write("warn", message, fields),
};
$f$,
    'src/services/orders.ts', $f$export type OrderStatus = "payment_pending" | "paid";

export interface Order {
  id: string;
  amount: number;
  status: OrderStatus;
  chargeId?: string;
}

// Stands in for the orders table.
const orders = new Map<string, Order>();

export async function createOrder(id: string, amount: number): Promise<Order> {
  const order: Order = { id, amount, status: "payment_pending" };
  orders.set(id, order);
  return order;
}

export async function getOrder(id: string): Promise<Order | undefined> {
  return orders.get(id);
}

export async function markOrderPaid(id: string, chargeId: string): Promise<void> {
  const order = orders.get(id);
  if (!order) throw new Error(`Unknown order ${id}`);
  order.status = "paid";
  order.chargeId = chargeId;
}
$f$,
    'src/services/queue.ts', $f$// In-process job queue with the subset of the BullMQ Queue API this service uses.
// Production runs the same calls against Redis; tests and local runs use this one.

export interface JobOptions {
  delay?: number;
  jobId?: string;
}

export type JobState = "waiting" | "delayed" | "active" | "failed";

export interface Job<T = unknown> {
  id: string;
  name: string;
  data: T;
  runAt: number;
  state: JobState;
  failedReason?: string;
}

let nextId = 1;

export class Queue {
  readonly name: string;
  private jobs = new Map<string, Job>();

  constructor(name: string) {
    this.name = name;
  }

  async add<T>(name: string, data: T, opts: JobOptions = {}): Promise<Job<T>> {
    const id = opts.jobId ?? String(nextId++);
    const existing = this.jobs.get(id);
    if (existing) return existing as Job<T>;
    const delay = opts.delay ?? 0;
    const job: Job<T> = { id, name, data, runAt: Date.now() + delay, state: delay > 0 ? "delayed" : "waiting" };
    this.jobs.set(id, job);
    return job;
  }

  async getJob(id: string): Promise<Job | undefined> {
    return this.jobs.get(id);
  }

  async getJobs(states: JobState[] = ["waiting", "delayed", "active", "failed"]): Promise<Job[]> {
    return [...this.jobs.values()].filter((j) => states.includes(j.state));
  }

  async getDelayedCount(): Promise<number> {
    return (await this.getJobs(["delayed"])).length;
  }

  /** Runs every job that is due at `now`, oldest first. A finished job is removed; a job that throws stays as failed. */
  async processDue(handler: (job: Job) => Promise<void>, now = Date.now()): Promise<number> {
    const due = [...this.jobs.values()]
      .filter((j) => (j.state === "waiting" || j.state === "delayed") && j.runAt <= now)
      .sort((a, b) => a.runAt - b.runAt);
    for (const job of due) {
      job.state = "active";
      try {
        await handler(job);
        this.jobs.delete(job.id);
      } catch (error) {
        job.state = "failed";
        job.failedReason = error instanceof Error ? error.message : String(error);
      }
    }
    return due.length;
  }
}

export const queue = new Queue("checkout");
$f$,
    'src/workers/payment.ts', $f$import { queue } from "../services/queue.ts";
import { gateway } from "../services/gateway.ts";
import { logger } from "../services/logger.ts";
import { markOrderPaid } from "../services/orders.ts";

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
    logger.warn("gateway timeout", { orderId, attempt, error: String(error) });
    await scheduleRetry(job.data);
  }
}

async function scheduleRetry(data: PaymentJob["data"]) {
  if (data.attempt >= MAX_ATTEMPTS) return;

  // Back off a little more after every failed attempt.
  const delay = 30_000 * data.attempt;
  await queue.add("payment", { ...data, attempt: data.attempt + 1 }, { delay, jobId: data.orderId });
  logger.info("retry scheduled", { orderId: data.orderId, delay });
}
$f$,
    'tests/payment.test.ts', $f$import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { gateway } from "../src/services/gateway.ts";
import { createOrder, getOrder } from "../src/services/orders.ts";
import { processPayment } from "../src/workers/payment.ts";

process.env.LOG_LEVEL = "silent";
beforeEach(() => mock.restoreAll());

test("a successful charge marks the order as paid", async () => {
  await createOrder("ord_1", 4900);
  mock.method(gateway, "charge", async () => ({ id: "ch_1" }));
  await processPayment({ data: { orderId: "ord_1", amount: 4900, attempt: 1 } });
  assert.deepEqual(await getOrder("ord_1"), { id: "ord_1", amount: 4900, status: "paid", chargeId: "ch_1" });
});

test("the order id is the idempotency key", async () => {
  await createOrder("ord_2", 1200);
  const charge = mock.method(gateway, "charge", async () => ({ id: "ch_2" }));
  await processPayment({ data: { orderId: "ord_2", amount: 1200, attempt: 1 } });
  assert.equal(charge.mock.calls[0].arguments[0].idempotencyKey, "ord_2");
});

test("a gateway timeout does not crash the worker", async () => {
  await createOrder("ord_3", 800);
  mock.method(gateway, "charge", async () => {
    throw new Error("gateway timeout");
  });
  await assert.doesNotReject(processPayment({ data: { orderId: "ord_3", amount: 800, attempt: 1 } }));
});
$f$
  ),
  hidden_files = jsonb_build_object(
    '.bugdr/checks/1-retry.test.ts', $f$import { test } from "node:test";
import assert from "node:assert/strict";
import { getOrder } from "../../src/services/orders.ts";
import { flakyGateway, runOrder } from "../harness.ts";

test("an order is paid after a transient gateway timeout", async () => {
  const charge = flakyGateway(1);
  await runOrder("ord_842");
  assert.equal(charge.mock.callCount(), 2, "Expected a second charge attempt after the timeout");
  assert.equal((await getOrder("ord_842"))?.status, "paid", "The order is still waiting for payment");
});
$f$,
    '.bugdr/checks/2-success.test.ts', $f$import { test } from "node:test";
import assert from "node:assert/strict";
import { getOrder } from "../../src/services/orders.ts";
import { flakyGateway, queue, runOrder } from "../harness.ts";

test("a successful payment is charged once and leaves nothing in the queue", async () => {
  const charge = flakyGateway(0);
  await runOrder("ord_100");
  assert.equal(charge.mock.callCount(), 1);
  assert.equal((await getOrder("ord_100"))?.status, "paid");
  assert.equal((await queue.getJobs()).length, 0);
});
$f$,
    '.bugdr/checks/3-idempotency.test.ts', $f$import { test } from "node:test";
import assert from "node:assert/strict";
import { flakyGateway, runOrder } from "../harness.ts";

test("every charge for one order uses the same idempotency key", async () => {
  const charge = flakyGateway(2);
  await runOrder("ord_300");
  const keys = new Set(charge.mock.calls.map((c) => c.arguments[0].idempotencyKey));
  assert.deepEqual([...keys], ["ord_300"]);
});
$f$,
    '.bugdr/checks/4-healthy.test.ts', $f$import { test } from "node:test";
import assert from "node:assert/strict";
import { getOrder } from "../../src/services/orders.ts";
import { checkout, flakyGateway, processPayment, queue } from "../harness.ts";

test("a failing payment never crashes the worker or blocks other orders", async () => {
  flakyGateway(1);
  await checkout("ord_401", 100);
  await checkout("ord_402", 200);
  await assert.doesNotReject(queue.processDue(processPayment));
  assert.equal((await queue.getJobs(["failed"])).length, 0, "A job crashed the worker");
  assert.equal((await getOrder("ord_402"))?.status, "paid", "The next order was not processed");
});
$f$,
    '.bugdr/checks/5-backoff.test.ts', $f$import { test } from "node:test";
import assert from "node:assert/strict";
import { checkout, flakyGateway, processPayment, queue } from "../harness.ts";

test("each retry waits longer than the one before", async () => {
  flakyGateway(3);
  await checkout("ord_500", 4900);
  const delays: number[] = [];
  let now = Date.now();
  for (let i = 0; i < 3; i++) {
    // The queue schedules from the real clock; `now` only decides which jobs are due.
    const scheduledFrom = Date.now();
    await queue.processDue(processPayment, now);
    const [next] = await queue.getJobs(["delayed"]);
    assert.ok(next, `No retry was waiting after failure ${i + 1}`);
    delays.push(next.runAt - scheduledFrom);
    now = next.runAt + 60 * 60 * 1000;
  }
  assert.ok(delays[0] >= 1000, `The first retry runs after ${delays[0]}ms`);
  assert.ok(delays[1] > delays[0] && delays[2] > delays[1], `Delays do not grow: ${delays.join(", ")}`);
});
$f$,
    '.bugdr/checks/6-visible.test.ts', $f$import { test } from "node:test";
import assert from "node:assert/strict";
import { checkout, flakyGateway, processPayment, queue } from "../harness.ts";

test("after a failure the order still has a job in the queue", async () => {
  flakyGateway(1);
  await checkout("ord_842", 4900);
  await queue.processDue(processPayment);
  const jobs = await queue.getJobs();
  assert.ok(
    jobs.some((j) => (j.data as { orderId: string }).orderId === "ord_842"),
    "Job for ord_842 disappeared from the queue after the first failure",
  );
});
$f$,
    '.bugdr/harness.ts', $f$// Hidden test harness (never sent to the user). Drives the real checkout + worker with a fake gateway.
import { mock } from "node:test";
import { checkout } from "../src/checkout.ts";
import { gateway, GatewayTimeoutError } from "../src/services/gateway.ts";
import { queue } from "../src/services/queue.ts";
import { processPayment } from "../src/workers/payment.ts";

process.env.LOG_LEVEL = "silent";

/** The gateway times out `failures` times, then succeeds. Returns the charge calls. */
export function flakyGateway(failures: number) {
  let left = failures;
  return mock.method(gateway, "charge", async (input: { orderId: string }) => {
    if (left-- > 0) throw new GatewayTimeoutError("gateway timeout");
    return { id: `ch_${input.orderId}` };
  });
}

/** Checkout, then run the worker on a fake clock (one hour ahead per step) until nothing is left to run. */
export async function runOrder(orderId: string, amount = 4900, maxSteps = 20) {
  await checkout(orderId, amount);
  let now = Date.now();
  for (let step = 0; step < maxSteps; step++) {
    const ran = await queue.processDue(processPayment, now);
    if (ran === 0 && (await queue.getJobs(["waiting", "delayed"])).length === 0) break;
    now += 60 * 60 * 1000;
  }
}

export { queue, checkout, processPayment };
$f$
  ),
  solution_files = jsonb_build_object(
    'src/workers/payment.ts', $f$import { queue } from "../services/queue.ts";
import { gateway } from "../services/gateway.ts";
import { logger } from "../services/logger.ts";
import { markOrderPaid } from "../services/orders.ts";

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
    logger.warn("gateway timeout", { orderId, attempt, error: String(error) });
    await scheduleRetry(job.data);
  }
}

async function scheduleRetry(data: PaymentJob["data"]) {
  if (data.attempt >= MAX_ATTEMPTS) return;

  // Back off a little more after every failed attempt.
  const delay = 30_000 * data.attempt;
  // One job id per attempt: the job that is still running keeps the order id, and the queue drops a duplicate id.
  const jobId = `${data.orderId}:attempt-${data.attempt + 1}`;
  await queue.add("payment", { ...data, attempt: data.attempt + 1 }, { delay, jobId });
  logger.info("retry scheduled", { orderId: data.orderId, delay });
}
$f$
  )
WHERE problem_id = (SELECT id FROM problems WHERE slug = 'payment-retries-disappear');

INSERT INTO problem_checks (problem_id, check_order, description, check_type, check_command)
SELECT p.id, v.n, v.description, 'test', v.command
FROM (VALUES
  (1, 'Retry transient failures', $c$node --test .bugdr/checks/1-retry.test.ts$c$),
  (2, 'Preserve successful payments', $c$node --test .bugdr/checks/2-success.test.ts$c$),
  (3, 'Prevent duplicate charges', $c$node --test .bugdr/checks/3-idempotency.test.ts$c$),
  (4, 'Keep the worker healthy', $c$node --test .bugdr/checks/4-healthy.test.ts$c$),
  (5, 'Back off between retries', $c$node --test .bugdr/checks/5-backoff.test.ts$c$),
  (6, 'Keep failed jobs visible in the queue', $c$node --test .bugdr/checks/6-visible.test.ts$c$),
  (7, 'Existing tests still pass', $c$node --test 'tests/**/*.test.ts'$c$)
) AS v (n, description, command)
JOIN problems p ON p.slug = 'payment-retries-disappear'
ON CONFLICT (problem_id, check_order) DO UPDATE
  SET description = EXCLUDED.description, check_type = EXCLUDED.check_type, check_command = EXCLUDED.check_command;
