import { config } from "../../config.js";
import { pool } from "../../db.js";
import { HttpError } from "../../errors.js";
import { addressOf, getReceived, listReceived, sendEmail } from "../email/email.service.js";

export const FEEDBACK_TYPE_LABEL = { bug: "Bug", idea: "Idea", problem: "Problem with a problem", other: "Other" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const utc = (column) => `to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// GET /admin/inbox shape (frontend lib/types/inbox.ts). ponytail: every thread with every entry in one query;
// paginate when the inbox grows past a few hundred threads.
const THREADS_SQL = `
  SELECT t.*, u.username,
    coalesce((SELECT json_agg(json_build_object('id', e.id, 'direction', e.direction, 'body', e.body,
                'at', ${utc("e.created_at")}) ORDER BY e.created_at, e.id)
              FROM inbox_entries e WHERE e.thread_id = t.id), '[]') AS entries
  FROM inbox_threads t LEFT JOIN users u ON u.id = t.user_id`;

const toThread = (r) => ({
  id: r.id,
  kind: r.kind,
  status: r.status,
  subject: r.subject,
  feedbackType: r.feedback_type,
  page: r.page,
  to: r.to_address,
  from: { name: r.from_name, email: r.from_email, userId: r.user_id, username: r.username },
  entries: r.entries,
  lastAt: r.last_at.toISOString(),
});

export async function listThreads() {
  const { rows } = await pool.query(`${THREADS_SQL} ORDER BY t.last_at DESC, t.id`);
  return rows.map(toThread);
}

export async function getThread(id) {
  const { rows } = UUID.test(id) ? await pool.query(`${THREADS_SQL} WHERE t.id = $1`, [id]) : { rows: [] };
  if (!rows[0]) throw new HttpError(404, "NOT_FOUND", "Message not found");
  return toThread(rows[0]);
}

/** Replies carry this as Reply-To, so the answer arrives at hello+<thread id>@... and joins its thread. */
const threadAddress = (id) => {
  const [local, domain] = addressOf(config.emailFrom).split("@");
  return `${local}+${id}@${domain}`;
};

/** "Ana Novak <ana@x.com>" → { name, email }. */
function parseFrom(from = "") {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || null, email: m[2].trim().toLowerCase() } : { name: null, email: from.trim().toLowerCase() };
}

/** Plain text from an HTML-only email. ponytail: crude tag strip, fine for reading; a parser if layouts get mangled. */
const htmlToText = (html = "") =>
  html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n");

/**
 * The new part of a reply: cut at the "On <date>, <name> wrote:" line and drop trailing "> " quotes.
 * ponytail: covers Gmail/Apple Mail/Outlook-web style quoting; other clients show the quote too.
 */
export function newPart(text) {
  const cut = text.search(/^[ \t]*On [^\n]{1,300}(\n[^\n]{0,200})?wrote:[ \t]*$/m);
  const head = (cut >= 0 ? text.slice(0, cut) : text).replace(/(\n[ \t]*>[^\n]*)+\s*$/, "").trim();
  return head || text.trim();
}

async function storeReceived(meta) {
  const email = await getReceived(meta.id);
  const from = parseFrom(email.from);
  const body = newPart(email.text ?? htmlToText(email.html)).slice(0, 20_000) || "(empty message)";
  const recipients = [...(email.to ?? []), ...(email.cc ?? []), ...(email.received_for ?? [])];
  const threadId = recipients.map((r) => r.match(/\+([0-9a-f-]{36})@/i)?.[1]).find((id) => id && UUID.test(id));
  const at = new Date(email.created_at ?? meta.created_at);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // An answer to one of our replies joins its thread - only from the address the thread is with.
    const { rows: existing } = threadId
      ? await client.query("SELECT id FROM inbox_threads WHERE id = $1 AND from_email = $2", [threadId, from.email])
      : { rows: [] };
    let id = existing[0]?.id;
    if (id) {
      await client.query("UPDATE inbox_threads SET status = 'new', last_at = greatest(last_at, $2) WHERE id = $1", [id, at]);
    } else {
      const { rows } = await client.query(
        `INSERT INTO inbox_threads (kind, subject, to_address, from_name, from_email, user_id, last_at, created_at)
         VALUES ('email', $1, $2, $3, $4::varchar, (SELECT id FROM users WHERE email = $4::varchar), $5, $5) RETURNING id`,
        [
          (email.subject || "(no subject)").slice(0, 300),
          (email.to?.[0] ?? "").slice(0, 255) || null,
          from.name?.slice(0, 255) ?? null,
          from.email.slice(0, 255),
          at,
        ],
      );
      id = rows[0].id;
    }
    await client.query(
      `INSERT INTO inbox_entries (thread_id, direction, body, resend_id, message_id, created_at)
       VALUES ($1, 'in', $2, $3, $4, $5)`,
      [id, body, meta.id, email.message_id?.slice(0, 500) ?? null, at],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

let running = null;

/**
 * Pulls emails received since the last sync from Resend into the inbox. One run at a time; a no-op without a key.
 * ponytail: reads the newest 100 only - more than 100 emails between two syncs (2 min apart) would be missed;
 * page with `after` if that ever happens.
 */
export function syncInbox() {
  if (!config.resendApiKey) return Promise.resolve();
  running ??= (async () => {
    const own = addressOf(config.emailFrom);
    // Our own address sending to itself (tests from the dashboard) is not a conversation.
    const list = (await listReceived(100)).filter((m) => parseFrom(m.from).email !== own);
    const { rows } = await pool.query("SELECT resend_id FROM inbox_entries WHERE resend_id = ANY($1)", [list.map((m) => m.id)]);
    const known = new Set(rows.map((r) => r.resend_id));
    // Oldest first, so a thread exists before the answers to it.
    for (const meta of list.filter((m) => !known.has(m.id)).reverse()) {
      try {
        await storeReceived(meta);
      } catch (err) {
        console.error(`Inbox sync: email ${meta.id}: ${err.message}`); // tried again on the next sync
      }
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Sends `body` by email to the thread's address and records it. A reply marks the thread done. */
export async function replyToThread(id, body) {
  const thread = await getThread(id);
  const { rows } = await pool.query(
    `SELECT message_id FROM inbox_entries WHERE thread_id = $1 AND direction = 'in' AND message_id IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`,
    [id],
  );
  const inReplyTo = rows[0]?.message_id;
  const feedback = thread.kind === "feedback";
  const original = thread.entries.find((e) => e.direction === "in")?.body ?? "";
  const text = feedback
    ? `${body}\n\n---\nYour message (${thread.subject}):\n${original.replace(/^/gm, "> ")}`
    : body;

  let resendId;
  try {
    resendId = await sendEmail({
      to: thread.from.email,
      subject: feedback ? "Re: Your feedback on Bugdr" : /^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`,
      text,
      replyTo: threadAddress(id),
      headers: inReplyTo && { "In-Reply-To": inReplyTo, References: inReplyTo },
    });
  } catch (err) {
    console.error(`Inbox reply ${id}: ${err.message}`);
    throw new HttpError(502, "EMAIL_FAILED", "The email could not be sent");
  }
  await pool.query("INSERT INTO inbox_entries (thread_id, direction, body, resend_id) VALUES ($1, 'out', $2, $3)", [
    id,
    body,
    resendId,
  ]);
  await pool.query("UPDATE inbox_threads SET status = 'done', last_at = now() WHERE id = $1", [id]);
  return getThread(id);
}
