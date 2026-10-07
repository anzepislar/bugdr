"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { mockAnalyzeProblem, mockCheckDuplicate, mockProductionTest } from "@/lib/mock/adminProblems";
import type { ProblemAnalysis } from "@/lib/types/problem";
import { ErrorMessage, Spinner, cardClass, primaryButton } from "./shared";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const PIPELINE = [
  { name: "Duplicate Check", description: "Verifying this codebase hasn't been added before", run: mockCheckDuplicate },
  { name: "Production Test", description: "Checking if the codebase runs successfully", run: mockProductionTest },
  { name: "AI Analysis", description: "Generating problem description, checks and metadata", run: mockAnalyzeProblem },
];

type StageStatus = "pending" | "running" | "passed" | "failed" | "skipped";
const IDLE: StageStatus[] = PIPELINE.map(() => "pending");

interface Props {
  onAnalyzed: (file: File, analysis: ProblemAnalysis) => void;
}

export function UploadStep({ onAnalyzed }: Props) {
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
    setFileError(null);
    setFile(selected);
    setStatuses(IDLE);
    setFailure(null);
  }

  async function analyze() {
    if (!file) return;
    setFailure(null);
    const next = [...IDLE];
    let analysis: ProblemAnalysis | null = null;
    for (let i = 0; i < PIPELINE.length; i++) {
      next[i] = "running";
      setStatuses([...next]);
      try {
        const result = await PIPELINE[i].run(file);
        if (result) analysis = result;
        next[i] = "passed";
      } catch (error) {
        next[i] = "failed";
        next.fill("skipped", i + 1);
        setStatuses([...next]);
        setFailure(error instanceof Error && error.message ? error.message : "Something went wrong.");
        return;
      }
      setStatuses([...next]);
    }
    // Let the last green check register before the page moves on.
    setTimeout(() => analysis && onAnalyzed(file, analysis), 600);
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
                key={stage.name}
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
        {running && <Spinner />} Analyze Codebase
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
          <p className="mt-1 text-sm text-failed">{failure}</p>
          <button type="button" onClick={onRetry} className={`${primaryButton} mt-4`}>
            Try again
          </button>
        </div>
      )}
    </li>
  );
}
