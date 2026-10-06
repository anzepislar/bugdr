import { Icon } from "@/components/Icon";
import type { Attempt, CheckRunResult, CheckStatus } from "@/lib/types/attempt";

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "passed") {
    return (
      <span className="flex h-[18px] w-[18px] items-center justify-center rounded bg-action text-canvas">
        <Icon name="check" className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex h-[18px] w-[18px] items-center justify-center rounded bg-failed/15 text-failed">
        <Icon name="x" className="h-3 w-3" />
      </span>
    );
  }
  if (status === "running") return <span className="h-[18px] w-[18px] animate-pulse rounded bg-pending/40" />;
  return <span className="h-[18px] w-[18px] rounded border border-border" />;
}

export function ChecksPanel({
  checks,
  statuses,
  results,
  selectedId,
  onSelect,
  onOpenBrief,
}: {
  checks: Attempt["checks"];
  statuses: Record<string, CheckStatus>;
  results: Record<string, CheckRunResult>;
  selectedId: string | null;
  onSelect: (checkId: string) => void;
  onOpenBrief: () => void;
}) {
  const passed = checks.filter((c) => statuses[c.id] === "passed").length;
  const done = checks.every((c) => statuses[c.id] === "passed" || statuses[c.id] === "failed");
  const badge = !done
    ? "bg-border/50 text-muted"
    : passed === checks.length
      ? "bg-passed/15 text-passed"
      : "bg-failed/15 text-failed";
  const selected = selectedId ? checks.find((c) => c.id === selectedId) : undefined;

  return (
    <aside aria-labelledby="checks-heading" className="flex flex-col px-5 py-6">
      <h2 id="checks-heading" className="text-lg font-semibold text-text">
        Scenario checks
      </h2>
      <p aria-live="polite" className={`mt-3 self-start rounded px-2 py-1 text-xs font-semibold ${badge}`}>
        {done ? `${passed} of ${checks.length} passed` : Object.keys(results).length ? "Running…" : "Not run yet"}
      </p>

      <ul className="mt-6 flex flex-col gap-1">
        {checks.map((c) => {
          const status = statuses[c.id] ?? "pending";
          const content = (
            <>
              <StatusIcon status={status} />
              <span className="min-w-0 flex-1">{c.description}</span>
            </>
          );
          return (
            <li key={c.id}>
              {status === "failed" ? (
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  aria-pressed={c.id === selectedId}
                  className={`flex w-full items-center gap-4 rounded px-2 py-2.5 text-left text-sm text-text ${
                    c.id === selectedId ? "bg-border/50" : "hover:bg-border/30"
                  }`}
                >
                  {content}
                </button>
              ) : (
                <div className="flex items-center gap-4 px-2 py-2.5 text-sm text-text">
                  {content}
                  <span className="sr-only">{status}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {selected && results[selected.id]?.output ? (
        <section aria-labelledby="failure-heading" className="mt-6 border-t border-border pt-6">
          <h3 id="failure-heading" className="font-semibold text-text">
            Failure details
          </h3>
          <p className="mt-3 text-sm text-muted">{selected.description}</p>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{results[selected.id].output}</p>
        </section>
      ) : null}

      <button
        type="button"
        onClick={onOpenBrief}
        className="mt-8 rounded border border-border px-4 py-2.5 text-left text-sm text-text hover:border-action"
      >
        Open incident brief
      </button>
    </aside>
  );
}
