"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isReviewComplete, ReviewStep } from "@/components/admin/problems/ReviewStep";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DryRunPanel } from "@/components/admin/problems/DryRunPanel";
import { cardClass, ErrorMessage, saveErrorMessage, secondaryButton } from "@/components/admin/problems/shared";
import { UploadStep } from "@/components/admin/problems/UploadStep";
import { Icon } from "@/components/Icon";
import { api, ApiError } from "@/lib/api";
import {
  toAdminProblemDraft,
  type AdminProblem,
  type Check,
  type CodeReplaced,
  type ProblemForm,
} from "@/lib/types/problem";

// Edit a saved draft (A2) with the same form as Add Problem's Review step.
export default function EditProblemPage() {
  const { id } = useParams<{ id: string }>();
  // undefined = loading, null = not found
  const [problem, setProblem] = useState<AdminProblem | null | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState<ProblemForm | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [runKey, setRunKey] = useState(0);
  // Last saved body: an unchanged form is not saved again, so a passing check run stays valid (A4).
  const lastSaved = useRef<string | null>(null);

  useEffect(() => {
    api<{ problem: AdminProblem }>(`/admin/problems/${id}`)
      .then(({ problem: p }) => {
        setProblem(p);
        setForm({
          title: p.title,
          shortDescription: p.shortDescription,
          codebaseContext: p.codebaseContext,
          incidentReport: p.incidentReport,
          tags: p.tags,
          difficulty: p.difficulty,
          categorySlug: p.categorySlug,
          timeLimitMinutes: p.timeLimitMinutes,
          thumbnail: null,
        });
        setChecks(p.checks);
        if (p.categorySlug)
          lastSaved.current = JSON.stringify(
            toAdminProblemDraft({ ...p, thumbnail: null, categorySlug: p.categorySlug }, p.checks, p.hiddenFiles, p.bugSummary),
          );
      })
      .catch((err) => (err instanceof ApiError && err.status === 404 ? setProblem(null) : setLoadError(true)));
  }, [id]);

  // Also runs before every check run (A4: the server runs what is saved). A real save makes the last run stale;
  // an unchanged form is not sent ("same").
  async function persist(): Promise<"saved" | "same" | null> {
    if (!problem || !form) return null;
    if (form.categorySlug === null) {
      setStatus({ ok: false, message: "Pick a role before saving." });
      return null;
    }
    const body = JSON.stringify(
      toAdminProblemDraft({ ...form, categorySlug: form.categorySlug }, checks, problem.hiddenFiles, problem.bugSummary),
    );
    if (body === lastSaved.current) return "same";
    setSaving(true);
    setStatus(null);
    try {
      await api(`/admin/problems/${id}`, { method: "PUT", body });
      lastSaved.current = body;
      return "saved";
    } catch (err) {
      setStatus({ ok: false, message: saveErrorMessage(err) });
      return null;
    } finally {
      setSaving(false);
    }
  }

  // A new version of the draft: the check run panel starts over.
  const changed = () => {
    setProblem((p) => p && { ...p, checksVerified: false });
    setRunKey((k) => k + 1);
  };

  async function save() {
    const result = await persist();
    if (!result) return;
    setStatus({ ok: true, message: "Draft saved." });
    if (result === "saved") changed();
  }

  return (
    <div className="w-full px-6 py-8 wide:mx-auto wide:max-w-[1200px]">
      <Link href="/admin/problems" className="inline-flex items-center gap-1.5 text-sm text-action hover:underline">
        <Icon name="arrowLeft" className="h-3.5 w-3.5" /> Problems
      </Link>
      <h1 className="mt-3 text-3xl font-semibold text-text">Edit problem</h1>

      {loadError ? (
        <p className="mt-8 text-sm text-failed">Could not load the problem. Reload the page.</p>
      ) : problem === undefined ? (
        <p className="mt-8 text-sm text-muted">Loading problem…</p>
      ) : problem === null ? (
        <p className="mt-8 rounded border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          This problem does not exist.
        </p>
      ) : problem.isPublished ? (
        <PublishedBanner
          problem={problem}
          onUnpublished={() => {
            setProblem({ ...problem, isPublished: false, checksVerified: false });
            changed();
          }}
        />
      ) : (
        form && (
          <div className="mt-8">
            <CodeSection
              problemId={problem.id}
              repositoryName={problem.repositoryName}
              paths={problem.paths}
              onReplaced={({ paths, repositoryName }) => {
                setProblem({ ...problem, paths, repositoryName });
                changed();
              }}
            />
            <ReviewStep
              bugSummary={problem.bugSummary || "No AI analysis for this problem."}
              suggestedDifficulty={null}
              form={form}
              onFormChange={(patch) => {
                setForm({ ...form, ...patch });
                setStatus(null);
              }}
              checks={checks}
              onChecksChange={(c) => {
                setChecks(c);
                setStatus(null);
              }}
              canContinue={isReviewComplete(form, checks)}
              onContinue={save}
              continueLabel="Save draft"
              busy={saving}
            />
            {status &&
              (status.ok ? (
                <p role="status" className="mt-4 flex items-center gap-2 text-sm text-passed">
                  <Icon name="check" className="h-4 w-4" /> {status.message}
                </p>
              ) : (
                <ErrorMessage>{status.message}</ErrorMessage>
              ))}
            <div className="mt-8">
              <DryRunPanel
                key={runKey}
                problemId={problem.id}
                verified={problem.checksVerified}
                beforeRun={async () => (await persist()) !== null}
                onPublished={(slug) => setProblem({ ...problem, isPublished: true, slug, checksVerified: true })}
              />
            </div>
          </div>
        )
      )}
    </div>
  );
}

