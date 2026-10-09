import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
const get = async (path, cookie) => fetch(`${base}${path}`, { headers: cookie ? { Cookie: cookie } : {} });

let cookie, ids;
before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, problems, contests CASCADE");
  ids = {};
  for (const [slug, difficulty, points] of [
    ["live-easy", "easy", 100],
    ["live-hard", "hard", 500],
    ["soon", "medium", 250],
    ["ended", "medium", 250],
    ["regular", "medium", 250],
  ]) {
    const { rows } = await pool.query(
      `INSERT INTO problems (slug, title, short_description, codebase_context, incident_report, thumbnail_url, difficulty,
         category_id, base_points, time_limit_minutes, is_published)
       SELECT $1::text, $1::text, 'short', 'context', 'incident of ' || $1::text, '/thumb.svg', $2, id, $3, 40, TRUE
       FROM problem_categories WHERE slug = 'backend' RETURNING id`,
      [slug, difficulty, points],
    );
    ids[slug] = rows[0].id;
    await pool.query(`INSERT INTO problem_codebase (problem_id, repository_structure, files, language, repository_name)
      VALUES ($1, '[]', '{}', 'TypeScript', 'Repo ' || $2::text)`, [rows[0].id, slug]);
  }
  await pool.query("INSERT INTO problem_tags (problem_id, tag) VALUES ($1, 'Redis'), ($1, 'Node.js')", [ids["live-easy"]]);
  await pool.query(
    `INSERT INTO problem_checks (problem_id, description, check_type, check_command, check_order)
     SELECT $1, 'check ' || n, 'test', 'true', n FROM generate_series(1, 3) n`,
    [ids["live-easy"]],
  );

  const contest = async (title, starts, ends, slugs) => {
    const { rows } = await pool.query(
      `INSERT INTO contests (type, title, starts_at, ends_at, reward_description)
       VALUES ('weekly', $1, now() + $2::interval, now() + $3::interval, 'A hoodie') RETURNING id`,
      [title, starts, ends],
    );
    // The first problem added is the one the page shows (D59).
    for (const [i, slug] of slugs.entries())
      await pool.query(
        "INSERT INTO contest_problems (contest_id, problem_id, created_at) VALUES ($1, $2, now() + $3 * interval '1 second')",
        [rows[0].id, ids[slug], i],
      );
    return rows[0].id;
  };
  ids.live = await contest("Live", "-1 day", "1 day", ["live-easy", "live-hard"]);
  ids.upcoming = await contest("Upcoming", "1 day", "2 days", ["soon"]);
  ids.past = await contest("Past", "-3 days", "-2 days", ["ended"]);
  const { rows } = await pool.query("INSERT INTO contests (type, title) VALUES ('daily', 'Draft') RETURNING id");
  ids.draft = rows[0].id;

  const res = await fetch(`${base}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "alice@example.com", username: "alice", password: "password1" }),
  });
  cookie = res.headers.get("set-cookie").split(";")[0];
});

after(async () => {
  server.close();
  await pool.end();
});

test("GET /contests: buckets by date, no drafts, nothing about an upcoming contest's problems", async () => {
  const data = await (await get("/contests")).json();
  assert.deepEqual(
    [data.live, data.upcoming, data.past].map((list) => list.map((c) => c.title)),
    [["Live"], ["Upcoming"], ["Past"]],
  );
  assert.deepEqual(data.history, []);
  const [live] = data.live;
  // Hardest problem; tags and thumbnail from the first one.
  assert.equal(live.difficulty, "hard");
  assert.deepEqual(live.tags, ["Node.js", "Redis"]);
  assert.equal(live.thumbnailUrl, "/thumb.svg");
  const [upcoming] = data.upcoming;
  assert.equal(upcoming.difficulty, null);
  assert.deepEqual(upcoming.tags, []);
  assert.equal(upcoming.thumbnailUrl, null);
  assert.equal(JSON.stringify(data).includes("soon"), false);
});

test("GET /contests/:id: the first problem of a live contest, none for an upcoming one, 404 for drafts", async () => {
  assert.equal((await get(`/contests/${ids.live}`)).status, 401);

  const { contest: live } = await (await get(`/contests/${ids.live}`, cookie)).json();
  assert.equal(live.status, "live");
  assert.deepEqual(live.problem, {
    slug: "live-easy",
    repositoryName: "Repo live-easy",
    incident: "incident of live-easy",
    checkCount: 3,
  });
  assert.equal(live.rewardDescription, "A hoodie");
  assert.equal(live.participation, null);

  const upcomingRes = await get(`/contests/${ids.upcoming}`, cookie);
  const upcomingText = await upcomingRes.text();
  assert.equal(JSON.parse(upcomingText).contest.problem, null);
  assert.equal(upcomingText.includes("soon"), false);

  assert.equal((await (await get(`/contests/${ids.past}`, cookie)).json()).contest.status, "past");
  for (const id of [ids.draft, "not-a-uuid", "00000000-0000-4000-8000-000000000000"])
    assert.equal((await get(`/contests/${id}`, cookie)).status, 404);
});

test("D17: an upcoming contest's problem cannot be opened; a live one's is off the list but opens; an ended one is public", async () => {
  const listed = (await (await get("/problems", cookie)).json()).problems.map((p) => p.slug).sort();
  assert.deepEqual(listed, ["ended", "regular"]);

  assert.equal((await get("/problems/soon", cookie)).status, 404);
  assert.equal((await get("/problems/soon/comments", cookie)).status, 404);
  const start = await fetch(`${base}/problems/soon/start`, { method: "POST", headers: { Cookie: cookie } });
  assert.equal(start.status, 404);

  assert.equal((await get("/problems/live-easy", cookie)).status, 200);
  assert.equal((await get("/problems/ended", cookie)).status, 200);
});

test("GET /dashboard: live contests, also for guests; the feed follows D17", async () => {
  const data = await (await get("/dashboard")).json();
  assert.deepEqual(
    data.contests.map((c) => c.title),
    ["Live"],
  );
  assert.deepEqual(data.feed.map((p) => p.slug).sort(), ["ended", "regular"]);
});
