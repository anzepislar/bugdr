"use client";

import { useState } from "react";
import { DefineStep } from "@/components/admin/problems/DefineStep";
import { PublishStep } from "@/components/admin/problems/PublishStep";
import { MIN_CHECKS, ReviewStep } from "@/components/admin/problems/ReviewStep";
import { ErrorMessage, Spinner, cardClass, primaryButton, secondaryButton } from "@/components/admin/problems/shared";
import { UploadStep } from "@/components/admin/problems/UploadStep";
import { ValidateStep } from "@/components/admin/problems/ValidateStep";
import { mockAnalyzeProblem, mockRunCheck, mockSaveProblem } from "@/lib/mock/adminProblems";
import {
  CATEGORIES,
  TIME_LIMIT_RANGE,
  toSlug,
  type AdminProblemDraft,
  type Check,
  type CheckValidationResult,
  type ProblemAnalysis,
  type ProblemForm,
  type SavedProblem,
} from "@/lib/types/problem";

const STEPS = ["Upload", "Analysis", "Review", "Define", "Validate", "Publish"];

const EMPTY_FORM: ProblemForm = {
  title: "",
  shortDescription: "",
  fullDescription: "",
  tags: [],
  difficulty: "medium",
  categorySlug: null,
  timeLimitMinutes: 0,
  thumbnail: null,
};

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function NewProblemPage() {
  const [resetKey, setResetKey] = useState(0);
  return <CreateProblemWizard key={resetKey} onReset={() => setResetKey((k) => k + 1)} />;
}