// A3: the code is never edited here - the admin uploads a whole new ZIP, which runs the duplicate check and the
// production test and then replaces every file. Text, checks and hidden tests stay.
function CodeSection({
  problemId,
  repositoryName,
  paths,
  onReplaced,
}: {
  problemId: string;
  repositoryName: string | null;
  paths: string[];
  onReplaced: (code: CodeReplaced) => void;
}) {
  const [replacing, setReplacing] = useState(false);
  const [replaced, setReplaced] = useState(false);

  return (
    <section aria-labelledby="code-heading" className={`${cardClass} mb-8`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="code-heading" className="text-lg font-semibold">
            Code
          </h2>
          <p className="mt-1 truncate text-sm text-muted">
            {repositoryName ?? "No repository name"} · {paths.length} {paths.length === 1 ? "file" : "files"}
          </p>
        </div>
        {!replacing && (
          <button
            type="button"
            onClick={() => {
              setReplacing(true);
              setReplaced(false);
            }}
            className={`${secondaryButton} sm:w-fit`}
          >
            Replace code
          </button>
        )}
      </div>
      {replaced && (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm text-passed">
          <Icon name="check" className="h-4 w-4" /> Code replaced. Check that the descriptions and checks still fit.
        </p>
      )}
      {paths.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No code yet. Upload a ZIP of the codebase.</p>
      ) : (
        <ul className="mt-4 grid max-h-64 gap-x-6 gap-y-1 overflow-y-auto font-mono text-xs text-muted sm:grid-cols-2">
          {paths.map((p) => (
            <li key={p} className="truncate" title={p}>
              {p}
            </li>
          ))}
        </ul>
      )}
      {replacing && (
        <div className="mt-6 border-t border-border pt-6">
          <UploadStep<CodeReplaced>
            url={`/admin/problems/${problemId}/codebase`}
            method="PUT"
            stages={["duplicate", "production"]}
            submitLabel="Replace code"
            onDone={(code) => {
              onReplaced(code);
              setReplacing(false);
              setReplaced(true);
            }}
          />
          <button type="button" onClick={() => setReplacing(false)} className="mt-3 text-sm text-muted hover:text-text">
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}

// A5: a published problem is locked; unpublishing makes it a draft again (republishing runs the checks again).
function PublishedBanner({ problem, onUnpublished }: { problem: AdminProblem; onUnpublished: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function unpublish() {
    setBusy(true);
    setError("");
    try {
      await api(`/admin/problems/${problem.id}/unpublish`, { method: "POST" });
      setConfirming(false);
      onUnpublished();
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : "Could not unpublish. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${cardClass} mt-8 flex flex-col gap-4 sm:flex-row sm:items-center`}>
      <p className="flex min-w-0 flex-1 items-center gap-3 text-sm text-text">
        <Icon name="lock" className="h-5 w-5 shrink-0 text-muted" />
        This problem is published, so it cannot be edited. Unpublish it to make changes.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href={`/problems/${problem.slug}`} className={secondaryButton}>
          View problem
        </Link>
        <button type="button" onClick={() => setConfirming(true)} className={secondaryButton}>
          Unpublish
        </button>
      </div>
      <ConfirmDialog
        open={confirming}
        title="Unpublish this problem?"
        message="Engineers can no longer find or start it. Solves and points stay. Publishing it again runs the checks again."
        confirmLabel="Unpublish"
        busy={busy}
        error={error}
        onConfirm={unpublish}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
