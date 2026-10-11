import { config } from "../../config.js";
import { pool } from "../../db.js";
import { PLANS } from "../plans/plans.js";
import { sendEmail } from "./email.service.js";

// Career path left alone: no start, try, prompt or solve on the path for INACTIVE_DAYS → one email, then nothing
// until the user is active on the path again. Get a job is the last stage, never reminded (like "stuck" in K3).
// X2: only users whose plan has career paths (a downgraded user cannot go back to the path).
export const INACTIVE_DAYS = 30;

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const STAGE_NAMES = { easy: "Easy", medium: "Medium", hard: "Hard" };

/** Claims the due rows (marks them sent) and returns them; claiming first means two runs never email twice. */
async function claimDue() {
  const { rows } = await pool.query(
    `WITH activity AS (
       SELECT cp.user_id, cp.role, greatest(cp.started_at,
         (SELECT max(greatest(a.started_at, a.solved_at)) FROM user_problem_attempts a
          WHERE a.user_id = cp.user_id AND a.career_path = cp.role),
         (SELECT max(t.started_at) FROM attempt_tries t JOIN user_problem_attempts a ON a.id = t.attempt_id
          WHERE a.user_id = cp.user_id AND a.career_path = cp.role),
         (SELECT max(pe.sent_at) FROM prompt_events pe JOIN solve_sessions s ON s.id = pe.session_id
          JOIN user_problem_attempts a ON a.id = s.attempt_id
          WHERE a.user_id = cp.user_id AND a.career_path = cp.role)) AS last_active
       FROM career_path_progress cp
       WHERE cp.current_stage <> 'get_a_job'
     )
     UPDATE career_path_progress cp SET reminder_sent_at = now()
     FROM activity act, users u, problem_categories c
     WHERE cp.user_id = act.user_id AND cp.role = act.role AND u.id = cp.user_id AND c.slug = cp.role
       AND act.last_active < now() - make_interval(days => $1)
       AND (cp.reminder_sent_at IS NULL OR cp.reminder_sent_at < act.last_active)
       AND u.is_banned IS NOT TRUE
       AND u.plan = ANY($2)
     RETURNING cp.user_id, cp.role, cp.current_stage, u.email, u.username, c.name AS path_name`,
    [INACTIVE_DAYS, Object.keys(PLANS).filter((p) => PLANS[p].careerPaths)],
  );
  return rows;
}

/** { subject, text, html, replyTo } for sendEmail. Usernames are [A-Za-z0-9_-] and path names are ours: no escaping. */
export function careerPathReminderEmail({ username, pathName, stage }) {
  const url = `${config.appUrl}/career-paths`;
  const line = `Your ${pathName} path is waiting at the ${STAGE_NAMES[stage]} stage. It's been ${INACTIVE_DAYS} days since you last worked on it - your next problem is ready when you are.`;
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"></head>
<body style="margin:0;padding:0;background:#0a0a0a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;font-family:${FONT};">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
  <tr><td align="center" style="padding:16px 0 24px;border-bottom:1px solid #383C43;color:#F2F3F5;font-size:24px;font-weight:bold;">bug.dr</td></tr>
  <tr><td style="padding:24px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#151618;border:1px solid #383C43;border-radius:8px;">
      <tr><td style="padding:32px;">
        <div style="color:#F2F3F5;font-size:22px;font-weight:bold;">Hey ${username},</div>
        <p style="margin:12px 0 24px;color:#ACB2BE;font-size:15px;line-height:1.6;">${line}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:8px auto;width:100%;max-width:280px;">
          <tr><td align="center" style="background:#8BACFF;border-radius:6px;">
            <a href="${url}" style="display:block;padding:14px 0;color:#151618;font-size:16px;font-weight:bold;text-decoration:none;">Continue your path →</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>
  <tr><td align="center" style="padding:24px 0 8px;border-top:1px solid #383C43;">
    <div style="color:#ACB2BE;font-size:12px;">bug.dr</div>
    <a href="mailto:hello@mail.bugdr.app?subject=Unsubscribe" style="display:inline-block;margin-top:6px;color:#ACB2BE;font-size:11px;">Unsubscribe</a>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
  return {
    subject: `Your ${pathName} path is waiting`,
    text: `Hey ${username},\n\n${line}\n\nContinue your path: ${url}\n\nbug.dr`,
    html,
    replyTo: "hello@mail.bugdr.app",
  };
}

/** Emails every due path. A failed send un-claims its row so the next run tries again. Returns the number sent. */
export async function sendCareerPathReminders() {
  let sent = 0;
  for (const r of await claimDue()) {
    try {
      await sendEmail({ to: r.email, ...careerPathReminderEmail({ username: r.username, pathName: r.path_name, stage: r.current_stage }) });
      sent++;
    } catch (err) {
      console.error(`Career path reminder to ${r.user_id}: ${err.message}`);
      await pool.query("UPDATE career_path_progress SET reminder_sent_at = NULL WHERE user_id = $1 AND role = $2", [r.user_id, r.role]);
    }
  }
  return sent;
}
