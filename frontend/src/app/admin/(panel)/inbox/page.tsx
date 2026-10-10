"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { INBOX_CHANGED } from "@/components/admin/AdminShell";
import { ErrorMessage, inputClass, primaryButton, secondaryButton, Spinner } from "@/components/admin/problems/shared";
import { Icon } from "@/components/Icon";
import { Select } from "@/components/Select";
import { api } from "@/lib/api";
import type { InboxKind, InboxStatus, InboxThread } from "@/lib/types/inbox";

const TABS: Record<InboxKind, string> = { email: "Email", feedback: "Feedback" };
const FILTERS = { new: "New", done: "Done", all: "All" } as const;
type Filter = keyof typeof FILTERS;

/** "Oct 10, 14:05" in the admin's own time zone. */
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// Emails to any address @mail.bugdr.app (pulled from Resend by the backend) and "Help & feedback" messages.
// Replies go out through Resend from EMAIL_FROM; a reply marks the thread done, a follow-up makes it new again.
export default function AdminInboxPage() {
  const [threads, setThreads] = useState<InboxThread[] | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<InboxKind>("email");
  const [filter, setFilter] = useState<Filter>("new");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The first load shows "Loading messages…"; Refresh shows a spinner on the button.
  const load = () => {
    api<{ threads: InboxThread[] }>("/admin/inbox")
      .then((r) => {
        setThreads(r.threads);
        setError(false);
        window.dispatchEvent(new Event(INBOX_CHANGED)); // a sync may have brought new mail
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const update = (thread: InboxThread) => {
    setThreads((ts) => ts?.map((t) => (t.id === thread.id ? thread : t)) ?? null);
    window.dispatchEvent(new Event(INBOX_CHANGED));
  };

  const inTab = threads?.filter((t) => t.kind === tab) ?? [];
  const shown = inTab.filter((t) => filter === "all" || t.status === filter);
  const selected = threads?.find((t) => t.id === selectedId) ?? null;
  const newCount = (kind: InboxKind) => threads?.filter((t) => t.kind === kind && t.status === "new").length ?? 0;

  return (
    <div className="w-full px-6 py-8 wide:mx-auto wide:max-w-[1200px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold text-text">Inbox</h1>
          <p className="mt-2 text-muted">Emails to hello@mail.bugdr.app and messages from the Help &amp; feedback form.</p>
        </div>
        <button type="button" onClick={() => {
            setLoading(true);
            load();
          }}
          disabled={loading} className={`${secondaryButton} py-2.5`}>
          {loading ? <Spinner /> : null}
          Refresh
        </button>
      </div>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-4 border-b border-border">
        <div role="tablist" aria-label="Message source" className="flex gap-8 overflow-x-auto">
          {(Object.keys(TABS) as InboxKind[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={t === tab}
              onClick={() => {
                setTab(t);
                setSelectedId(null);
              }}
              className={`shrink-0 border-b-2 pb-3 text-sm ${
                t === tab ? "border-action font-semibold text-action" : "border-transparent text-muted hover:text-text"
              }`}
            >
              {TABS[t]}
              {newCount(t) > 0 && <span className="ml-2 rounded bg-surface px-1.5 text-xs font-medium text-action">{newCount(t)}</span>}
            </button>
          ))}
        </div>
        <Select
          aria-label="Show"
          value={filter}
          onChange={setFilter}
          options={(Object.keys(FILTERS) as Filter[]).map((value) => ({ value, label: `Show: ${FILTERS[value]}` }))}
          className="mb-2 rounded text-sm text-muted hover:text-text focus:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
        />
      </div>

      {error ? (
        <p className="mt-8 text-sm text-failed">Could not load the inbox. Reload the page.</p>
      ) : !threads ? (
        <p className="mt-8 text-sm text-muted">Loading messages…</p>
      ) : (
        <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:items-start">
          {/* On phones the list and the open message take turns. */}
          <ul
            aria-label={`${TABS[tab]} messages`}
            className={`flex-col gap-2 lg:flex lg:w-80 lg:shrink-0 xl:w-96 ${selected ? "hidden" : "flex"}`}
          >
            {shown.length === 0 ? (
              <li className="rounded border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
                {filter === "new" ? "Nothing new. You are all caught up." : `No ${FILTERS[filter].toLowerCase()} messages.`}
              </li>
            ) : (
              shown.map((t) => <ThreadRow key={t.id} thread={t} active={t.id === selectedId} onOpen={() => setSelectedId(t.id)} />)
            )}
          </ul>

          <div className={`min-w-0 flex-1 ${selected ? "" : "hidden lg:block"}`}>
            {selected ? (
              <ThreadView key={selected.id} thread={selected} onBack={() => setSelectedId(null)} onChange={update} />
            ) : (
              <p className="rounded border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
                Open a message to read it and reply.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ThreadRow({ thread, active, onOpen }: { thread: InboxThread; active: boolean; onOpen: () => void }) {
  const last = thread.entries[thread.entries.length - 1];
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
        className={`block w-full min-w-0 rounded border px-4 py-3 text-left ${
          active ? "border-action bg-surface" : "border-border bg-surface hover:border-muted"
        }`}
      >
        <span className="flex items-center gap-2">
          {thread.status === "new" && <span aria-label="New" className="h-2 w-2 shrink-0 rounded-full bg-action" />}
          <span className={`min-w-0 flex-1 truncate text-sm ${thread.status === "new" ? "font-semibold text-text" : "text-text"}`}>
            {thread.from.name ?? thread.from.username ?? thread.from.email}
          </span>
          <span className="shrink-0 text-xs text-muted">{when(thread.lastAt)}</span>
        </span>
        <span className="mt-1 block truncate text-sm text-text">{thread.subject}</span>
        <span className="mt-1 block truncate text-xs text-muted">
          {last?.direction === "out" ? "You: " : ""}
          {last?.body}
        </span>
      </button>
    </li>
  );
}

function ThreadView({
  thread,
  onBack,
  onChange,
}: {
  thread: InboxThread;
  onBack: () => void;
  onChange: (thread: InboxThread) => void;
}) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<"reply" | "status" | null>(null);
  const [error, setError] = useState("");

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy("reply");
    setError("");
    try {
      const r = await api<{ thread: InboxThread }>(`/admin/inbox/${thread.id}/reply`, {
        method: "POST",
        body: JSON.stringify({ body: reply.trim() }),
      });
      setReply("");
      onChange(r.thread);
    } catch {
      setError("Could not send the reply. Check RESEND_API_KEY and EMAIL_FROM in backend/.env, then try again.");
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(status: InboxStatus) {
    setBusy("status");
    setError("");
    try {
      const r = await api<{ thread: InboxThread }>(`/admin/inbox/${thread.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      onChange(r.thread);
    } catch {
      setError("Could not update the message. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="rounded border border-border bg-surface p-5 sm:p-6">
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm text-action hover:underline lg:hidden">
        <Icon name="arrowLeft" className="h-3.5 w-3.5" />
        Back to inbox
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="min-w-0 break-words text-xl font-semibold text-text">{thread.subject}</h2>
        <button
          type="button"
          onClick={() => setStatus(thread.status === "new" ? "done" : "new")}
          disabled={busy !== null}
          className={secondaryButton}
        >
          {busy === "status" && <Spinner />}
          {thread.status === "new" ? "Mark as done" : "Move to new"}
        </button>
      </div>

      <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
        <dt className="text-muted">From</dt>
        <dd className="min-w-0 break-words text-text">
          {thread.from.name ? `${thread.from.name} <${thread.from.email}>` : thread.from.email}
          {thread.from.userId && (
            <Link href={`/admin/users/${thread.from.userId}`} className="ml-2 text-action hover:underline">
              @{thread.from.username}
            </Link>
          )}
        </dd>
        {thread.to && (
          <>
            <dt className="text-muted">To</dt>
            <dd className="min-w-0 break-words text-text">{thread.to}</dd>
          </>
        )}
        {thread.page && (
          <>
            <dt className="text-muted">Sent from</dt>
            <dd className="min-w-0 break-all font-mono text-xs leading-5 text-text">{thread.page}</dd>
          </>
        )}
      </dl>

      <ol className="mt-6 flex flex-col gap-4">
        {thread.entries.map((e) => (
          <li
            key={e.id}
            className={`rounded border p-4 ${e.direction === "out" ? "border-action/40 bg-action/5 sm:ml-8" : "border-border bg-canvas sm:mr-8"}`}
          >
            <p className="text-xs text-muted">
              {e.direction === "out" ? "You replied" : (thread.from.name ?? thread.from.email)} · {when(e.at)}
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-text">{e.body}</p>
          </li>
        ))}
      </ol>

      <form onSubmit={send} className="mt-6">
        <label htmlFor="inbox-reply" className="block text-sm font-medium text-text">
          Reply to {thread.from.email}
        </label>
        <textarea
          id="inbox-reply"
          rows={5}
          required
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          className={`${inputClass} mt-1.5 resize-y`}
        />
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">Sent by email from hello@mail.bugdr.app. Sending marks the message done.</p>
          <button type="submit" disabled={busy !== null || !reply.trim()} className={`${primaryButton} w-full sm:w-fit`}>
            {busy === "reply" && <Spinner />}
            Send reply
          </button>
        </div>
      </form>
    </article>
  );
}
