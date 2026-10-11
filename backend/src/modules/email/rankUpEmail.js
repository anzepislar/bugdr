import { config } from "../../config.js";
import { pool } from "../../db.js";
import { getLevels, levelFor } from "../levels/levels.js";
import { getStats } from "../users/users.routes.js";
import { sendEmail } from "./email.service.js";
import { rankCardPng, rankColor } from "./rankCard.js";

const FONT = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const CARD_ID = "rank-card";

/**
 * After a solve's commit: when its points crossed a level threshold, emails the rank up card - inline (cid) and as
 * an attachment to save. Run it without awaiting; it throws on failure, the caller logs.
 */
export async function sendRankUpEmail(userId, pointsEarned) {
  const [stats, levels] = await Promise.all([getStats(userId), getLevels()]);
  const previousRank = levelFor(stats.totalPoints - pointsEarned, levels).level.name;
  const newRank = stats.level.name;
  if (previousRank === newRank) return;

  const { rows } = await pool.query("SELECT email, username FROM users WHERE id = $1", [userId]);
  const { email, username } = rows[0];
  const data = {
    newRank,
    previousRank,
    problemsSolved: stats.problemsSolved,
    totalPoints: stats.totalPoints,
    currentStreak: stats.currentStreak,
    username,
  };
  const png = await rankCardPng(data);
  await sendEmail({
    to: email,
    subject: `You just reached ${newRank} on bug.dr 🐛`,
    replyTo: "hello@mail.bugdr.app",
    text:
      `RANKED UP: ${previousRank} -> ${newRank}\n\n` +
      `${data.problemsSolved} problems · ${data.totalPoints.toLocaleString("en-US")} pts · ${data.currentStreak}d streak\n\n` +
      `Your rank card is attached - share it on Instagram, Twitter or LinkedIn.\n\nKeep debugging: ${config.appUrl}\n\nbug.dr`,
    html: rankUpHtml(data),
    attachments: [
      { filename: `bugdr-${newRank.toLowerCase()}-rank.png`, content: png.toString("base64"), content_id: CARD_ID },
    ],
  });
}

/** Level names come from level_thresholds and usernames are [A-Za-z0-9_-], so nothing here needs escaping. */
function rankUpHtml({ newRank, previousRank, problemsSolved, totalPoints, currentStreak }) {
  const accent = rankColor(newRank);
  const stat = (label, value, last) => `
                  <td style="padding:20px;text-align:center;${last ? "" : "border-right:1px solid #383C43;"}">
                    <p style="margin:0 0 4px;color:#ACB2BE;font-size:10px;letter-spacing:2px;">${label}</p>
                    <p style="margin:0;color:#F2F3F5;font-size:24px;font-weight:700;">${value}</p>
                  </td>`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>You ranked up on bug.dr</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;font-family:${FONT};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#151618;border-radius:12px;border:1px solid #383C43;overflow:hidden;">
  <tr><td style="background:#202226;padding:24px 32px;border-bottom:1px solid #383C43;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="color:#F2F3F5;font-size:20px;font-weight:700;">bug.dr</td>
      <td align="right" style="color:#ACB2BE;font-size:12px;">bugdr.app</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:48px 32px 32px;text-align:center;">
    <p style="margin:0 0 8px;color:#ACB2BE;font-size:11px;letter-spacing:4px;">RANKED UP</p>
    <h1 style="margin:0 0 8px;color:${accent};font-size:48px;font-weight:700;">${newRank}</h1>
    <p style="margin:0;color:#ACB2BE;font-size:14px;">${previousRank} → ${newRank}</p>
  </td></tr>
  <tr><td style="padding:0 32px 32px;">
    <img src="cid:${CARD_ID}" alt="Your ${newRank} rank card" width="536" style="width:100%;max-width:536px;height:auto;border-radius:8px;display:block;">
  </td></tr>
  <tr><td style="padding:0 32px 32px;text-align:center;">
    <p style="margin:0 0 8px;color:#ACB2BE;font-size:13px;">Your rank card is attached to this email.</p>
    <p style="margin:0;color:#ACB2BE;font-size:12px;">Save it and share on Instagram, Twitter or LinkedIn.</p>
  </td></tr>
  <tr><td style="padding:0 32px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #383C43;border-radius:8px;"><tr>${stat("PROBLEMS", problemsSolved)}${stat("POINTS", totalPoints.toLocaleString("en-US"))}${stat("STREAK", `${currentStreak}d`, true)}
    </tr></table>
  </td></tr>
  <tr><td style="padding:0 32px 40px;text-align:center;">
    <a href="${config.appUrl}" style="display:inline-block;background:#8BACFF;color:#151618;font-size:14px;font-weight:700;padding:14px 32px;border-radius:6px;text-decoration:none;">Keep debugging →</a>
  </td></tr>
  <tr><td style="background:#202226;padding:20px 32px;border-top:1px solid #383C43;text-align:center;">
    <p style="margin:0 0 4px;color:#ACB2BE;font-size:12px;">Built by engineers, for engineers.</p>
    <p style="margin:0;color:#ACB2BE;font-size:11px;">bug.dr · <a href="mailto:hello@mail.bugdr.app?subject=Unsubscribe" style="color:#ACB2BE;">Unsubscribe</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
