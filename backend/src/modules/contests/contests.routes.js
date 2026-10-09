import { Router } from "express";
import { pool } from "../../db.js";
import { HttpError } from "../../errors.js";
import { optionalAuth, requireAuth } from "../auth/auth.service.js";

export const contestsRouter = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One row per scheduled contest (drafts have no dates and are never public, D43). The status always follows from the
// dates. Difficulty = the hardest problem (base_points follow difficulty); tags, thumbnail and the problem the page shows
// come from the first problem (D59). Nothing about the problems while upcoming (T1).
const SELECT_CONTESTS = `
  SELECT c.id, c.type, c.title, coalesce(c.description, '') AS description, c.reward_description,
    c.starts_at AT TIME ZONE 'UTC' AS starts_at, c.ends_at AT TIME ZONE 'UTC' AS ends_at,
    CASE WHEN c.starts_at > now() THEN 'upcoming' WHEN c.ends_at <= now() THEN 'past' ELSE 'live' END AS status,
    (SELECT p.difficulty FROM contest_problems cp JOIN problems p ON p.id = cp.problem_id
     WHERE cp.contest_id = c.id ORDER BY p.base_points DESC LIMIT 1) AS difficulty,
    (SELECT count(*)::int FROM contest_entries e WHERE e.contest_id = c.id) AS participant_count,
    f.slug, f.thumbnail_url, f.incident_report, f.repository_name, f.check_count,
    coalesce((SELECT array_agg(t.tag ORDER BY t.tag) FROM problem_tags t WHERE t.problem_id = f.id), '{}') AS tags
  FROM contests c
  LEFT JOIN LATERAL (
    SELECT p.id, p.slug, p.thumbnail_url, p.incident_report, cb.repository_name,
      (SELECT count(*)::int FROM problem_checks k WHERE k.problem_id = p.id) AS check_count
    FROM contest_problems cp JOIN problems p ON p.id = cp.problem_id
    LEFT JOIN problem_codebase cb ON cb.problem_id = p.id
    WHERE cp.contest_id = c.id ORDER BY cp.created_at, p.slug LIMIT 1
  ) f ON true
  WHERE c.starts_at IS NOT NULL`;

const hidden = (r) => r.status === "upcoming";

// Contest in frontend/src/lib/types/contest.ts. Participants = contest_entries (D60).
const toContest = (r) => ({
  id: r.id,
  type: r.type,
  title: r.title,
  description: r.description,
  startsAt: r.starts_at.toISOString(),
  endsAt: r.ends_at.toISOString(),
  participantCount: r.participant_count,
  difficulty: hidden(r) ? null : r.difficulty,
  tags: hidden(r) ? [] : r.tags,
  thumbnailUrl: hidden(r) ? null : r.thumbnail_url,
});

/**
 * ContestList without history: live ending soonest first, upcoming starting soonest first, past newest first.
 * Also the dashboard's live contests (U3) and the sidebar badge.
 */
export async function listContests() {
  const { rows } = await pool.query(
    `${SELECT_CONTESTS}
     ORDER BY CASE WHEN c.starts_at > now() THEN extract(epoch FROM c.starts_at)
                   WHEN c.ends_at <= now() THEN -extract(epoch FROM c.ends_at)
                   ELSE extract(epoch FROM c.ends_at) END`,
  );
  const of = (status) => rows.filter((r) => r.status === status).map(toContest);
  return { live: of("live"), upcoming: of("upcoming"), past: of("past") };
}

// Public like the problem list: the sidebar badge counts live contests for guests too. The pages need a login (D47).
contestsRouter.get("/", optionalAuth, async (req, res) => {
  const [lists, history] = await Promise.all([listContests(), req.user ? getContestHistory(req.user.id) : []]);
  res.json({ ...lists, history });
});

const PROBLEM_COUNT = "(SELECT count(*)::int FROM contest_problems cp WHERE cp.contest_id = c.id) AS problem_count";

/** ContestHistoryEntry[]: the user's entries of ended contests, newest first (D32: solved + points). Also the profile. */
export async function getContestHistory(userId) {
  const { rows } = await pool.query(
    `SELECT c.id, c.title, e.problems_solved, e.total_score, c.ends_at AT TIME ZONE 'UTC' AS ends_at, ${PROBLEM_COUNT}
     FROM contest_entries e JOIN contests c ON c.id = e.contest_id
     WHERE e.user_id = $1 AND c.ends_at <= now()
     ORDER BY c.ends_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    contestId: r.id,
    title: r.title,
    problemsSolved: r.problems_solved,
    problemCount: r.problem_count,
    score: r.total_score,
    endedAt: r.ends_at.toISOString(),
  }));
}

// ContestDetail. participation = the user's entry (D60), null = not entered.
contestsRouter.get("/:id", requireAuth, async (req, res) => {
  const notFound = () => new HttpError(404, "CONTEST_NOT_FOUND", "Contest not found");
  if (!UUID.test(req.params.id)) throw notFound();
  const [{ rows }, { rows: entries }] = await Promise.all([
    pool.query(`${SELECT_CONTESTS} AND c.id = $1`, [req.params.id]),
    pool.query(
      `SELECT e.problems_solved, e.total_score, ${PROBLEM_COUNT}
       FROM contest_entries e JOIN contests c ON c.id = e.contest_id WHERE e.contest_id = $1 AND e.user_id = $2`,
      [req.params.id, req.user.id],
    ),
  ]);
  const r = rows[0];
  if (!r) throw notFound();
  const e = entries[0];

  res.json({
    contest: {
      ...toContest(r),
      status: r.status,
      problem:
        hidden(r) || !r.slug
          ? null
          : { slug: r.slug, repositoryName: r.repository_name ?? "", incident: r.incident_report, checkCount: r.check_count },
      rewardDescription: r.reward_description,
      participation: e ? { problemsSolved: e.problems_solved, problemCount: e.problem_count, score: e.total_score } : null,
    },
  });
});
