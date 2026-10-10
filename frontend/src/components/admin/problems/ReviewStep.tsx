"use client";

import { useState } from "react";
import { Select } from "@/components/Select";
import {
  CATEGORIES,
  CHECK_TYPES,
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  toSlug,
  type Check,
  type Difficulty,
  type ProblemForm,
} from "@/lib/types/problem";
import {
  DIFFICULTY_PEER_CHECKED,
  FieldLabel,
  Spinner,
  cardClass,
  inputClass,
  primaryButton,
  secondaryButton,
} from "./shared";

export const MIN_CHECKS = 3; // 04_admin.md "At least 3 checks"
export const SHORT_DESCRIPTION_MAX = 300; // problems.short_description VARCHAR(300)
export const TITLE_MAX = 255; // problems.title VARCHAR(255)

/** Everything the Review form needs before it can be saved. */
export const isReviewComplete = (form: ProblemForm, checks: Check[]) =>
  toSlug(form.title) !== "" &&
  form.shortDescription.trim() !== "" &&
  form.codebaseContext.trim() !== "" &&
  form.incidentReport.trim() !== "" &&
  form.categorySlug !== null &&
  checks.length >= MIN_CHECKS &&
  checks.every((c) => c.description.trim() !== "" && c.checkCommand.trim() !== "");

const optionClass =
  "block rounded border border-border px-3 py-2.5 text-sm font-medium text-muted hover:text-text peer-focus-visible:ring-2 peer-focus-visible:ring-action";

interface Props {
  bugSummary: string;
  suggestedDifficulty: Difficulty | null;
  form: ProblemForm;
  onFormChange: (patch: Partial<ProblemForm>) => void;
  checks: Check[];
  onChecksChange: (checks: Check[]) => void;
  canContinue: boolean;
  onContinue: () => void;
  continueLabel?: string;
  busy?: boolean;
}

