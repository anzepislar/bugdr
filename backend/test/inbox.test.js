import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { hashPassword } from "../src/modules/auth/auth.service.js";
import { newPart } from "../src/modules/inbox/inbox.service.js";

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/v1`;
let admin, ana;
const call = (method, path, cookie, body) =>
  fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }) },
    body: body && JSON.stringify(body),
  });

// A fake Resend: records sent emails, serves `received` (newest first, like the API) and their full versions.
let sent = [];
let received = [];
let failSend = false;
let sentIds = 0; // unique across tests, like Resend's ids
const resend = createServer((req, res) => {
  let data = "";
  req.on("data", (c) => (data += c));
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST" && req.url === "/emails") {
      if (failSend) {
        res.statusCode = 422;
        return res.end(JSON.stringify({ message: "domain not verified" }));
      }
      sent.push(JSON.parse(data));
      return res.end(JSON.stringify({ id: `sent-${++sentIds}` }));
    }
    if (req.url.startsWith("/emails/receiving?")) {
      return res.end(JSON.stringify({ data: received.map(({ id, from, to, subject, created_at }) => ({ id, from, to, subject, created_at })) }));
    }
    const email = received.find((e) => req.url === `/emails/receiving/${e.id}`);
    res.statusCode = email ? 200 : 404;
    res.end(JSON.stringify(email ?? { message: "not found" }));
  });
}).listen(0);

let n = 0;
function receive(email) {
  n += 1;
  received.unshift({
    id: `rcv-${n}`,
    to: ["hello@mail.bugdr.app"],
    subject: "Question",
    text: null,
    html: null,
    message_id: `<msg-${n}@mail.example.com>`,
    created_at: new Date(Date.now() + n).toISOString(), // strictly increasing
    headers: {},
    ...email,
  });
}

before(async () => {
  await migrate();
  await pool.query("TRUNCATE users, inbox_threads CASCADE");
  config.resendApiKey = "re_test";
  config.resendApiUrl = `http://localhost:${resend.address().port}`;
  config.emailFrom = "Bugdr <hello@mail.bugdr.app>";
  const res = await call("POST", "/auth/signup", null, { email: "ana@example.com", username: "ana", password: "password1" });
  ana = res.headers.get("set-cookie").split(";")[0];
  config.adminEmail = "admin@bugdr.app";
  config.adminPasswordHash = await hashPassword("admin password 1");
  const login = await call("POST", "/admin/login", null, { email: "admin@bugdr.app", password: "admin password 1" });
  admin = login.headers.get("set-cookie").split(";")[0];
});
after(async () => {
  server.close();
  resend.close();
  await pool.end();
});

const inbox = async () => (await (await call("GET", "/admin/inbox", admin)).json()).threads;

test("feedback needs an account, a known type and a message, and is limited to 5 an hour", async () => {
  assert.equal((await call("POST", "/feedback", null, { type: "bug", message: "x" })).status, 401);
  const bad = await call("POST", "/feedback", ana, { type: "rant", message: " " });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys((await bad.json()).error.details).sort(), ["message", "type"]);
  assert.equal((await call("POST", "/feedback", ana, { type: "bug", message: "x".repeat(2001) })).status, 400);

  const ok = await call("POST", "/feedback", ana, { type: "bug", message: "  The timer starts at 2:00:00  ", page: "/problems/x/solve?path=backend" });
  assert.equal(ok.status, 201);
  for (let i = 0; i < 4; i++) await call("POST", "/feedback", ana, { type: "idea", message: `idea ${i}`, page: "https://evil" });
  const limited = await call("POST", "/feedback", ana, { type: "idea", message: "one more" });
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error.code, "RATE_LIMITED");

  await pool.query("DELETE FROM inbox_threads WHERE feedback_type = 'idea'");
});

test("the inbox needs the admin session and shows feedback with its user and page", async () => {
  assert.equal((await call("GET", "/admin/inbox", null)).status, 401);
  assert.equal((await call("GET", "/admin/inbox", ana)).status, 401);
  const [t] = await inbox();
  assert.equal(t.kind, "feedback");
  assert.equal(t.status, "new");
  assert.equal(t.subject, "Bug");
  assert.equal(t.feedbackType, "bug");
  assert.equal(t.page, "/problems/x/solve?path=backend");
  assert.deepEqual(t.from, { name: null, email: "ana@example.com", userId: t.from.userId, username: "ana" });
  assert.ok(t.from.userId);
  assert.equal(t.entries.length, 1);
  assert.equal(t.entries[0].body, "The timer starts at 2:00:00");
  assert.match(t.entries[0].at, /Z$/); // UTC, so the browser shows local time
  assert.deepEqual(await (await call("GET", "/admin/inbox/count", admin)).json(), { new: 1 });
});

