import { config } from "../../config.js";

// D68: the one way out for email - Resend's HTTP API with plain fetch (no SDK), like the AI calls.

/** "Bugdr <hello@mail.bugdr.app>" → "hello@mail.bugdr.app". */
export const addressOf = (from) => (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();

async function resend(method, path, body) {
  const res = await fetch(`${config.resendApiUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${config.resendApiKey}`, ...(body && { "Content-Type": "application/json" }) },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${method} ${path}: ${res.status} ${json.message ?? ""}`.trim());
  return json;
}

/**
 * Sends a plain-text email from EMAIL_FROM. Returns the Resend id, or null when no key is set outside production
 * (the email is printed instead). Throws when Resend refuses it.
 */
export async function sendEmail({ to, subject, text, replyTo, headers }) {
  if (!config.resendApiKey) {
    if (config.production) throw new Error("RESEND_API_KEY is not set");
    console.log(`[email not sent: no RESEND_API_KEY] to=${to} subject=${subject}\n${text}`);
    return null;
  }
  const { id } = await resend("POST", "/emails", {
    from: config.emailFrom,
    to: [to],
    subject,
    text,
    ...(replyTo && { reply_to: replyTo }),
    ...(headers && { headers }),
  });
  return id;
}

/** Newest received emails (metadata only, no body). */
export const listReceived = async (limit = 100) => (await resend("GET", `/emails/receiving?limit=${limit}`)).data ?? [];

/** One received email with text, html and all headers. */
export const getReceived = (id) => resend("GET", `/emails/receiving/${encodeURIComponent(id)}`);
