"use client";

import { useEffect, useState } from "react";
import { MOCK_ME } from "@/lib/mock/dashboard";
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

function newComment(content: string): ProblemComment {
  return {
    id: crypto.randomUUID(),
    author: { username: MOCK_ME.username, displayName: MOCK_ME.displayName, goalRole: MOCK_ME.goalRole },
    content,
    createdAt: new Date().toISOString(),
    helpfulCount: 0,
    markedHelpful: false,
    replies: [],
  };
}

// ponytail: posts, replies and "helpful" stay in component state; slice O2 (+ D30) saves them.
export function Discussion({ initial }: { initial: ProblemComment[] }) {
  const [comments, setComments] = useState(initial);
  const [sort, setSort] = useState<Sort>("helpful");
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
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

  function post(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setComments((list) => [newComment(content), ...list]);
    setDraft("");
    setSort("newest");
  }

  function postReply(parentId: string, content: string) {
    update(parentId, (c) => ({ ...c, replies: [...c.replies, newComment(content)] }));
    setReplyTo(null);
  }

  const toggleHelpful = (id: string) =>
    update(id, (c) => ({
      ...c,
      markedHelpful: !c.markedHelpful,
      helpfulCount: c.helpfulCount + (c.markedHelpful ? -1 : 1),
    }));

  function renderComment(c: ProblemComment, isReply: boolean) {
    const own = c.author.username === MOCK_ME.username;
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
                onClick={() => toggleHelpful(c.id)}
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
        <select
          aria-label="Sort comments"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="bg-transparent text-sm text-muted focus:text-text focus:outline-none"
        >
          {Object.entries(SORTS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
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
            disabled={!draft.trim()}
            className="rounded bg-action px-4 py-2.5 text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-50"
          >
            Post comment
          </button>
        </div>
      </form>

      {sorted.length > 0 ? (
        <ul className="mt-4">{sorted.map((c) => renderComment(c, false))}</ul>
      ) : (
        <p className="mt-6 text-sm text-muted">No comments yet. Be the first to share your approach.</p>
      )}
    </section>
  );
}

function ReplyForm({ to, onPost, onCancel }: { to: string; onPost: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onPost(text.trim());
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
      <div className="mt-2 flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-3 py-2 text-sm text-muted hover:text-text">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!text.trim()}
          className="rounded bg-action px-4 py-2 text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-50"
        >
          Post reply
        </button>
      </div>
    </form>
  );
}
