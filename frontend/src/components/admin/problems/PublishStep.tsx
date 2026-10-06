"use client";

import type { Difficulty, SavedProblem } from "@/lib/types/problem";
import { DifficultyBadge, ErrorMessage, Spinner, cardClass, primaryButton, secondaryButton } from "./shared";

interface Props {
  title: string;
  slug: string;
  difficulty: Difficulty;
  categoryName: string;
  timeLimitMinutes: number;
  checksCount: number;
  validationPassed: boolean;
  saving: "draft" | "publish" | null;
  saved: SavedProblem | null;
  error: string | null;
  onSave: (publish: boolean) => void;
  onReset: () => void;
}

export function PublishStep(props: Props) {
  const { title, slug, difficulty, categoryName, timeLimitMinutes, checksCount, validationPassed, saving, saved, error } =
    props;

  if (saved) {
    return (
      <section className={cardClass}>
        <h2 className="text-lg font-semibold">{saved.isPublished ? "Problem published" : "Saved as draft"}</h2>
        <p className="mt-2 text-sm text-muted">
          {title} · <span className="font-mono">/problems/{saved.slug}</span>
        </p>
        <button type="button" onClick={props.onReset} className={`${secondaryButton} mt-5`}>
          Create another problem
        </button>
      </section>
    );
  }

  return (
    <section className={cardClass}>
      <h2 className="text-lg font-semibold">Ready to save</h2>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted">Title</dt>
        <dd>{title}</dd>
        <dt className="text-muted">URL</dt>
        <dd className="break-all font-mono">/problems/{slug}</dd>
        <dt className="text-muted">Level</dt>
        <dd>
          <DifficultyBadge difficulty={difficulty} />
        </dd>
        <dt className="text-muted">Label</dt>
        <dd>{categoryName}</dd>
        <dt className="text-muted">Time limit</dt>
        <dd>{timeLimitMinutes} min</dd>
        <dt className="text-muted">Checks</dt>
        <dd>{checksCount}</dd>
        <dt className="text-muted">Validation</dt>
        <dd className={validationPassed ? "text-passed" : "text-highlight"}>
          {validationPassed ? "Passed" : "Not passed"}
        </dd>
      </dl>

      {error && <ErrorMessage>{error}</ErrorMessage>}

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button type="button" onClick={() => props.onSave(false)} disabled={saving !== null} className={secondaryButton}>
          {saving === "draft" && <Spinner />} Save as Draft
        </button>
        <button
          type="button"
          onClick={() => props.onSave(true)}
          disabled={saving !== null || !validationPassed}
          className={primaryButton}
        >
          {saving === "publish" && <Spinner />} Publish
        </button>
      </div>
      {!validationPassed && (
        <p className="mt-3 text-right text-xs text-muted">Publish unlocks after a successful validation run.</p>
      )}
    </section>
  );
}
