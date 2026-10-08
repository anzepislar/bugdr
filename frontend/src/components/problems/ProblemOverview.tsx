// Overview content of a problem: shown on /problems/[slug] and in the solve page description panel.

// Codebase context (what the system does) + incident report (symptoms only) — 02_problems.md. Never expected behavior.
export function Description({ codebaseContext, incidentReport }: { codebaseContext: string; incidentReport: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-text">Your assignment</h2>
      {codebaseContext.split(/\n\s*\n/).map((para, i) => (
        <p key={i} className="mt-4 leading-relaxed text-muted">
          {para.replace(/\s*\n\s*/g, " ")}
        </p>
      ))}
      <h2 className="mt-8 text-lg font-semibold text-text">What the team is seeing</h2>
      <figure className="mt-4 rounded border border-border bg-[#0d1117] p-4">
        <figcaption className="text-xs text-muted">incident log</figcaption>
        <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-sm leading-6 text-[#d4d4d4]">
          {incidentReport}
        </pre>
      </figure>
    </div>
  );
}

export function AcceptanceChecks({ checks }: { checks: string[] }) {
  return (
    <section aria-labelledby="checks-heading" className="mt-10">
      <h2 id="checks-heading" className="text-xl font-semibold text-text">
        Acceptance checks <span className="text-sm font-normal text-muted">{checks.length}</span>
      </h2>
      <ul className="mt-4 grid gap-x-8 gap-y-3 text-sm text-muted sm:grid-cols-2">
        {checks.map((c) => (
          <li key={c} className="flex items-center gap-3">
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-action" />
            {c}
          </li>
        ))}
      </ul>
    </section>
  );
}
