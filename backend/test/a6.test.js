import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { hashPassword } from "../src/modules/auth/auth.service.js";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
let admin;
const call = (method, path, body, cookie = admin) =>
  fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }) },
    body: body && JSON.stringify(body),
  });
const code = async (res) => [res.status, (await res.json()).error?.code];
const DAY = 86_400_000;
const at = (ms) => new Date(Date.now() + ms).toISOString();

const draft = (patch = {}) => ({
  title: "Cache under pressure",
  type: "weekly",
  description: "Restore consistency.",
  startsAt: null,
  endsAt: null,
  problemSlugs: ["p-hard", "p-easy"],
  rewardType: "merch",
  rewardDescription: "Hoodie",
  ...patch,
});

before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems, contests CASCADE");
  const { rows: cat } = await pool.query("SELECT id FROM problem_categories WHERE slug = 'backend'");
  await pool.query(
    `INSERT INTO problems (slug, title, short_description, codebase_context, incident_report, difficulty, base_points,
       time_limit_minutes, category_id, is_published)
     VALUES ('p-hard', 'Hard one', 's', 'c', 'i', 'hard', 500, 60, $1, TRUE),
            ('p-easy', 'Easy one', 's', 'c', 'i', 'easy', 100, 15, $1, TRUE),
            ('p-draft', 'Draft one', 's', 'c', 'i', 'easy', 100, 15, $1, FALSE)`,
    [cat[0].id],
  );
  config.adminEmail = "admin@bugdr.app";
  config.adminPasswordHash = await hashPassword("admin password 1");
  const res = await call("POST", "/admin/login", { email: "admin@bugdr.app", password: "admin password 1" }, null);
  admin = res.headers.get("set-cookie").split(";")[0];
});
after(async () => {
  server.close();
  await pool.end();
});

test("admin contests need the admin session; problem options are the published problems", async () => {
  assert.equal((await call("GET", "/admin/contests", null, null)).status, 401);
  const { problems } = await (await call("GET", "/admin/contests/problem-options")).json();
  assert.deepEqual(problems.map((p) => p.slug), ["p-easy", "p-hard"]);
  assert.deepEqual(problems[0], { slug: "p-easy", title: "Easy one", difficulty: "easy", categorySlug: "backend" });
});

test("save a draft, edit it, schedule it from the list, cancel it, delete only drafts", async () => {
  const res = await call("POST", "/admin/contests", draft());
  assert.equal(res.status, 201);
  const { contest } = await res.json();
  assert.deepEqual(
    [contest.startsAt, contest.problems.map((p) => p.slug), contest.rewardType],
    [null, ["p-hard", "p-easy"], "merch"],
  );
  // A draft is never public.
  assert.equal((await (await call("GET", "/contests", null, null)).json()).upcoming.length, 0);

  const edited = await (await call("PUT", `/admin/contests/${contest.id}`, draft({ title: "Renamed", problemSlugs: ["p-easy"], rewardType: null }))).json();
  assert.deepEqual([edited.contest.title, edited.contest.problems.length, edited.contest.rewardDescription], ["Renamed", 1, null]);

  const starts = at(DAY), ends = at(8 * DAY);
  const scheduled = await (await call("PUT", `/admin/contests/${contest.id}/dates`, { startsAt: starts, endsAt: ends })).json();
  assert.deepEqual([scheduled.contest.startsAt, scheduled.contest.endsAt], [starts, ends]);
  assert.equal((await (await call("GET", "/contests", null, null)).json()).upcoming[0].id, contest.id);
  assert.deepEqual(await code(await call("DELETE", `/admin/contests/${contest.id}`)), [409, "NOT_A_DRAFT"]);
  assert.deepEqual(await code(await call("PUT", `/admin/contests/${contest.id}/dates`, { startsAt: starts, endsAt: ends })), [409, "NOT_A_DRAFT"]);

  const cancelled = await (await call("PUT", `/admin/contests/${contest.id}/dates`, { startsAt: null, endsAt: null })).json();
  assert.equal(cancelled.contest.startsAt, null);
  assert.deepEqual(await code(await call("PUT", `/admin/contests/${contest.id}/dates`, { startsAt: null, endsAt: null })), [409, "NOT_SCHEDULED"]);
  assert.equal((await call("DELETE", `/admin/contests/${contest.id}`)).status, 204);
  assert.equal((await call("GET", `/admin/contests/${contest.id}`)).status, 404);
});

test("D44: scheduling needs a description, a problem and future dates in order; drafts only need title + type", async () => {
  const bare = await call("POST", "/admin/contests", draft({ description: "", problemSlugs: [], rewardType: null }));
  assert.equal(bare.status, 201);
  const { contest } = await bare.json();
  const sched = await call("PUT", `/admin/contests/${contest.id}/dates`, { startsAt: at(DAY), endsAt: at(2 * DAY) });
  assert.equal(sched.status, 400);
  assert.deepEqual(Object.keys((await sched.json()).error.details).sort(), ["description", "problemSlugs"]);

  const details = async (patch) => (await (await call("POST", "/admin/contests", draft(patch))).json()).error?.details;
  assert.deepEqual(await details({ startsAt: at(-DAY), endsAt: at(DAY) }), { startsAt: "The start time must be in the future" });
  assert.deepEqual(await details({ startsAt: at(2 * DAY), endsAt: at(DAY) }), { endsAt: "The close time must be after the start time" });
  assert.deepEqual(await details({ startsAt: at(DAY), endsAt: null }), { startsAt: "Set both dates or neither" });
  assert.deepEqual(await details({ problemSlugs: ["p-draft"] }), { problemSlugs: "Unknown or unpublished problem" });
  assert.deepEqual(await details({ rewardType: "points", rewardDescription: "" }), { rewardDescription: "Describe the reward" });
  assert.deepEqual(Object.keys(await details({ title: "", type: "yearly" })).sort(), ["title", "type"]);
});

test("a running contest is fixed; an ended one can only be archived", async () => {
  const insert = async (starts, ends) =>
    (await pool.query(
      `INSERT INTO contests (title, type, description, starts_at, ends_at) VALUES ('X', 'daily', 'd',
         (now() AT TIME ZONE 'UTC') + $1::interval, (now() AT TIME ZONE 'UTC') + $2::interval) RETURNING id`,
      [starts, ends],
    )).rows[0].id;
  const active = await insert("-1 hour", "1 hour");
  const ended = await insert("-2 days", "-1 day");
  assert.deepEqual(await code(await call("PUT", `/admin/contests/${active}`, draft())), [409, "CONTEST_STARTED"]);
  assert.deepEqual(await code(await call("POST", `/admin/contests/${active}/archive`)), [409, "NOT_ENDED"]);
  assert.deepEqual(await code(await call("DELETE", `/admin/contests/${ended}`)), [409, "NOT_A_DRAFT"]);
  assert.equal((await call("POST", `/admin/contests/${ended}/archive`)).status, 204);
  const { contests } = await (await call("GET", "/admin/contests")).json();
  assert.ok(contests.some((c) => c.id === active) && !contests.some((c) => c.id === ended));
});
