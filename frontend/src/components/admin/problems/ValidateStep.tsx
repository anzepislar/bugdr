"use client";

import type { Check, CheckValidationResult } from "@/lib/types/problem";
import { ErrorMessage, Spinner, cardClass, primaryButton } from "./shared";

interface Props {
  checks: Check[];
  results: Record<string, CheckValidationResult> | null;
  runningCheckId: string | null;
  validating: boolean;
  complete: boolean;
  passed: boolean;
  error: string | null;
  onValidate: () => void;
}

export function ValidateStep({ checks, results, runningCheckId, validating, complete, passed, error, onValidate }: Props) {
  const passingOnBuggy = checks.filter((c) => results?.[c.id]?.passed).length;

  return (
    <div className="space-y-6">
      <section className={cardClass}>
        <h2 className="text-lg font-semibold">Validate against the buggy code</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Runs every check on the uploaded codebase. All checks must fail - that confirms the bug is real.
        </p>
        <button type="button" onClick={onValidate} disabled={validating} className={`${primaryButton} mt-4`}>
          {validating ? (
            <>
              <Spinner /> Validating…
            </>
          ) : results ? (
            "Run validation again"
          ) : (
            "Validate Problem"
          )}
        </button>
        {error && <ErrorMessage>{error}</ErrorMessage>}
      </section>

      {complete &&
        (passed ? (
          <p role="status" className="rounded border border-passed/40 px-4 py-3 text-sm text-passed">
            Validation passed - all {checks.length} checks fail on the buggy code.
          </p>
        ) : (
          <p role="status" className="rounded border border-highlight/40 px-4 py-3 text-sm text-highlight">
            {passingOnBuggy} of {checks.length} checks pass on the buggy code. Fix or remove them in Review, then
            validate again.
          </p>
        ))}

      <ul className="space-y-3">
        {checks.map((check, index) => {
          const result = results?.[check.id];
          return (
            <li key={check.id} className={cardClass}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="text-muted">#{index + 1}</span> {check.description}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-muted">{check.checkCommand}</p>
                </div>
                <CheckStatus
                  result={result}
                  running={runningCheckId === check.id}
                  queued={validating && !result}
                />
              </div>
              {result?.passed && (
                <p className="mt-3 text-sm text-highlight">
                  This check passes on the buggy code — it may not be testing the right thing
                </p>
              )}
              {result && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-muted">Output</summary>
                  <pre className="mt-2 overflow-auto rounded border border-border bg-canvas p-3 font-mono text-xs">
                    {result.output}
                  </pre>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CheckStatus({
  result,
  running,
  queued,
}: {
  result: CheckValidationResult | undefined;
  running: boolean;
  queued: boolean;
}) {
  if (result) {
    return result.passed ? (
      <span className="shrink-0 text-sm font-medium text-highlight">Passes on buggy code</span>
    ) : (
      <span className="shrink-0 text-sm font-medium text-passed">✓ Fails on buggy code</span>
    );
  }
  if (running) {
    return (
      <span className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-pending">
        <Spinner /> Running
      </span>
    );
  }
  return <span className="shrink-0 text-sm text-muted">{queued ? "Pending" : "Not run"}</span>;
}
