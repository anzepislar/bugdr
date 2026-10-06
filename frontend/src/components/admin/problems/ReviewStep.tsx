"use client";

import { useState } from "react";
import {
  CHECK_TYPES,
  toSlug,
  type Check,
  type CheckType,
  type ProblemAnalysis,
  type ProblemForm,
} from "@/lib/types/problem";
import { DifficultyBadge, FieldLabel, cardClass, inputClass, secondaryButton } from "./shared";

export const MIN_CHECKS = 3; // 04_admin.md "At least 3 checks"
const SHORT_DESCRIPTION_MAX = 200; // problems.summary VARCHAR(200), D16

interface Props {
  analysis: ProblemAnalysis;
  form: ProblemForm;
  onFormChange: (patch: Partial<ProblemForm>) => void;
  checks: Check[];
  onChecksChange: (checks: Check[]) => void;
}

export function ReviewStep({ analysis, form, onFormChange, checks, onChecksChange }: Props) {
  const hiddenFiles = Object.entries(analysis.hiddenFiles);
  const slug = toSlug(form.title);

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
    <div className="space-y-6">
      <section className="rounded border border-dashed border-border p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Internal note · never shown to users
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">{analysis.bugSummary}</p>
      </section>

      <section className={`${cardClass} space-y-5`}>
        <h2 className="text-lg font-semibold">Problem details</h2>

        <div>
          <FieldLabel htmlFor="title">Title</FieldLabel>
          <input
            id="title"
            value={form.title}
            onChange={(e) => onFormChange({ title: e.target.value })}
            placeholder="e.g. Logged out on every refresh"
            className={inputClass}
          />
          {slug && <p className="mt-1.5 font-mono text-xs text-muted">/problems/{slug}</p>}
        </div>

        <div>
          <FieldLabel htmlFor="short-description">Short description · problem card</FieldLabel>
          <input
            id="short-description"
            value={form.shortDescription}
            maxLength={SHORT_DESCRIPTION_MAX}
            onChange={(e) => onFormChange({ shortDescription: e.target.value })}
            className={inputClass}
          />
          <p className="mt-1.5 text-right text-xs text-muted">
            {form.shortDescription.length}/{SHORT_DESCRIPTION_MAX}
          </p>
        </div>

        <div>
          <FieldLabel htmlFor="full-description">Full description · problem page</FieldLabel>
          <textarea
            id="full-description"
            rows={6}
            value={form.fullDescription}
            onChange={(e) => onFormChange({ fullDescription: e.target.value })}
            className={`${inputClass} resize-y leading-relaxed`}
          />
        </div>

        <div>
          <FieldLabel htmlFor="tags">Tags</FieldLabel>
          <TagsEditor tags={form.tags} onChange={(tags) => onFormChange({ tags })} />
        </div>
      </section>

      <section className={cardClass}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Suggested difficulty</h2>
          <DifficultyBadge difficulty={analysis.suggestedDifficulty} />
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">{analysis.difficultyReasoning}</p>
        <p className="mt-2 text-xs text-muted">You can override the level in the next step.</p>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Checks</h2>
          <p className={`text-sm ${checks.length < MIN_CHECKS ? "text-highlight" : "text-muted"}`}>
            {checks.length} checks · minimum {MIN_CHECKS}
          </p>
        </div>
        {checks.map((check, index) => (
          <CheckCard
            key={check.id}
            index={index}
            check={check}
            onChange={(patch) => updateCheck(check.id, patch)}
            onDelete={() => onChecksChange(checks.filter((c) => c.id !== check.id))}
          />
        ))}
        <button type="button" onClick={addCheck} className={secondaryButton}>
          + Add check
        </button>
      </section>

      <details className={cardClass}>
        <summary className="cursor-pointer text-lg font-semibold">
          Hidden files <span className="text-sm font-normal text-muted">({hiddenFiles.length})</span>
        </summary>
        <p className="mt-2 text-sm text-muted">
          Copied into the container after the user&apos;s files. Users never see or edit them.
        </p>
        <div className="mt-4 space-y-4">
          {hiddenFiles.map(([name, content]) => (
            <div key={name}>
              <p className="font-mono text-xs text-muted">{name}</p>
              <pre className="mt-1 max-h-80 overflow-auto rounded border border-border bg-canvas p-3 font-mono text-xs leading-relaxed">
                {content}
              </pre>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function CheckCard({
  index,
  check,
  onChange,
  onDelete,
}: {
  index: number;
  check: Check;
  onChange: (patch: Partial<Check>) => void;
  onDelete: () => void;
}) {
  const id = `check-${check.id}`;
  return (
    <div className={`${cardClass} space-y-3`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted">#{index + 1}</span>
        <select
          aria-label="Check type"
          value={check.checkType}
          onChange={(e) => onChange({ checkType: e.target.value as CheckType })}
          className="rounded border border-border bg-canvas px-2 py-0.5 text-xs uppercase tracking-wide text-muted focus:border-action focus:outline-none"
        >
          {CHECK_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
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
        <FieldLabel htmlFor={`${id}-description`}>Description · shown to user</FieldLabel>
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
