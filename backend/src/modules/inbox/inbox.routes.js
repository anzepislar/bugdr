import { Router } from "express";
import { pool } from "../../db.js";
import { HttpError } from "../../errors.js";
import { requireAuth } from "../auth/auth.service.js";
import { FEEDBACK_TYPE_LABEL, getThread, listThreads, replyToThread, syncInbox } from "./inbox.service.js";

const str = (v) => (typeof v === "string" ? v : "");
const MAX_FEEDBACK = 2000; // same as the form (frontend lib/types/inbox.ts)
const FEEDBACK_PER_HOUR = 5;
const MAX_REPLY = 10_000;

// POST /feedback { type, message, page } - the "Help & feedback" form. Needs an account, so it can be answered.
export const feedbackRouter = Router();

feedbackRouter.post("/", requireAuth, async (req, res) => {
  const type = str(req.body?.type);
  const message = str(req.body?.message).trim();
  const page = str(req.body?.page);
  const details = {};
  if (!(type in FEEDBACK_TYPE_LABEL)) details.type = "Choose a type";
  if (!message || message.length > MAX_FEEDBACK) details.message = `1-${MAX_FEEDBACK} characters`;
  if (Object.keys(details).length) throw new HttpError(400, "VALIDATION_ERROR", "Check the highlighted fields", details);

  const { rows: recent } = await pool.query(
    `SELECT count(*)::int AS n FROM inbox_threads
     WHERE kind = 'feedback' AND user_id = $1 AND created_at > now() - interval '1 hour'`,
    [req.user.id],
  );
  if (recent[0].n >= FEEDBACK_PER_HOUR) throw new HttpError(429, "RATE_LIMITED", "Too many messages. Try again later");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO inbox_threads (kind, subject, feedback_type, page, from_email, user_id)
       VALUES ('feedback', $1, $2, $3, $4, $5) RETURNING id`,
      [FEEDBACK_TYPE_LABEL[type], type, page.startsWith("/") ? page.slice(0, 500) : null, req.user.email, req.user.id],
    );
    await client.query("INSERT INTO inbox_entries (thread_id, direction, body) VALUES ($1, 'in', $2)", [rows[0].id, message]);
    await client.query("COMMIT");
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// /admin/inbox (behind requireAdmin): emails to @mail.bugdr.app + feedback, answered by email.
export const adminInboxRouter = Router();

adminInboxRouter.get("/", async (req, res) => {
  // Opening the inbox pulls new mail first; a Resend outage still shows what is stored.
  await syncInbox().catch((err) => console.error(`Inbox sync: ${err.message}`));
  res.json({ threads: await listThreads() });
});

adminInboxRouter.get("/count", async (req, res) => {
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM inbox_threads WHERE status = 'new'");
  res.json({ new: rows[0].n });
});

adminInboxRouter.post("/:id/reply", async (req, res) => {
  const body = str(req.body?.body).trim();
  if (!body || body.length > MAX_REPLY)
    throw new HttpError(400, "VALIDATION_ERROR", "Check the highlighted fields", { body: `1-${MAX_REPLY} characters` });
  res.json({ thread: await replyToThread(req.params.id, body) });
});

adminInboxRouter.put("/:id/status", async (req, res) => {
  const status = str(req.body?.status);
  if (status !== "new" && status !== "done")
    throw new HttpError(400, "VALIDATION_ERROR", "Check the highlighted fields", { status: "new or done" });
  await getThread(req.params.id); // 404 for an unknown id
  await pool.query("UPDATE inbox_threads SET status = $2 WHERE id = $1", [req.params.id, status]);
  res.json({ thread: await getThread(req.params.id) });
});
