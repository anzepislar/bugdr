import { Router } from "express";
import { pool } from "../../db.js";
import { HttpError } from "../../errors.js";

// A6: contest management. The status is never stored (D43): starts_at NULL = draft, then scheduled / active / ended
// from the dates. Drafts can be edited and deleted, scheduled contests edited or cancelled (back to a draft), ended
// ones archived (hidden from this list, 04). Scheduling follows D44.
export const adminContestsRouter = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = ["daily", "weekly", "monthly"];
const REWARDS = ["subscription", "merch", "points"];
const notFound = () => new HttpError(404, "NOT_FOUND", "Contest not found");
const str = (v) => (typeof v === "string" ? v.trim() : "");

// AdminContest (frontend/src/lib/types/contest.ts) incl. the status, which only the server uses for its rules.
const SELECT = `
  SELECT c.id, c.type, c.title, coalesce(c.description, '') AS description, c.reward_type, c.reward_description,
    c.starts_at AT TIME ZONE 'UTC' AS starts_at, c.ends_at AT TIME ZONE 'UTC' AS ends_at,
    CASE WHEN c.starts_at IS NULL THEN 'draft' WHEN c.starts_at > now() THEN 'scheduled'
         WHEN c.ends_at < now() THEN 'ended' ELSE 'active' END AS status,
    coalesce((SELECT json_agg(json_build_object('slug', p.slug, 'title', p.title, 'difficulty', p.difficulty,
        'categorySlug', cat.slug) ORDER BY cp.created_at, p.slug)
      FROM contest_problems cp JOIN problems p ON p.id = cp.problem_id
      LEFT JOIN problem_categories cat ON cat.id = p.category_id
      WHERE cp.contest_id = c.id), '[]') AS problems
  FROM contests c
  WHERE c.archived_at IS NULL`;

const toContest = (r) => ({
  id: r.id,
  type: r.type,
  title: r.title,
  description: r.description,
  startsAt: r.starts_at?.toISOString() ?? null,
  endsAt: r.ends_at?.toISOString() ?? null,
  problems: r.problems,
  rewardType: r.reward_type,
  rewardDescription: r.reward_description,
});

async function findContest(id) {
  if (!UUID.test(id)) throw notFound();
  const { rows } = await pool.query(`${SELECT} AND c.id = $1`, [id]);
  if (!rows.length) throw notFound();
  return rows[0];
}