export function ReviewStep(props: Props) {
  const { bugSummary, suggestedDifficulty, form, onFormChange, checks, onChecksChange, canContinue, onContinue } = props;
  function updateCheck(id: string, patch: Partial<Check>) {
    onChecksChange(checks.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function addCheck() {
    onChecksChange([
      ...checks,
      {
        id: Math.random().toString(36).slice(2, 10),
        checkOrder: checks.length + 1,
        description: "",
        checkType: "custom",
        checkCommand: "",
        mustPass: true,
      },
    ]);
  }

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <div className="min-w-0 space-y-6 lg:w-3/5">
        <section className="rounded border-y border-r border-l-[3px] border-border border-l-action bg-surface p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            AI Analysis <span className="normal-case tracking-normal">(Internal only)</span>
          </p>
          <p className="mt-2 text-sm leading-relaxed text-text">
            <span className="font-semibold">Bug identified:</span> {bugSummary}
          </p>
        </section>

        <div>
          <FieldLabel htmlFor="title">Title</FieldLabel>
          <input
            id="title"
            value={form.title}
            maxLength={TITLE_MAX}
            onChange={(e) => onFormChange({ title: e.target.value })}
            className={inputClass}
          />
          <p className="mt-1.5 truncate text-xs text-muted">URL: /problems/{toSlug(form.title) || "…"}</p>
        </div>

        <div>
          <FieldLabel htmlFor="short-description">Short description</FieldLabel>
          <input
            id="short-description"
            value={form.shortDescription}
            maxLength={SHORT_DESCRIPTION_MAX}
            onChange={(e) => onFormChange({ shortDescription: e.target.value })}
            className={inputClass}
          />
          <div className="mt-1.5 flex justify-between gap-3 text-xs text-muted">
            <span>Shown on the problem card (max {SHORT_DESCRIPTION_MAX} chars)</span>
            <span className="tabular-nums">
              {form.shortDescription.length}/{SHORT_DESCRIPTION_MAX}
            </span>
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="codebase-context">Codebase context</FieldLabel>
          <textarea
            id="codebase-context"
            rows={5}
            value={form.codebaseContext}
            onChange={(e) => onFormChange({ codebaseContext: e.target.value })}
            className={`${inputClass} resize-y leading-relaxed`}
          />
          <p className="mt-1.5 text-xs text-muted">What the system does, as if the user just joined the team</p>
        </div>

        <div>
          <FieldLabel htmlFor="incident-report">Incident report</FieldLabel>
          <textarea
            id="incident-report"
            rows={6}
            value={form.incidentReport}
            onChange={(e) => onFormChange({ incidentReport: e.target.value })}
            className={`${inputClass} resize-y leading-relaxed`}
          />
          <p className="mt-1.5 text-xs text-muted">
            Symptoms, logs, user complaints. Never the cause, the expected behaviour or the file
          </p>
        </div>

        <div>
          <FieldLabel htmlFor="tags">Tags</FieldLabel>
          <TagsEditor tags={form.tags} onChange={(tags) => onFormChange({ tags })} />
        </div>
      </div>

      <aside className="min-w-0 space-y-6 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:w-2/5 lg:overflow-y-auto">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-text">Difficulty</legend>
          <div className="grid grid-cols-2 gap-2">
            {DIFFICULTIES.map((difficulty) => (
              <label key={difficulty} className="block cursor-pointer">
                <input
                  type="radio"
                  name="difficulty"
                  className="peer sr-only"
                  checked={form.difficulty === difficulty}
                  onChange={() => onFormChange({ difficulty })}
                />
                <span className={`${optionClass} ${DIFFICULTY_PEER_CHECKED[difficulty]}`}>
                  {DIFFICULTY_LABEL[difficulty]}
                  {difficulty === suggestedDifficulty && (
                    <span className="ml-1 text-xs font-normal text-muted">(AI suggested)</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-text">Role</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((category) => (
              <label key={category.slug} className="cursor-pointer">
                <input
                  type="radio"
                  name="role"
                  className="peer sr-only"
                  checked={form.categorySlug === category.slug}
                  onChange={() => onFormChange({ categorySlug: category.slug })}
                />
                <span className={`${optionClass} py-1.5 peer-checked:border-action peer-checked:text-action`}>
                  {category.name}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-text">Career paths</legend>
          <p className="mb-2 text-xs text-muted">
            A path problem is only solved through its paths and stays off /problems. None ticked = a general problem.
          </p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((category) => (
              <label key={category.slug} className="cursor-pointer">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={form.careerPaths.includes(category.slug)}
                  onChange={(e) =>
                    onFormChange({
                      careerPaths: e.target.checked
                        ? [...form.careerPaths, category.slug]
                        : form.careerPaths.filter((s) => s !== category.slug),
                    })
                  }
                />
                <span className={`${optionClass} py-1.5 peer-checked:border-action peer-checked:text-action`}>
                  {category.name}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-text">Acceptance Checks</h2>
            <span
              className={`rounded bg-canvas px-1.5 text-xs font-medium ${checks.length < MIN_CHECKS ? "text-highlight" : "text-muted"}`}
            >
              {checks.length}
            </span>
            {checks.length < MIN_CHECKS && <span className="text-xs text-muted">minimum {MIN_CHECKS}</span>}
          </div>
          {checks.map((check) => (
            <CheckCard
              key={check.id}
              check={check}
              onChange={(patch) => updateCheck(check.id, patch)}
              onDelete={() => onChecksChange(checks.filter((c) => c.id !== check.id))}
            />
          ))}
          <button type="button" onClick={addCheck} className={secondaryButton}>
            + Add check
          </button>
        </section>

        <div>
          <button
            type="button"
            onClick={onContinue}
            disabled={!canContinue || props.busy}
            className={`${primaryButton} w-full py-3`}
          >
            {props.busy && <Spinner />}
            {props.continueLabel ?? "Continue to Publish"}
          </button>
          {!canContinue && (
            <p className="mt-2 text-xs text-muted">
              Needs a title, all three descriptions, a role and at least {MIN_CHECKS} checks with a description and
              command.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

function CheckCard({
  check,
  onChange,
  onDelete,
}: {
  check: Check;
  onChange: (patch: Partial<Check>) => void;
  onDelete: () => void;
}) {
  const id = `check-${check.id}`;
  return (
    <div className={`${cardClass} space-y-3`}>
      <div className="flex flex-wrap items-center gap-3">
        <Select
          aria-label="Check type"
          value={check.checkType}
          onChange={(checkType) => onChange({ checkType })}
          options={CHECK_TYPES.map((type) => ({ value: type, label: type }))}
          className="rounded border border-border bg-canvas px-2 py-0.5 text-xs uppercase tracking-wide text-muted focus:border-action focus:outline-none"
        />
        <label className="ml-auto flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={check.mustPass}
            onChange={(e) => onChange({ mustPass: e.target.checked })}
            className="h-4 w-4 accent-action"
          />
          Must pass
        </label>
        <button type="button" onClick={onDelete} className="text-sm text-muted hover:text-failed">
          Delete
        </button>
      </div>
      <div>
        <FieldLabel htmlFor={`${id}-description`}>Description</FieldLabel>
        <input
          id={`${id}-description`}
          value={check.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="e.g. API returns 200 on /health"
          className={inputClass}
        />
      </div>
      <div>
        <FieldLabel htmlFor={`${id}-command`}>Command</FieldLabel>
        <input
          id={`${id}-command`}
          value={check.checkCommand}
          spellCheck={false}
          onChange={(e) => onChange({ checkCommand: e.target.value })}
          placeholder="npm test"
          className={`${inputClass} font-mono`}
        />
      </div>
    </div>
  );
}

function TagsEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");

  function add() {
    const tag = draft.trim().toLowerCase();
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setDraft("");
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded border border-border bg-canvas px-3 py-2 focus-within:border-action">
      {tags.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs">
          {tag}
          <button
            type="button"
            aria-label={`Remove tag ${tag}`}
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="text-muted hover:text-text"
          >
            ×
          </button>
        </span>
      ))}
      <input
        id="tags"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !draft && tags.length > 0) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={add}
        placeholder="Add tag…"
        className="min-w-24 flex-1 bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
      />
    </div>
  );
}
