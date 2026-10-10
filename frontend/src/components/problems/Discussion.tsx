"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Select } from "@/components/Select";
import { api } from "@/lib/api";
import { CATEGORIES, type ProblemComment } from "@/lib/types/problem";

// O2: empty or too long content is rejected with 400.
const MAX_LENGTH = 2000;

const SORTS = { helpful: "Most helpful", newest: "Newest" } as const;
type Sort = keyof typeof SORTS;

function timeAgo(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

const roleName = (slug: ProblemComment["author"]["goalRole"]) => CATEGORIES.find((c) => c.slug === slug)?.name;

const FAILED = "That didn't work. Try again.";

// O2: every change is saved through the API; the list is all comments of the problem, sorted here.
export function Discussion({ slug, initial }: { slug: string; initial: ProblemComment[] }) {
  const router = useRouter();
  const [comments, setComments] = useState(initial);
  const [sort, setSort] = useState<Sort>("helpful");
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ProblemComment | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const sorted = [...comments].sort((a, b) =>
    sort === "helpful"
      ? b.helpfulCount - a.helpfulCount || Date.parse(b.createdAt) - Date.parse(a.createdAt)
      : Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );

  // Applies `change` to the comment with this id, top level or reply.
  function update(id: string, change: (c: ProblemComment) => ProblemComment) {
    const walk = (list: ProblemComment[]): ProblemComment[] =>
      list.map((c) => (c.id === id ? change(c) : { ...c, replies: walk(c.replies) }));
    setComments(walk);
  }

  const send = (content: string, parentId?: string) =>
    api<{ comment: ProblemComment }>(`/problems/${encodeURIComponent(slug)}/comments`, {
      method: "POST",
      body: JSON.stringify({ content, parentId }),
    }).then((r) => {
      router.refresh(); // the comment count on the Discussion tab
      return r.comment;
    });

  async function post(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || posting) return;
    setPosting(true);
    setError("");
    try {
      const comment = await send(content);
      setComments((list) => [comment, ...list]);
      setDraft("");
      setSort("newest");
    } catch {
      setError(FAILED);
    } finally {
      setPosting(false);
    }
  }

  // Throws on failure, so the reply form keeps its text and shows the error.
  async function postReply(parentId: string, content: string) {
    const reply = await send(content, parentId);
    update(parentId, (c) => ({ ...c, replies: [...c.replies, reply] }));
    setReplyTo(null);
  }

  // Shown at once; a failed save flips it back.
  async function toggleHelpful(c: ProblemComment) {
    const flip = (x: ProblemComment) => ({
      ...x,
      markedHelpful: !x.markedHelpful,
      helpfulCount: x.helpfulCount + (x.markedHelpful ? -1 : 1),
    });
    update(c.id, flip);
    setError("");
    try {
      await api(`/comments/${c.id}/helpful`, { method: c.markedHelpful ? "DELETE" : "PUT" });
    } catch {
      update(c.id, flip);
      setError(FAILED);
    }
  }

  async function remove() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await api(`/comments/${deleting.id}`, { method: "DELETE" });
      const drop = (list: ProblemComment[]): ProblemComment[] =>
        list.filter((c) => c.id !== deleting.id).map((c) => ({ ...c, replies: drop(c.replies) }));
      setComments(drop);
      setDeleting(null);
      router.refresh();
    } catch {
      setDeleteError(FAILED);
    } finally {
      setDeleteBusy(false);
    }
  }

  function renderComment(c: ProblemComment, isReply: boolean) {
    const own = c.own;
    const role = roleName(c.author.goalRole);
    return (
      <li key={c.id} className={isReply ? "mt-5" : "border-b border-border py-5"}>
        <article className="flex gap-4">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-sm font-semibold text-action"
          >
            {c.author.displayName[0]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text">{c.author.displayName}</p>
            {/* Server and browser clocks can straddle a minute boundary. */}
            <p className="mt-1 text-xs text-muted" suppressHydrationWarning>
              {[role, timeAgo(c.createdAt, now)].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-3 max-w-[70ch] whitespace-pre-line break-words text-sm leading-relaxed text-text">
              {c.content}
            </p>
            <div className="mt-3 flex gap-4 text-xs">
              <button
                type="button"
                onClick={() => toggleHelpful(c)}
                disabled={own}
                aria-pressed={c.markedHelpful}
                title={own ? "You can't mark your own comment as helpful" : undefined}
                className={`text-action disabled:cursor-default disabled:opacity-60 ${
                  c.markedHelpful ? "font-semibold" : "hover:underline"
                }`}
              >
                {c.helpfulCount} helpful
              </button>
              {isReply ? null : (
                <button
                  type="button"
                  onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}
                  aria-expanded={replyTo === c.id}
                  className="text-action hover:underline"
                >
                  Reply
                </button>
              )}
              {own ? (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError("");
                    setDeleting(c);
                  }}
                  className="text-muted hover:text-text hover:underline"
                >
                  Delete
                </button>
              ) : null}
            </div>
            {c.replies.length > 0 || replyTo === c.id ? (
              <ul>
                {c.replies.map((r) => renderComment(r, true))}
                {replyTo === c.id ? (
                  <li className="mt-5">
                    <ReplyForm
                      to={c.author.displayName}
                      onPost={(text) => postReply(c.id, text)}
                      onCancel={() => setReplyTo(null)}
                    />
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        </article>
      </li>
    );
  }

  return (
    <section aria-labelledby="discussion-heading">
      <div className="flex items-center justify-between gap-4">
        <h2 id="discussion-heading" className="text-xl font-semibold text-text">
          Discussion
        </h2>
        <Select
          aria-label="Sort comments"
          value={sort}
          onChange={setSort}
          options={(Object.keys(SORTS) as Sort[]).map((value) => ({ value, label: SORTS[value] }))}
          className="rounded text-sm text-muted hover:text-text focus:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
        />
      </div>

      <form onSubmit={post} className="mt-5 rounded border border-border bg-surface p-5 focus-within:border-action">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_LENGTH}
          rows={3}
          placeholder="Share your approach or ask a question..."
          aria-label="Your comment"
          className="w-full resize-y bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
        />
        <div className="mt-3 flex items-center justify-end gap-4">
          {draft.length > MAX_LENGTH * 0.9 ? (
            <span className="text-xs text-muted">
              {draft.length} / {MAX_LENGTH}
            </span>
          ) : null}
          <button
            type="submit"
            disabled={!draft.trim() || posting}
            className="rounded bg-action px-4 py-2.5 text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-50"
          >
            {posting ? "Posting…" : "Post comment"}
          </button>
        </div>
      </form>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-failed">
          {error}
        </p>
      ) : null}

      {sorted.length > 0 ? (
        <ul className="mt-4">{sorted.map((c) => renderComment(c, false))}</ul>
      ) : (
        <p className="mt-6 text-sm text-muted">No comments yet. Be the first to share your approach.</p>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this comment?"
        message={
          deleting?.replies.length
            ? "Your comment and its replies will be removed for everyone. This can't be undone."
            : "Your comment will be removed for everyone. This can't be undone."
        }
        confirmLabel="Delete"
        busy={deleteBusy}
        error={deleteError}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}

function ReplyForm({ to, onPost, onCancel }: { to: string; onPost: (text: string) => Promise<void>; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim() || busy) return;
        setBusy(true);
        setFailed(false);
        try {
          await onPost(text.trim());
        } catch {
          setFailed(true);
          setBusy(false);
        }
      }}
      className="rounded border border-border bg-surface p-4 focus-within:border-action"
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_LENGTH}
        rows={2}
        autoFocus
        placeholder={`Reply to ${to}...`}
        aria-label={`Reply to ${to}`}
        className="w-full resize-y bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-end gap-3">
        {failed ? (
          <span role="alert" className="mr-auto text-xs text-failed">
            {FAILED}
          </span>
        ) : null}
        <button type="button" onClick={onCancel} className="px-3 py-2 text-sm text-muted hover:text-text">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!text.trim() || busy}
          className="rounded bg-action px-4 py-2 text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Posting…" : "Post reply"}
        </button>
      </div>
    </form>
  );
}