test("a reply to feedback is emailed with the original quoted and a reply-to address for the thread", async () => {
  const [t] = await inbox();
  sent = [];
  assert.equal((await call("POST", `/admin/inbox/${t.id}/reply`, admin, { body: " " })).status, 400);
  assert.equal((await call("POST", "/admin/inbox/not-a-uuid/reply", admin, { body: "hi" })).status, 404);

  const res = await call("POST", `/admin/inbox/${t.id}/reply`, admin, { body: "Thanks, fixed in the next release." });
  assert.equal(res.status, 200);
  const { thread } = await res.json();
  assert.equal(thread.status, "done");
  assert.deepEqual(thread.entries.map((e) => e.direction), ["in", "out"]);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ["ana@example.com"]);
  assert.equal(sent[0].from, "Bugdr <hello@mail.bugdr.app>");
  assert.equal(sent[0].subject, "Re: Your feedback on Bugdr");
  assert.equal(sent[0].reply_to, `hello+${t.id}@mail.bugdr.app`);
  assert.match(sent[0].text, /^Thanks, fixed in the next release\.\n\n---\nYour message \(Bug\):\n> The timer starts at 2:00:00$/);
  assert.equal(sent[0].headers, undefined);
  assert.deepEqual(await (await call("GET", "/admin/inbox/count", admin)).json(), { new: 0 });
});

test("a failed send is reported and not recorded", async () => {
  const [t] = await inbox();
  failSend = true;
  const res = await call("POST", `/admin/inbox/${t.id}/reply`, admin, { body: "again" });
  failSend = false;
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error.code, "EMAIL_FAILED");
  assert.equal((await inbox())[0].entries.length, 2);
});

test("status can be set by hand", async () => {
  const [t] = await inbox();
  assert.equal((await call("PUT", `/admin/inbox/${t.id}/status`, admin, { status: "open" })).status, 400);
  const res = await call("PUT", `/admin/inbox/${t.id}/status`, admin, { status: "new" });
  assert.equal((await res.json()).thread.status, "new");
  await call("PUT", `/admin/inbox/${t.id}/status`, admin, { status: "done" });
});

test("received email becomes a thread; our own test mail is skipped; a second sync adds nothing", async () => {
  receive({ from: "hello@mail.bugdr.app", subject: "Bugdr receiving test", text: "test" });
  receive({ from: '"Maja K" <Maja@Example.com>', subject: "Pricing?", text: "Do you have a team plan?\n" });
  receive({ from: "bob@example.com", subject: "", html: "<p>Hi&nbsp;there</p><style>p{}</style><p>Second &amp; last</p>" });

  const threads = await inbox();
  const emails = threads.filter((t) => t.kind === "email");
  assert.equal(emails.length, 2);
  const maja = emails.find((t) => t.from.email === "maja@example.com");
  assert.equal(maja.from.name, "Maja K");
  assert.equal(maja.from.userId, null);
  assert.equal(maja.subject, "Pricing?");
  assert.equal(maja.to, "hello@mail.bugdr.app");
  assert.equal(maja.status, "new");
  assert.equal(maja.entries[0].body, "Do you have a team plan?");
  const bob = emails.find((t) => t.from.email === "bob@example.com");
  assert.equal(bob.subject, "(no subject)");
  assert.equal(bob.entries[0].body, "Hi there\nSecond & last");

  assert.equal((await inbox()).length, threads.length);
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM inbox_entries");
  assert.equal(rows[0].n, 4); // feedback in + out, 2 emails
});

test("a reply to an email threads in mail clients, and the answer comes back to the same thread", async () => {
  const maja = (await inbox()).find((t) => t.from.email === "maja@example.com");
  sent = [];
  assert.equal((await call("POST", `/admin/inbox/${maja.id}/reply`, admin, { body: "Not yet - soon." })).status, 200);
  assert.equal(sent[0].subject, "Re: Pricing?");
  assert.deepEqual(sent[0].headers, { "In-Reply-To": "<msg-2@mail.example.com>", References: "<msg-2@mail.example.com>" });
  assert.equal(sent[0].text, "Not yet - soon.");

  // Her answer goes to hello+<thread>@ and quotes our reply below.
  receive({
    from: "Maja K <maja@example.com>",
    to: [`hello+${maja.id}@mail.bugdr.app`],
    subject: "Re: Pricing?",
    text: "Great, thanks!\n\nOn Sat, Oct 10, 2026 at 20:01 Bugdr <hello+x@mail.bugdr.app>\nwrote:\n> Not yet - soon.\n",
  });
  // Someone else using the thread address does not join it.
  receive({ from: "mallory@example.com", to: [`hello+${maja.id}@mail.bugdr.app`], subject: "Re: Pricing?", text: "hi" });

  const threads = await inbox();
  const thread = threads.find((t) => t.id === maja.id);
  assert.equal(thread.status, "new");
  assert.deepEqual(thread.entries.map((e) => [e.direction, e.body]), [
    ["in", "Do you have a team plan?"],
    ["out", "Not yet - soon."],
    ["in", "Great, thanks!"],
  ]);
  assert.equal(threads[0].id, threads.find((t) => t.from.email === "mallory@example.com").id); // newest first
});

test("newPart keeps the new text of a reply", () => {
  assert.equal(newPart("Yes.\n\nOn Mon, 5 Oct 2026, Bugdr wrote:\n> old"), "Yes.");
  assert.equal(newPart("Yes.\n> quoted\n> more\n"), "Yes.");
  assert.equal(newPart("No quote here"), "No quote here");
  assert.equal(newPart("> all quoted"), "> all quoted"); // nothing new: keep it all
});
