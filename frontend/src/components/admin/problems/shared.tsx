import type { ReactNode } from "react";
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