const parseDate = (v) => {
  if (v === null || v === undefined) return null;
  const d = new Date(typeof v === "string" ? v : NaN);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/** D44 for a schedule: description, ≥ 1 problem, both dates, end after start, start in the future. */
function scheduleErrors({ description, problemCount, startsAt, endsAt }) {
  const details = {};
  if (!description) details.description = "A scheduled contest needs a description";
  if (problemCount < 1) details.problemSlugs = "Add at least one problem";
  if (!startsAt || !endsAt) details.startsAt = "Set both the start and the close time";
  else if (endsAt <= startsAt) details.endsAt = "The close time must be after the start time";
  else if (startsAt <= new Date()) details.startsAt = "The start time must be in the future";
  return details;
}

/** AdminContestDraft from the body, or 400 with a message per field. A draft needs only a title and a type. */
async function parseDraft(body) {
  const d = {
    title: str(body?.title),
    type: body?.type,
    description: str(body?.description),
    startsAt: parseDate(body?.startsAt),
    endsAt: parseDate(body?.endsAt),
    problemSlugs: Array.isArray(body?.problemSlugs) ? [...new Set(body.problemSlugs)] : null,
    rewardType: body?.rewardType ?? null,
    rewardDescription: str(body?.rewardDescription) || null,
  };
  const details = {};
  if (!d.title || d.title.length > 255) details.title = "1-255 characters";
  if (!TYPES.includes(d.type)) details.type = "daily, weekly or monthly";
  if (d.startsAt === undefined || d.endsAt === undefined) details.startsAt = "Not a valid date";
  if ((d.startsAt === null) !== (d.endsAt === null)) details.startsAt = "Set both dates or neither";
  if (!d.problemSlugs || d.problemSlugs.some((s) => typeof s !== "string")) details.problemSlugs = "A list of problem slugs";
  if (d.rewardType !== null && !REWARDS.includes(d.rewardType)) details.rewardType = "subscription, merch, points or none";
  if (d.rewardType && !d.rewardDescription) details.rewardDescription = "Describe the reward";
  if (d.rewardDescription && d.rewardDescription.length > 255) details.rewardDescription = "At most 255 characters";
  if (!d.rewardType) d.rewardDescription = null;

  if (!details.problemSlugs && d.problemSlugs.length) {
    // Only published problems can be part of a contest.
    const { rows } = await pool.query("SELECT id, slug FROM problems WHERE slug = ANY($1) AND is_published", [d.problemSlugs]);
    if (rows.length !== d.problemSlugs.length) details.problemSlugs = "Unknown or unpublished problem";
    const ids = Object.fromEntries(rows.map((r) => [r.slug, r.id]));
    d.problemIds = d.problemSlugs.map((s) => ids[s]);
  }
  if (!Object.keys(details).length && d.startsAt)
    Object.assign(details, scheduleErrors({ ...d, problemCount: d.problemSlugs.length }));
  if (Object.keys(details).length) throw new HttpError(400, "VALIDATION_ERROR", "Check the highlighted fields", details);
  return d;
}

/** Inserts (id null) or replaces a contest and its problems in one transaction. Returns the id. */
async function saveContest(id, d) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const values = [
      d.title,
      d.type,
      d.description,
      d.startsAt?.toISOString() ?? null,
      d.endsAt?.toISOString() ?? null,
      d.rewardType,
      d.rewardDescription,
    ];
    const { rows } = id
      ? await client.query(
          `UPDATE contests SET title = $1, type = $2, description = $3,
             starts_at = $4::timestamptz AT TIME ZONE 'UTC', ends_at = $5::timestamptz AT TIME ZONE 'UTC',
             reward_type = $6, reward_description = $7
           WHERE id = $8 RETURNING id`,
          [...values, id],
        )
      : await client.query(
          `INSERT INTO contests (title, type, description, starts_at, ends_at, reward_type, reward_description)
           VALUES ($1, $2, $3, $4::timestamptz AT TIME ZONE 'UTC', $5::timestamptz AT TIME ZONE 'UTC', $6, $7) RETURNING id`,
          values,
        );
    const contestId = rows[0].id;
    await client.query("DELETE FROM contest_problems WHERE contest_id = $1", [contestId]);
    // created_at keeps the picked order (the public page shows the first problem, D59).
    await client.query(
      `INSERT INTO contest_problems (contest_id, problem_id, created_at)
       SELECT $1, p.id, now() + p.n * interval '1 millisecond' FROM unnest($2::uuid[]) WITH ORDINALITY AS p (id, n)`,
      [contestId, d.problemIds ?? []],
    );
    await client.query("COMMIT");
    return contestId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Published problems for the wizard's picker (ContestProblemOption).
adminContestsRouter.get("/problem-options", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.slug, p.title, p.difficulty, c.slug AS category_slug
     FROM problems p JOIN problem_categories c ON c.id = p.category_id
     WHERE p.is_published ORDER BY p.title`,
  );
  res.json({ problems: rows.map((r) => ({ slug: r.slug, title: r.title, difficulty: r.difficulty, categorySlug: r.category_slug })) });
});

// Every contest that is not archived; the client groups them by status.
adminContestsRouter.get("/", async (req, res) => {
  const { rows } = await pool.query(`${SELECT} ORDER BY coalesce(c.starts_at, c.created_at) DESC`);
  res.json({ contests: rows.map(toContest) });
});

adminContestsRouter.get("/:id", async (req, res) => {
  res.json({ contest: toContest(await findContest(req.params.id)) });
});

// "Save as Draft" sends no dates; "Schedule Contest" sends them (D44).
adminContestsRouter.post("/", async (req, res) => {
  const id = await saveContest(null, await parseDraft(req.body));
  res.status(201).json({ contest: toContest(await findContest(id)) });
});

// Edit = the whole contest again. Only drafts and scheduled contests (a running or ended one is fixed).
adminContestsRouter.put("/:id", async (req, res) => {
  const current = await findContest(req.params.id);
  if (current.status === "active" || current.status === "ended")
    throw new HttpError(409, "CONTEST_STARTED", "This contest has already started, so it can no longer be edited");
  const id = await saveContest(req.params.id, await parseDraft(req.body));
  res.json({ contest: toContest(await findContest(id)) });
});

// From the list: schedule a draft with dates, or cancel a scheduled contest with { startsAt: null, endsAt: null }.
adminContestsRouter.put("/:id/dates", async (req, res) => {
  const c = await findContest(req.params.id);
  const startsAt = parseDate(req.body?.startsAt);
  const endsAt = parseDate(req.body?.endsAt);
  if (startsAt === undefined || endsAt === undefined || (startsAt === null) !== (endsAt === null))
    throw new HttpError(400, "VALIDATION_ERROR", "Set both dates or neither", { startsAt: "Not a valid date" });
  if (startsAt === null) {
    if (c.status !== "scheduled") throw new HttpError(409, "NOT_SCHEDULED", "Only a scheduled contest can be cancelled");
  } else {
    if (c.status !== "draft") throw new HttpError(409, "NOT_A_DRAFT", "Only a draft can be scheduled");
    const details = scheduleErrors({ description: c.description, problemCount: c.problems.length, startsAt, endsAt });
    if (Object.keys(details).length) throw new HttpError(400, "VALIDATION_ERROR", "This draft cannot be scheduled yet", details);
  }
  await pool.query(
    `UPDATE contests SET starts_at = $2::timestamptz AT TIME ZONE 'UTC', ends_at = $3::timestamptz AT TIME ZONE 'UTC'
     WHERE id = $1`,
    [req.params.id, startsAt?.toISOString() ?? null, endsAt?.toISOString() ?? null],
  );
  res.json({ contest: toContest(await findContest(req.params.id)) });
});

// Only drafts can be deleted; nobody has seen them.
adminContestsRouter.delete("/:id", async (req, res) => {
  const c = await findContest(req.params.id);
  if (c.status !== "draft") throw new HttpError(409, "NOT_A_DRAFT", "Only a draft can be deleted");
  await pool.query("DELETE FROM contests WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

// Only ended contests are archived: they leave this list, results and history stay (04 "Archive").
adminContestsRouter.post("/:id/archive", async (req, res) => {
  const c = await findContest(req.params.id);
  if (c.status !== "ended") throw new HttpError(409, "NOT_ENDED", "Only an ended contest can be archived");
  await pool.query("UPDATE contests SET archived_at = now() WHERE id = $1", [req.params.id]);
  res.status(204).end();
});
