"use client";

import { useState } from "react";
import { ErrorMessage, primaryButton } from "./shared";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface Props {
  file: File | null;
  onFileChange: (file: File) => void;
  onAnalyze: () => void;
}

export function UploadStep({ file, onFileChange, onAnalyze }: Props) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function accept(selected: File | undefined) {
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".zip")) {
      setError("Only .zip files are accepted.");
      return;
    }
    setError(null);
    onFileChange(selected);
  }

  return (
    <section>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files[0]);
        }}
        className={`flex min-h-[50vh] cursor-pointer flex-col items-center justify-center gap-3 rounded border-2 border-dashed px-6 text-center focus-within:border-action ${
          dragging ? "border-action bg-surface" : "border-border hover:border-action"
        }`}
      >
        <input
          type="file"
          accept=".zip,application/zip"
          className="sr-only"
          onChange={(e) => accept(e.target.files?.[0])}
        />
        <span className="text-lg font-medium">Drop the buggy codebase here</span>
        <span className="text-sm text-muted">or click to choose a file · ZIP only</span>
        {file && (
          <span className="mt-2 rounded border border-border bg-surface px-3 py-1.5 font-mono text-sm">
            {file.name} · {formatBytes(file.size)}
          </span>
        )}
      </label>

      {error && <ErrorMessage>{error}</ErrorMessage>}

      <div className="mt-6 flex justify-end">
        <button type="button" onClick={onAnalyze} disabled={!file} className={primaryButton}>
          Upload and Analyze
        </button>
      </div>
    </section>
  );
}
