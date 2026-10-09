"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { DryRunPanel } from "@/components/admin/problems/DryRunPanel";
import { PublishStep } from "@/components/admin/problems/PublishStep";
import { isReviewComplete, ReviewStep } from "@/components/admin/problems/ReviewStep";
import { saveErrorMessage, StepIndicator } from "@/components/admin/problems/shared";
import { UploadStep } from "@/components/admin/problems/UploadStep";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import {
  CATEGORIES,
  toAdminProblemDraft,
  type AnalyzeDone,
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
        <Link href="/admin/problems" aria-label="Back to problems" className="mt-1 text-muted hover:text-text">
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
  const [analysis, setAnalysis] = useState<ProblemAnalysis | null>(null);
  const [problemId, setProblemId] = useState<string | null>(null);
  const [form, setForm] = useState<ProblemForm | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedProblem | null>(null);
  // Last saved body + result: an unchanged form is not saved again, so a passing check run stays valid (A4).
  const lastSave = useRef<{ body: string; result: SavedProblem } | null>(null);

  // The analysis already created the draft (D22).
  function onAnalyzed({ analysis: result, problemId: id }: AnalyzeDone) {
    setAnalysis(result);
    setProblemId(id);
    setForm({
      title: result.title,
      shortDescription: result.shortDescription,
      codebaseContext: result.codebaseContext,
      incidentReport: result.incidentReport,
      tags: result.tags,
      difficulty: result.suggestedDifficulty,
      categorySlug: null,
      timeLimitMinutes: 0,
      thumbnail: null,
    });
    setChecks(result.checks);
    setStep(2);
  }

  // The analysis already created the draft with the code (D22); this saves the reviewed fields into it.
  // Also before every check run, which runs what is saved (A4). Publishing comes with A5.
  async function persist(): Promise<SavedProblem | null> {
    if (!analysis || !problemId || !form || form.categorySlug === null) return null;
    const body = JSON.stringify(
      toAdminProblemDraft({ ...form, categorySlug: form.categorySlug }, checks, analysis.hiddenFiles, analysis.bugSummary),
    );
    if (lastSave.current?.body === body) return lastSave.current.result;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await api<SavedProblem>(`/admin/problems/${problemId}`, { method: "PUT", body });
      lastSave.current = { body, result };
      return result;
    } catch (error) {
      setSaveError(saveErrorMessage(error));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    const result = await persist();
    if (result) setSaved(result);
  }

  return (
    <>
      <StepIndicator steps={STEPS} current={saved ? STEPS.length + 1 : step} variant="line" />

      <div className="mt-8">
        {step === 1 && (
          <UploadStep<AnalyzeDone>
            url="/admin/problems/analyze"
            method="POST"
            stages={["duplicate", "production", "analysis"]}
            submitLabel="Analyze Codebase"
            onDone={onAnalyzed}
          />
        )}

        {step === 2 && analysis && form && (
          <ReviewStep
            bugSummary={analysis.bugSummary}
            suggestedDifficulty={analysis.suggestedDifficulty}
            form={form}
            onFormChange={(patch) => setForm({ ...form, ...patch })}
            checks={checks}
            onChecksChange={setChecks}
            canContinue={isReviewComplete(form, checks)}
            onContinue={() => setStep(3)}
          />
        )}

        {step === 3 && form && (
          <PublishStep
            title={form.title.trim()}
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
            checkRun={
              problemId && (
                <DryRunPanel
                  problemId={problemId}
                  verified={false}
                  beforeRun={async () => (await persist()) !== null}
                  onPublished={(slug) => setSaved({ id: problemId, slug, isPublished: true })}
                />
              )
            }
          />
        )}
      </div>
    </>
  );
}
