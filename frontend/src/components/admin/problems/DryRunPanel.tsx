"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { ApiError, apiStream } from "@/lib/api";
import type { DryRunEvent } from "@/lib/types/problem";
import { cardClass, ErrorMessage, primaryButton, secondaryButton, Spinner } from "./shared";

type Status = "pending" | "running" | "caught" | "missed";
const LABEL: Record<Status, { text: string; className: string }> = {
  pending: { text: "Waiting", className: "text-muted" },
  running: { text: "Running…", className: "text-pending" },
  caught: { text: "Fails · catches the bug", className: "text-passed" },
  missed: { text: "Passes · misses the bug", className: "text-failed" },
};

/**
 * A4 check run (D20): every check runs against the buggy code in Docker and must fail. `beforeRun` saves the form
 * first (the server runs what is saved) and returns false if saving failed. `verified` = the last run passed and
 * nothing changed since; the parent remounts this panel after every save.
 * A5: with `onPublished`, a Publish button runs the same checks through /publish, which publishes only if all fail.
 */
export function DryRunPanel({
  problemId,
  verified,
  beforeRun,
  onPublished,
}: {
  problemId: string;
  verified: boolean;
  beforeRun: () => Promise<boolean>;
  onPublished?: (slug: string) => void;
}) {
  const [running, setRunning] = useState<"dry-run" | "publish" | null>(null);
  const [checks, setChecks] = useState<{ id: string; description: string }[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const [ok, setOk] = useState<boolean | null>(verified ? true : null);
  const [error, setError] = useState<string | null>(null);

  async function run(mode: "dry-run" | "publish") {
    setRunning(mode);
    setError(null);
    setOk(null);
    setChecks([]);
    setStatuses({});
    setOutputs({});
    try {
      if (!(await beforeRun())) return;
      await apiStream<DryRunEvent>(`/admin/problems/${problemId}/${mode}`, { method: "POST" }, (event) => {
        if (event.type === "checks") {
          setChecks(event.checks);
          setStatuses(Object.fromEntries(event.checks.map((c) => [c.id, "pending" as Status])));
        } else if (event.type === "running") {
          setStatuses((s) => ({ ...s, [event.checkId]: "running" }));
        } else if (event.type === "result") {
          setStatuses((s) => ({ ...s, [event.checkId]: event.passed ? "missed" : "caught" }));
          if (event.output) setOutputs((o) => ({ ...o, [event.checkId]: event.output! }));
        } else if (event.type === "done") {
          setOk(event.ok);
          if (event.published && event.slug) onPublished?.(event.slug);
          else if (event.message) setError(event.message);
        } else {
          setError(event.message);
        }
      });
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : "The checks could not run. Try again.");
    } finally {
      setRunning(null);
    }
  }

  const missed = checks.filter((c) => statuses[c.id] === "missed").length;

  return (
    <section aria-labelledby="dry-run-heading" className={cardClass}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="dry-run-heading" className="text-lg font-semibold">
            Check run
          </h2>
          <p className="mt-1 text-sm text-muted">
            Every check runs against the buggy code and must fail. A check that passes does not catch the bug.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => run("dry-run")}
            disabled={running !== null}
            className={onPublished ? secondaryButton : `${primaryButton} sm:w-fit`}
          >
            {running === "dry-run" && <Spinner />} {ok === null && !checks.length ? "Run checks" : "Run again"}
          </button>
          {onPublished && (
            <button type="button" onClick={() => run("publish")} disabled={running !== null} className={`${primaryButton} font-semibold`}>
              {running === "publish" && <Spinner />} Publish Problem
            </button>
          )}
        </div>
      </div>
      {onPublished && (
        <p className="mt-2 text-xs text-muted">Publish runs the checks again and publishes only if every check fails.</p>
      )}

      {checks.length > 0 && (
        <ul className="mt-4 divide-y divide-border rounded border border-border">
          {checks.map((c) => {
            const label = LABEL[statuses[c.id] ?? "pending"];
            return (
              <li key={c.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="min-w-0 flex-1 text-sm text-text">{c.description}</span>
                  <span className={`shrink-0 text-xs font-medium ${label.className}`}>{label.text}</span>
                </div>
                {outputs[c.id] && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted hover:text-text">Output</summary>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-canvas p-3 font-mono text-xs text-muted">
                      {outputs[c.id]}
                    </pre>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {ok === true && (
        <p role="status" className="mt-4 flex items-center gap-2 text-sm text-passed">
          <Icon name="check" className="h-4 w-4 shrink-0" />
          {checks.length ? `All ${checks.length} checks fail on the buggy code.` : "The last run passed and nothing changed since."}
        </p>
      )}
      {ok === false && (
        <ErrorMessage>
          {missed === 1 ? "1 check passes" : `${missed} checks pass`} on the buggy code. Change or remove{" "}
          {missed === 1 ? "it" : "them"} and run again.
        </ErrorMessage>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </section>
  );
}
