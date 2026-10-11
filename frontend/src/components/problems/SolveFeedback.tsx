"use client";

import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/admin/problems/shared";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { api } from "@/lib/api";

// S8: GET /attempts/:id/feedback. unavailable = solved before feedback existed; locked = not on the user's plan (X2).
interface Feedback {
  status: "pending" | "ready" | "failed" | "unavailable" | "locked";
  content: string | null;
}

// Placeholder under the blur of the locked state; never real feedback.
const LOCKED_SAMPLE =
  "You found the root cause quickly, but your second and third prompts repeated context the AI already had. " +
  "Top solvers describe the failing behaviour once, ask for the likely cause, then verify it in the code before " +
  "asking for a fix. Your first test run failed on an edge case the incident report already pointed to.";

const POLL_MS = 3000;
const MAX_POLLS = 40; // ~2 minutes, then the server restarts a stuck one on the next visit

/** The AI's feedback on the user's solve, in the solved result (only the owner gets it from the API). */
export function SolveFeedback({ attemptId }: { attemptId: string }) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [polls, setPolls] = useState(0);

  const load = useCallback(() => {
    api<Feedback>(`/attempts/${attemptId}/feedback`)
      .then(setFeedback)
      .catch(() => setFeedback({ status: "failed", content: null }));
  }, [attemptId]);

  useEffect(load, [load]);

  // Written in the background after the solve: ask again until it is there.
  useEffect(() => {
    if (feedback?.status !== "pending" || polls >= MAX_POLLS) return;
    const timer = setTimeout(() => {
      setPolls((n) => n + 1);
      load();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [feedback, polls, load]);

  if (!feedback || feedback.status === "unavailable") return null;

  return (
    <section aria-labelledby="feedback-heading" className="mb-10">
      <h2 id="feedback-heading" className="text-xl font-semibold text-text">
        AI feedback
      </h2>
      <p className="mt-1 text-xs text-muted">Only you can see this.</p>
      <div aria-live="polite" className="mt-4">
        {feedback.status === "locked" ? (
          // One grid cell for both: the box is as tall as the taller of the two, on any width.
          <div className="grid">
            <p aria-hidden className="pointer-events-none col-start-1 row-start-1 select-none rounded border border-border bg-surface p-5 text-sm leading-relaxed text-text blur-sm">
              {LOCKED_SAMPLE} {LOCKED_SAMPLE}
            </p>
            <div className="col-start-1 row-start-1 flex items-center justify-center p-4">
              <UpgradePrompt feature="feedback" className="max-w-lg" />
            </div>
          </div>
        ) : feedback.status === "ready" ? (
          <p className="whitespace-pre-wrap break-words rounded border border-border bg-surface p-5 text-sm leading-relaxed text-text">
            {feedback.content}
          </p>
        ) : feedback.status === "pending" && polls < MAX_POLLS ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner /> Writing your feedback...
          </p>
        ) : (
          <p className="text-sm text-muted">
            {feedback.status === "pending"
              ? "Your feedback is taking longer than usual."
              : "We could not write your feedback right now."}{" "}
            <button
              type="button"
              onClick={() => {
                setPolls(0);
                setFeedback({ status: "pending", content: null });
                load();
              }}
              className="text-action hover:underline"
            >
              Try again
            </button>
          </p>
        )}
      </div>
    </section>
  );
}
