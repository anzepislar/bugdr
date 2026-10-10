"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ErrorMessage, FieldLabel, inputClass, primaryButton, secondaryButton, Spinner } from "@/components/admin/problems/shared";
import { Select } from "@/components/Select";
import { api, ApiError } from "@/lib/api";
import { FEEDBACK_MAX_LENGTH, FEEDBACK_TYPE_LABEL, FEEDBACK_TYPES, type FeedbackType } from "@/lib/types/inbox";

/** "Help & feedback" in the sidebar: POST /feedback, answered from /admin/inbox by email to the account address. */
export function FeedbackDialog({ open, email, onClose }: { open: boolean; email: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const [type, setType] = useState<FeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => {
    if (status === "sending") return;
    // A sent form starts empty next time; an unsent draft is kept.
    if (status === "sent") {
      setMessage("");
      setType("bug");
      setStatus("idle");
    }
    setError("");
    onClose();
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    try {
      await api("/feedback", {
        method: "POST",
        body: JSON.stringify({ type, message: message.trim(), page: pathname + window.location.search }),
      });
      setStatus("sent");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? "You have sent several messages in the last hour. Try again later."
          : "Could not send your message. Try again.",
      );
      setStatus("idle");
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="feedback-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => e.target === e.currentTarget && close()}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-md border border-border bg-surface p-6 text-text backdrop:bg-canvas/70"
    >
      <h2 id="feedback-title" className="text-lg font-semibold">
        Help &amp; feedback
      </h2>

      {status === "sent" ? (
        <>
          <p className="mt-3 text-sm text-muted">
            Thanks, we read every message. If it needs an answer, we will reply to{" "}
            <span className="text-text">{email}</span>.
          </p>
          <div className="mt-6 flex justify-end">
            <button type="button" onClick={close} className={primaryButton}>
              Done
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submit}>
          <p className="mt-2 text-sm text-muted">
            Found a bug, have an idea or stuck on something? Tell us. We reply to {email}.
          </p>
          <div className="mt-5">
            <FieldLabel htmlFor="feedback-type">Type</FieldLabel>
            <Select
              id="feedback-type"
              value={type}
              onChange={setType}
              options={FEEDBACK_TYPES.map((t) => ({ value: t, label: FEEDBACK_TYPE_LABEL[t] }))}
              className={`${inputClass} py-2.5`}
            />
          </div>
          <div className="mt-5">
            <FieldLabel htmlFor="feedback-message">Message</FieldLabel>
            <textarea
              id="feedback-message"
              required
              rows={6}
              maxLength={FEEDBACK_MAX_LENGTH}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                type === "bug" ? "What happened, and what did you expect to happen?" : "Write your message..."
              }
              className={`${inputClass} resize-y`}
            />
            <p className="mt-1.5 text-right text-xs text-muted">
              {message.length} / {FEEDBACK_MAX_LENGTH}
            </p>
          </div>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={close} disabled={status === "sending"} className={secondaryButton}>
              Cancel
            </button>
            <button type="submit" disabled={status === "sending" || !message.trim()} className={primaryButton}>
              {status === "sending" && <Spinner />}
              Send
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