function CreateProblemWizard({ onReset }: { onReset: () => void }) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<ProblemAnalysis | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [form, setForm] = useState<ProblemForm>(EMPTY_FORM);
  const [checks, setChecks] = useState<Check[]>([]);
  const [results, setResults] = useState<Record<string, CheckValidationResult> | null>(null);
  const [runningCheckId, setRunningCheckId] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedProblem | null>(null);

  const reviewComplete =
    form.title.trim() !== "" &&
    toSlug(form.title) !== "" &&
    form.shortDescription.trim() !== "" &&
    form.fullDescription.trim() !== "" &&
    checks.length >= MIN_CHECKS &&
    checks.every((c) => c.description.trim() !== "" && c.checkCommand.trim() !== "");
  const defineComplete =
    form.categorySlug !== null && Number.isInteger(form.timeLimitMinutes) && form.timeLimitMinutes > 0;
  const validationComplete = results !== null && checks.every((c) => c.id in results);
  const validationPassed = validationComplete && checks.every((c) => !results[c.id].passed);

  const canContinue =
    (step === 3 && reviewComplete) || (step === 4 && defineComplete) || (step === 5 && validationComplete && !validating);

  function patchForm(patch: Partial<ProblemForm>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  // Any change to the checks invalidates the last validation run.
  function updateChecks(next: Check[]) {
    setChecks(next);
    setResults(null);
  }

  async function analyze() {
    if (!file) return;
    setStep(2);
    setAnalyzeError(null);
    try {
      const result = await mockAnalyzeProblem(file);
      setAnalysis(result);
      setForm({
        ...EMPTY_FORM,
        shortDescription: result.shortDescription,
        fullDescription: result.fullDescription,
        tags: result.tags,
        difficulty: result.suggestedDifficulty,
        timeLimitMinutes: TIME_LIMIT_RANGE[result.suggestedDifficulty][0],
      });
      updateChecks(result.checks);
      setStep(3);
    } catch (error) {
      setAnalyzeError(errorText(error, "AI analysis failed. Try again."));
    }
  }

  async function runValidation() {
    setValidating(true);
    setValidationError(null);
    setResults({});
    const next: Record<string, CheckValidationResult> = {};
    try {
      for (const check of checks) {
        setRunningCheckId(check.id);
        next[check.id] = await mockRunCheck(check);
        setResults({ ...next });
      }
    } catch (error) {
      setResults(null);
      setValidationError(errorText(error, "Docker validation failed. Try again."));
    } finally {
      setRunningCheckId(null);
      setValidating(false);
    }
  }

  async function save(publish: boolean) {
    if (!analysis || !file || form.categorySlug === null) return;
    if (publish && !validationPassed) return;
    const draft: AdminProblemDraft = {
      title: form.title.trim(),
      slug: toSlug(form.title),
      shortDescription: form.shortDescription.trim(),
      fullDescription: form.fullDescription.trim(),
      difficulty: form.difficulty,
      categorySlug: form.categorySlug,
      timeLimitMinutes: form.timeLimitMinutes,
      tags: form.tags,
      checks: checks.map((c, i) => ({ ...c, checkOrder: i + 1 })),
      hiddenFiles: analysis.hiddenFiles,
      bugSummary: analysis.bugSummary,
      codebaseFileName: file.name,
      thumbnailFileName: form.thumbnail?.name ?? null,
      isPublished: publish,
    };
    setSaving(publish ? "publish" : "draft");
    setSaveError(null);
    try {
      setSaved(await mockSaveProblem(draft));
    } catch (error) {
      setSaveError(errorText(error, "Saving failed. Try again."));
    } finally {
      setSaving(null);
    }
  }

  const categoryName = CATEGORIES.find((c) => c.slug === form.categorySlug)?.name ?? "";

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p className="text-sm text-muted">Admin · Problems</p>
      <h1 className="mt-1 text-2xl font-semibold">Create problem</h1>

      <StepIndicator current={step} />

      <div className="mt-8">
        {step === 1 && <UploadStep file={file} onFileChange={setFile} onAnalyze={analyze} />}

        {step === 2 && (
          <section className={cardClass}>
            {analyzeError ? (
              <>
                <h2 className="text-lg font-semibold">Analysis failed</h2>
                <ErrorMessage>{analyzeError}</ErrorMessage>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button type="button" onClick={analyze} className={primaryButton}>
                    Try again
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAnalyzeError(null);
                      setStep(1);
                    }}
                    className={secondaryButton}
                  >
                    Choose another file
                  </button>
                </div>
              </>
            ) : (
              <div role="status" className="flex items-center gap-3 text-sm">
                <Spinner />
                <span>
                  Analyzing <span className="font-mono">{file?.name}</span>… reading the codebase, writing the
                  description and checks.
                </span>
              </div>
            )}
          </section>
        )}

        {step === 3 && analysis && (
          <ReviewStep
            analysis={analysis}
            form={form}
            onFormChange={patchForm}
            checks={checks}
            onChecksChange={updateChecks}
          />
        )}

        {step === 4 && analysis && (
          <DefineStep form={form} onFormChange={patchForm} suggestedDifficulty={analysis.suggestedDifficulty} />
        )}

        {step === 5 && (
          <ValidateStep
            checks={checks}
            results={results}
            runningCheckId={runningCheckId}
            validating={validating}
            complete={validationComplete}
            passed={validationPassed}
            error={validationError}
            onValidate={runValidation}
          />
        )}

        {step === 6 && (
          <PublishStep
            title={form.title.trim()}
            slug={toSlug(form.title)}
            difficulty={form.difficulty}
            categoryName={categoryName}
            timeLimitMinutes={form.timeLimitMinutes}
            checksCount={checks.length}
            validationPassed={validationPassed}
            saving={saving}
            saved={saved}
            error={saveError}
            onSave={save}
            onReset={onReset}
          />
        )}
      </div>

      {step >= 3 && !saved && (
        <div className="mt-8 flex justify-between gap-3 border-t border-border pt-6">
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 3 || validating || saving !== null}
            className={secondaryButton}
          >
            Back
          </button>
          {step < 6 && (
            <button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canContinue} className={primaryButton}>
              Continue
            </button>
          )}
        </div>
      )}
    </main>
  );
}

function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
      {STEPS.map((label, i) => {
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
