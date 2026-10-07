import type { Attempt, CheckRunResult, CheckStatus } from "@/lib/types/attempt";

const DOT: Record<CheckStatus, string> = {
  pending: "border border-muted",
  running: "animate-pulse bg-pending",
  passed: "bg-passed",
  failed: "bg-failed",
};
const LABEL: Record<CheckStatus, string> = { pending: "Not run", running: "Running", passed: "Passed", failed: "Failed" };

// "Test Results" tab of the solve page's bottom panel.
export function ChecksPanel({
  checks,
  statuses,
  results,
}: {
  checks: Attempt["checks"];
  statuses: Record<string, CheckStatus>;
  results: Record<string, CheckRunResult>;
}) {
  const passed = checks.filter((c) => statuses[c.id] === "passed").length;
  const ran = checks.some((c) => statuses[c.id]);

  return (
    <div className="px-5 py-3 text-[13px]">
      <p aria-live="polite" className="text-muted">
        {ran ? `${passed} of ${checks.length} passed` : "Not run yet. Submit to run the checks."}
      </p>
      <ul className="mt-2">
        {checks.map((c) => {
          const status = statuses[c.id] ?? "pending";
          const output = results[c.id]?.output;
          return (
            <li key={c.id} className="py-1.5">
              <div className="flex items-center gap-3">
                <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${DOT[status]}`} />
                <span className="min-w-0 flex-1 text-text">{c.description}</span>
                <span className="shrink-0 text-xs text-muted">{LABEL[status]}</span>
              </div>
              {output ? <p className="ml-5 mt-1 whitespace-pre-line font-mono text-xs text-failed">{output}</p> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
