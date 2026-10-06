"use client";

import {
  BASE_POINTS,
  CATEGORIES,
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  TIME_LIMIT_RANGE,
  type Difficulty,
  type ProblemForm,
} from "@/lib/types/problem";
import { DIFFICULTY_PEER_CHECKED, FieldLabel, cardClass, inputClass, secondaryButton } from "./shared";

const optionClass =
  "block h-full rounded border border-border px-3 py-3 text-sm font-medium text-muted hover:text-text peer-focus-visible:ring-2 peer-focus-visible:ring-action";

// Follow the recommended minimum while the admin hasn't typed their own value.
function nextTimeLimit(form: ProblemForm, difficulty: Difficulty): number {
  const untouched = form.timeLimitMinutes === TIME_LIMIT_RANGE[form.difficulty][0];
  return untouched ? TIME_LIMIT_RANGE[difficulty][0] : form.timeLimitMinutes;
}

interface Props {
  form: ProblemForm;
  onFormChange: (patch: Partial<ProblemForm>) => void;
  suggestedDifficulty: Difficulty;
}

export function DefineStep({ form, onFormChange, suggestedDifficulty }: Props) {
  const [min, max] = TIME_LIMIT_RANGE[form.difficulty];

  return (
    <div className="space-y-6">
      <fieldset className={cardClass}>
        <legend className="sr-only">Level</legend>
        <h2 className="text-lg font-semibold">Level</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DIFFICULTIES.map((difficulty) => (
            <label key={difficulty} className="block cursor-pointer">
              <input
                type="radio"
                name="level"
                className="peer sr-only"
                checked={form.difficulty === difficulty}
                onChange={() => onFormChange({ difficulty, timeLimitMinutes: nextTimeLimit(form, difficulty) })}
              />
              <span className={`${optionClass} ${DIFFICULTY_PEER_CHECKED[difficulty]}`}>
                {DIFFICULTY_LABEL[difficulty]}
                {difficulty === suggestedDifficulty && (
                  <span className="block text-xs font-normal text-muted">AI suggestion</span>
                )}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">Base points: {BASE_POINTS[form.difficulty]}</p>
      </fieldset>

      <fieldset className={cardClass}>
        <legend className="sr-only">Label</legend>
        <h2 className="text-lg font-semibold">Label</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {CATEGORIES.map((category) => (
            <label key={category.slug} className="cursor-pointer">
              <input
                type="radio"
                name="label"
                className="peer sr-only"
                checked={form.categorySlug === category.slug}
                onChange={() => onFormChange({ categorySlug: category.slug })}
              />
              <span className={`${optionClass} peer-checked:border-action peer-checked:text-action`}>
                {category.name}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <section className={cardClass}>
        <FieldLabel htmlFor="time-limit">Time limit (minutes)</FieldLabel>
        <input
          id="time-limit"
          type="number"
          min={1}
          step={1}
          value={form.timeLimitMinutes || ""}
          onChange={(e) => onFormChange({ timeLimitMinutes: Number(e.target.value) })}
          className={`${inputClass} max-w-40`}
        />
        <p className="mt-1.5 text-xs text-muted">
          Recommended for {DIFFICULTY_LABEL[form.difficulty]}: {min}–{max} minutes
        </p>
      </section>

      <section className={cardClass}>
        <h2 className="text-lg font-semibold">
          Thumbnail <span className="text-sm font-normal text-muted">· optional</span>
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className={`${secondaryButton} cursor-pointer focus-within:border-action`}>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => onFormChange({ thumbnail: e.target.files?.[0] ?? null })}
            />
            Choose image
          </label>
          {form.thumbnail && (
            <>
              <span className="font-mono text-sm text-muted">{form.thumbnail.name}</span>
              <button
                type="button"
                onClick={() => onFormChange({ thumbnail: null })}
                className="text-sm text-muted hover:text-text"
              >
                Remove
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
