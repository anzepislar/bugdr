/** Shared by POST /feedback and the admin inbox (the in-app "Help & feedback" form). */
export const FEEDBACK_TYPES = ["bug", "idea", "problem", "other"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_TYPE_LABEL: Record<FeedbackType, string> = {
  bug: "Bug",
  idea: "Idea",
  problem: "Problem with a problem",
  other: "Other",
};

export const FEEDBACK_MAX_LENGTH = 2000;

export type InboxKind = "email" | "feedback";
export type InboxStatus = "new" | "done";

/** One message in a thread: what came in (email or form) or a reply sent from the admin inbox. */
export interface InboxEntry {
  id: string;
  direction: "in" | "out";
  body: string;
  at: string;
}

/** GET /admin/inbox: an email to hello@mail.bugdr.app or a feedback message, with its replies and follow-ups. */
export interface InboxThread {
  id: string;
  kind: InboxKind;
  status: InboxStatus;
  /** Email subject; for feedback the type label. */
  subject: string;
  /** Feedback only. */
  feedbackType: FeedbackType | null;
  /** Feedback only: the page the form was sent from. */
  page: string | null;
  /** Email: the address it was sent to (any address @mail.bugdr.app arrives). */
  to: string | null;
  from: { name: string | null; email: string; userId: string | null; username: string | null };
  entries: InboxEntry[];
  lastAt: string;
}
