"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { ApiError, apiStream } from "@/lib/api";
import type { UploadStage, UploadStageEvent } from "@/lib/types/problem";
import { ErrorMessage, Spinner, cardClass, primaryButton } from "./shared";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Upload pipeline stages, in the order the server runs them (A10 analyze runs all three, A3 code replacement the first two).
const STAGES: Record<UploadStage, { name: string; description: string }> = {
  duplicate: { name: "Duplicate Check", description: "Verifying this codebase hasn't been added before" },
  production: { name: "Production Test", description: "Checking that the code loads under Node 24 without npm packages" },
  analysis: { name: "AI Analysis", description: "Generating problem description, checks and metadata" },
};
const ZIP_MAX_BYTES = 10 * 1024 * 1024; // D21, same limit as the server

type StageStatus = "pending" | "running" | "passed" | "failed" | "skipped";

interface Props<Done> {
  /** Upload URL without the query; the ZIP's name is added as ?name=. */
  url: string;
  method: "POST" | "PUT";
  stages: UploadStage[];
  submitLabel: string;
  /** The stream's last line ({ type: "done", ... }) after every stage passed. */
  onDone: (event: Done) => void;
}

export function UploadStep<Done extends { type: "done" }>({ url, method, stages, submitLabel, onDone }: Props<Done>) {
  const PIPELINE = stages.map((stage) => ({ stage, ...STAGES[stage] }));
  const IDLE: StageStatus[] = stages.map(() => "pending");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<StageStatus[]>(IDLE);
  const [failure, setFailure] = useState<string | null>(null);
  const running = statuses.includes("running") || statuses.every((s) => s === "passed");

  function accept(selected: File | undefined) {
    if (!selected || running) return;
    if (!selected.name.toLowerCase().endsWith(".zip")) {
      setFileError("Only .zip files are accepted.");
      return;
    }
    if (selected.size > ZIP_MAX_BYTES) {
      setFileError("The ZIP is larger than 10 MB.");
      return;
    }
    setFileError(null);
    setFile(selected);
    setStatuses(IDLE);
    setFailure(null);
  }

  // The server runs all stages in one request and streams each stage's status.
  async function analyze() {
    if (!file) return;
    setFailure(null);
    const next: StageStatus[] = [...IDLE];
    next[0] = "running";
    setStatuses([...next]);
    const fail = (i: number, message: string) => {
      next[i] = "failed";
      next.fill("skipped", i + 1);
      setStatuses([...next]);
      setFailure(message);
    };
    let done: Done | null = null;
    try {
      await apiStream<UploadStageEvent | Done>(
        `${url}?name=${encodeURIComponent(file.name)}`,
        { method, body: file, headers: { "Content-Type": "application/zip" } },
        (event) => {
          if (event.type === "done") {
            done = event as Done;
            return;
          }
          const i = PIPELINE.findIndex((p) => p.stage === event.stage);
          if (event.status === "failed") return fail(i, event.message ?? "Something went wrong.");
          next[i] = event.status;
          setStatuses([...next]);
        },
      );
    } catch (error) {
      // Rejected before the pipeline started: not a ZIP, unsafe paths, too large.
      return fail(
        0,
        error instanceof ApiError && error.status === 413
          ? "The ZIP is larger than 10 MB."
          : error instanceof ApiError && error.status < 500
            ? error.message
            : "Could not upload the ZIP. Try again.",
      );
    }
    const result = done as Done | null;
    if (!result) {
      if (!next.includes("failed")) fail(Math.max(0, next.indexOf("running")), "The connection was lost. Try again.");
      return;
    }
    // Let the last green check register before the page moves on.
    setTimeout(() => onDone(result), 600);
  }

  return (
    <div className="space-y-8">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          if (!running) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files[0]);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-surface p-12 text-center focus-within:border-action ${
          running ? "cursor-default" : "cursor-pointer hover:border-action"
        } ${dragging ? "border-action" : "border-border"}`}
      >
        <input
          type="file"
          accept=".zip,application/zip"
          disabled={running}
          className="sr-only"
          onChange={(e) => accept(e.target.files?.[0])}
        />
        {file ? (
          <>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-passed/15 text-passed">
              <Icon name="check" />
            </span>
            <span className="max-w-full break-all font-mono text-base font-medium text-text">{file.name}</span>
            <span className="text-sm text-muted">
              {formatBytes(file.size)}
              {!running && <> · <span className="text-action">Choose another file</span></>}
            </span>
          </>
        ) : (
          <>
            <Icon name="upload" className="h-8 w-8 text-muted" />
            <span className="mt-1 text-base font-medium text-text">Drop your codebase here</span>
            <span className="text-sm text-muted">
              Upload a ZIP file of the repository · <span className="text-action">Browse files</span>
            </span>
          </>
        )}
      </label>
      {fileError && <ErrorMessage>{fileError}</ErrorMessage>}

      {file && (
        <section>
          <h2 className="text-lg font-semibold">Analysis pipeline</h2>
          <ol className="mt-4 divide-y divide-border rounded border border-border bg-surface">
            {PIPELINE.map((stage, i) => (
              <PipelineRow
                key={stage.stage}
                n={i + 1}
                name={stage.name}
                description={stage.description}
                status={statuses[i]}
                failure={statuses[i] === "failed" ? failure : null}
                onRetry={analyze}
              />
            ))}
          </ol>
        </section>
      )}

      <button type="button" onClick={analyze} disabled={!file || running || failure !== null} className={`${primaryButton} w-full py-3`}>
        {running && <Spinner />} {submitLabel}
      </button>
    </div>
  );
}

const STATUS_TEXT: Partial<Record<StageStatus, { text: string; className: string }>> = {
  running: { text: "Running...", className: "text-text" },
  passed: { text: "Passed", className: "text-passed" },
  failed: { text: "Failed", className: "text-failed" },
  skipped: { text: "Skipped", className: "text-muted" },
};

function PipelineRow({
  n,
  name,
  description,
  status,
  failure,
  onRetry,
}: {
  n: number;
  name: string;
  description: string;
  status: StageStatus;
  failure: string | null;
  onRetry: () => void;
}) {
  const label = STATUS_TEXT[status];
  const dim = status === "pending" || status === "skipped";
  return (
    <li className="p-4">
      <div className="flex items-start gap-3">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
            status === "passed"
              ? "bg-passed text-canvas"
              : status === "failed"
                ? "bg-failed text-canvas"
                : status === "running"
                  ? "text-action"
                  : "border border-border text-muted"
          }`}
        >
          {status === "passed" ? (
            <Icon name="check" className="h-4 w-4" />
          ) : status === "failed" ? (
            <Icon name="x" className="h-4 w-4" />
          ) : status === "running" ? (
            <Spinner />
          ) : (
            n
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${dim ? "text-muted" : "text-text"}`}>{name}</p>
          <p className="text-sm text-muted">{description}</p>
        </div>
        {label && <span className={`shrink-0 text-sm ${label.className}`}>{label.text}</span>}
      </div>
      {failure && (
        <div role="alert" className={`${cardClass} mt-3 border-failed/40 sm:ml-10`}>
          <p className="text-sm font-medium text-failed">{name} failed</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-failed">{failure}</p>
          <button type="button" onClick={onRetry} className={`${primaryButton} mt-4`}>
            Try again
          </button>
        </div>
      )}
    </li>
  );
}
