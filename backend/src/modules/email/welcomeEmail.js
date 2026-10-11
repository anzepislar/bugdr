import { config } from "../../config.js";

// Welcome email after signup. Table layout + inline styles: email clients ignore <style> and flexbox.

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const FEATURES = [
  "Real production bugs from real codebases",
  "An AI assistant that measures how efficiently you use it",
  "A score that actually means something to companies",
];
const INTRO =
  "Welcome to bug.dr. You just joined a platform built for engineers who know that real skill isn't memorizing " +
  "algorithms — it's using AI to solve production problems faster and better than anyone else.";

/** Intern badge from RankBadge.tsx, flat: gray hexagon with ">_". Gmail drops inline SVG, the text below still reads. */
const INTERN_BADGE = `<svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><polygon points="13,4 35,4 46,24 35,44 13,44 2,24" fill="#374151" stroke="#6b7280" stroke-width="2"/><text x="24" y="29" text-anchor="middle" font-size="13" font-family="monospace" font-weight="bold" fill="#9ca3af">&gt;_</text></svg>`;

/** { subject, text, html, replyTo } for sendEmail. Usernames are [A-Za-z0-9_-], so no HTML escaping needed. */
export function welcomeEmail(firstName) {
  const url = config.appUrl;
  const unsubscribe = "mailto:hello@mail.bugdr.app?subject=Unsubscribe";
  const features = FEATURES.map(
    (f) => `<tr>
          <td width="20" valign="top" style="padding:6px 0;"><div style="width:8px;height:8px;margin-top:6px;border-radius:50%;background:#8BACFF;"></div></td>
          <td style="padding:6px 0;color:#F2F3F5;font-size:14px;line-height:1.5;">${f}</td>
        </tr>`,
  ).join("");

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
        <div style="color:#F2F3F5;font-size:22px;font-weight:bold;">Hey ${firstName},</div>
        <p style="margin:12px 0 24px;color:#ACB2BE;font-size:15px;line-height:1.6;">${INTRO}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${features}</table>
        <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:32px auto;width:100%;max-width:280px;">
          <tr><td align="center" style="background:#8BACFF;border-radius:6px;">
            <a href="${url}" style="display:block;padding:14px 0;color:#151618;font-size:16px;font-weight:bold;text-decoration:none;">Start debugging →</a>
          </td></tr>
        </table>
        <div style="border-top:1px solid #383C43;padding-top:24px;text-align:center;">
          <div style="color:#ACB2BE;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Your starting rank</div>
          <div style="margin:12px 0 8px;">${INTERN_BADGE}</div>
          <div style="color:#ACB2BE;font-size:14px;">Intern · 0 pts</div>
          <div style="margin-top:4px;color:#ACB2BE;font-size:12px;">Reach 500 pts to unlock Junior</div>
        </div>
      </td></tr>
    </table>
  </td></tr>
  <tr><td align="center" style="padding:24px 0 8px;border-top:1px solid #383C43;">
    <div style="color:#ACB2BE;font-size:13px;">Built by engineers, for engineers.</div>
    <div style="margin-top:6px;color:#ACB2BE;font-size:12px;">bug.dr</div>
    <a href="${unsubscribe}" style="display:inline-block;margin-top:6px;color:#ACB2BE;font-size:11px;">Unsubscribe</a>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  const text =
    `Hey ${firstName},\n\n${INTRO}\n\n${FEATURES.map((f) => `- ${f}`).join("\n")}\n\n` +
    `Start debugging: ${url}\n\nYour starting rank: Intern · 0 pts. Reach 500 pts to unlock Junior.\n\n` +
    `Built by engineers, for engineers.\nbug.dr`;

  return { subject: "Hello from bug.dr 👋", text, html, replyTo: "hello@mail.bugdr.app" };
}
