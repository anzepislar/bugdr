"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { CATEGORIES, type CategorySlug, type Difficulty, type SavedProblem } from "@/lib/types/problem";
import { DifficultyBadge, ErrorMessage, Spinner, cardClass, primaryButton, secondaryButton } from "./shared";

interface Props {
  title: string;
  difficulty: Difficulty;
  roleName: string;
  careerPaths: CategorySlug[];
  tags: string[];
  checksCount: number;
  saving: boolean;
  saved: SavedProblem | null;
  error: string | null;
  onSave: () => void;
  onBack: () => void;
  onReset: () => void;
  /** A4: the check run, shown between the summary and the buttons. */
  checkRun?: ReactNode;
}

export function PublishStep(props: Props) {
  const { title, difficulty, roleName, tags, checksCount, saving, saved, error } = props;

  if (saved) {
    return (
      <section className={`${cardClass} flex flex-col items-center px-6 py-12 text-center`}>
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-passed/15 text-passed">
          <Icon name="check" className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-xl font-semibold">{saved.isPublished ? "Problem published" : "Draft saved"}</h2>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {saved.isPublished ? (
            <Link href={`/problems/${saved.slug}`} className={secondaryButton}>
              View problem
            </Link>
          ) : (
            <Link href={`/admin/problems/${saved.id}/edit`} className={secondaryButton}>
              Edit draft
            </Link>
          )}
          <Link href="/admin/problems" className={secondaryButton}>
            All problems
          </Link>
          <button type="button" onClick={props.onReset} className={primaryButton}>
            Add another problem
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="max-w-3xl">
      <section className={cardClass}>
        <p className="flex items-center gap-2 text-sm font-medium text-passed">
          <Icon name="check" className="h-4 w-4" /> Ready to publish
        </p>
        <h2 className="mt-3 text-xl font-semibold leading-snug">{title}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <DifficultyBadge difficulty={difficulty} />
          <span className="rounded border border-border px-2 py-0.5 text-xs font-medium text-muted">{roleName}</span>
        </div>
        <p className="mt-3 text-sm text-muted">
          {props.careerPaths.length
            ? `Career paths: ${CATEGORIES.filter((c) => props.careerPaths.includes(c.slug)).map((c) => c.name).join(", ")} (not on /problems)`
            : "General problem, shown on /problems"}
        </p>
        {tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span key={tag} className="rounded bg-canvas px-2 py-0.5 text-xs text-muted">
                {tag}
              </span>
            ))}
          </div>
        )}
        <p className="mt-4 text-sm text-muted">
          {checksCount} acceptance {checksCount === 1 ? "check" : "checks"}
        </p>
      </section>

      {props.checkRun && <div className="mt-6">{props.checkRun}</div>}

      {error && <ErrorMessage>{error}</ErrorMessage>}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" onClick={props.onBack} disabled={saving} className="mr-auto text-sm text-muted hover:text-text disabled:opacity-40">
          ← Back to review
        </button>
        <button
          type="button"
          onClick={props.onSave}
          disabled={saving}
          className={`${secondaryButton} bg-surface`}
        >
          {saving && <Spinner />} Save as Draft
        </button>
        {/* Publish lives in the check run panel (A5): it runs the checks first. */}
      </div>
    </div>
  );
}
