"use client";

import Link from "next/link";
import { useState } from "react";
import { PublishStep } from "@/components/admin/problems/PublishStep";
import { MIN_CHECKS, ReviewStep } from "@/components/admin/problems/ReviewStep";
import { StepIndicator } from "@/components/admin/problems/shared";
import { UploadStep } from "@/components/admin/problems/UploadStep";
import { Icon } from "@/components/Icon";
import { mockSaveProblem } from "@/lib/mock/adminProblems";
import {
  CATEGORIES,
  TIME_LIMIT_RANGE,
  toSlug,
  type AdminProblemDraft,
  type Check,
  type ProblemAnalysis,
  type ProblemForm,
  type SavedProblem,
} from "@/lib/types/problem";

const STEPS = ["Analysis", "Review", "Publish"];

export default function NewProblemPage() {
  const [resetKey, setResetKey] = useState(0);
  return (
    <div className="w-full px-6 py-8 wide:mx-auto wide:max-w-[1200px]">
      <div className="flex items-start gap-3">
        <Link href="/admin" aria-label="Back to admin" className="mt-1 text-muted hover:text-text">
          <Icon name="arrowLeft" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">Add Problem</h1>
          <p className="mt-1 text-sm text-muted">Upload a codebase and let AI generate the problem</p>
        </div>
      </div>
      <AddProblemFlow key={resetKey} onReset={() => setResetKey((k) => k + 1)} />
    </div>
  );
}

function AddProblemFlow({ onReset }: { onReset: () => void }) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<ProblemAnalysis | null>(null);
  const [form, setForm] = useState<ProblemForm | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedProblem | null>(null);

  function onAnalyzed(zip: File, result: ProblemAnalysis) {
    setFile(zip);
    setAnalysis(result);
    setForm({
      title: "",
      shortDescription: result.shortDescription,
      fullDescription: result.fullDescription,
      tags: result.tags,
      difficulty: result.suggestedDifficulty,
      categorySlug: null,
      timeLimitMinutes: 0,
      thumbnail: null,
    });
    setChecks(result.checks);
    setStep(2);
  }

  const reviewComplete =
    form !== null &&
    form.shortDescription.trim() !== "" &&
    form.fullDescription.trim() !== "" &&
    form.categorySlug !== null &&
    checks.length >= MIN_CHECKS &&
    checks.every((c) => c.description.trim() !== "" && c.checkCommand.trim() !== "");

  async function save(publish: boolean) {
    if (!analysis || !file || !form || form.categorySlug === null) return;
    // ponytail: the flow has no title or time-limit field (D45) - title = short description,
    // time limit = low end of the recommended range for the difficulty.
    const title = form.shortDescription.trim();
    const draft: AdminProblemDraft = {
      title,
      slug: toSlug(title),
      shortDescription: title,
      fullDescription: form.fullDescription.trim(),
      difficulty: form.difficulty,
      categorySlug: form.categorySlug,
      timeLimitMinutes: TIME_LIMIT_RANGE[form.difficulty][0],
      tags: form.tags,
      checks: checks.map((c, i) => ({ ...c, checkOrder: i + 1 })),
      hiddenFiles: analysis.hiddenFiles,
      bugSummary: analysis.bugSummary,
      codebaseFileName: file.name,
      thumbnailFileName: null,
      isPublished: publish,
    };
    setSaving(publish ? "publish" : "draft");
    setSaveError(null);
    try {
      setSaved(await mockSaveProblem(draft));
    } catch (error) {
      setSaveError(error instanceof Error && error.message ? error.message : "Saving failed. Try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <StepIndicator steps={STEPS} current={saved ? STEPS.length + 1 : step} variant="line" />

      <div className="mt-8">
        {step === 1 && <UploadStep onAnalyzed={onAnalyzed} />}

        {step === 2 && analysis && form && (
          <ReviewStep
            analysis={analysis}
            form={form}
            onFormChange={(patch) => setForm({ ...form, ...patch })}
            checks={checks}
            onChecksChange={setChecks}
            canContinue={reviewComplete}
            onContinue={() => setStep(3)}
          />
        )}

        {step === 3 && form && (
          <PublishStep
            title={form.shortDescription.trim()}
            difficulty={form.difficulty}
            roleName={CATEGORIES.find((c) => c.slug === form.categorySlug)?.name ?? ""}
            tags={form.tags}
            checksCount={checks.length}
            saving={saving}
            saved={saved}
            error={saveError}
            onSave={save}
            onBack={() => setStep(2)}
            onReset={onReset}
          />
        )}
      </div>
    </>
  );
}
