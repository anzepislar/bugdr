import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { ApiError } from "@/lib/api";
import { DIFFICULTY_LABEL, type Difficulty } from "@/lib/types/problem";

export const cardClass = "rounded border border-border bg-surface p-5";

export const inputClass =
  "w-full rounded border border-border bg-canvas px-3 py-2 text-sm text-text placeholder:text-muted focus:border-action focus:outline-none";

export const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded bg-action px-4 py-2 text-sm font-medium text-canvas hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";

export const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded border border-border px-4 py-2 text-sm font-medium text-text hover:border-action hover:text-action disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text";

// Literal class names so Tailwind picks them up.
export const DIFFICULTY_TEXT: Record<Difficulty, string> = {
  easy: "text-easy border-easy",
  medium: "text-medium border-medium",
  hard: "text-hard border-hard",
  get_a_job: "text-get-a-job border-get-a-job",
};

export const DIFFICULTY_PEER_CHECKED: Record<Difficulty, string> = {
  easy: "peer-checked:border-easy peer-checked:text-easy",
  medium: "peer-checked:border-medium peer-checked:text-medium",
  hard: "peer-checked:border-hard peer-checked:text-hard",
  get_a_job: "peer-checked:border-get-a-job peer-checked:text-get-a-job",
};

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${DIFFICULTY_TEXT[difficulty]}`}>
      {DIFFICULTY_LABEL[difficulty]}
    </span>
  );
}

export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-text">
      {children}
    </label>
  );
}

export function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mt-3 rounded border border-failed/40 px-3 py-2 text-sm text-failed">
      {children}
    </p>
  );
}

export function StepIndicator({
  steps,
  current,
  variant = "boxes",
}: {
  steps: string[];
  current: number;
  /** "line": dots joined by a line (Add Problem). */
  variant?: "boxes" | "line";
}) {
  if (variant === "line") {
    return (
      <ol className="mt-6 flex items-center">
        {steps.map((label, i) => {
          const n = i + 1;
          const state = n < current ? "done" : n === current ? "current" : "todo";
          return (
            <li
              key={label}
              aria-current={state === "current" ? "step" : undefined}
              className={`flex items-center ${n < steps.length ? "flex-1" : ""}`}
            >
              <span className="flex shrink-0 items-center gap-2 text-sm">
                {state === "done" ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-passed text-canvas">
                    <Icon name="check" className="h-3.5 w-3.5" />
                  </span>
                ) : (
                  <span className={`h-2.5 w-2.5 rounded-full ${state === "current" ? "bg-action" : "bg-border"}`} />
                )}
                <span className={state === "todo" ? "text-muted" : "font-medium text-text"}>{label}</span>
              </span>
              {n < steps.length && (
                <span aria-hidden className={`mx-3 h-px flex-1 ${state === "done" ? "bg-passed" : "bg-border"}`} />
              )}
            </li>
          );
        })}
      </ol>
    );
  }
  return (
    <ol className={`mt-6 grid grid-cols-3 gap-2 ${steps.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-6"}`}>
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "todo";
        return (
          <li
            key={label}
            aria-current={state === "current" ? "step" : undefined}
            className={`flex items-center gap-2 rounded border px-3 py-2 text-sm ${
              state === "current" ? "border-action bg-surface text-text" : "border-border"
            } ${state === "todo" ? "text-muted" : ""}`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                state === "current"
                  ? "bg-action text-canvas"
                  : state === "done"
                    ? "border border-action text-action"
                    : "border border-border text-muted"
              }`}
            >
              {state === "done" ? "✓" : n}
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

const FIELD_LABEL: Record<string, string> = {
  title: "Title",
  shortDescription: "Short description",
  codebaseContext: "Codebase context",
  incidentReport: "Incident report",
  categorySlug: "Role",
  tags: "Tags",
  checks: "Checks",
  hiddenFiles: "Hidden files",
  // Contests (A6)
  type: "Type",
  description: "Description",
  startsAt: "Start",
  endsAt: "Close",
  problemSlugs: "Problems",
  rewardType: "Reward",
  rewardDescription: "Reward description",
};

/** Message for a failed admin save (problem A2, contest A6): per-field details of a 400, else the server's message. */
export function saveErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.details)
    return Object.entries(err.details as Record<string, string>)
      .map(([field, message]) => `${FIELD_LABEL[field] ?? field}: ${message}`)
      .join(" · ");
  if (err instanceof ApiError && err.status !== 500) return err.message;
  return "Saving failed. Try again.";
}
