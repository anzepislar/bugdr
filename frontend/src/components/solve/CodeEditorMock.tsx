import type { ReactNode } from "react";

// ponytail: read-only stand-in for Monaco (@monaco-editor/react), same box and look. Replaced in slice R1,
// which also adds editing and localStorage drafts (D14).

const TOKEN =
  /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(import|from|export|default|async|await|function|const|let|var|return|try|catch|finally|if|else|new|throw|for|of|in|while|class|extends|interface|type|true|false|null|undefined)\b|\b(\d[\d_]*)\b/g;

// One line at a time, so block comments and multi-line strings are not tracked.
function highlight(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const className = m[1] ? "italic text-muted" : m[2] ? "text-highlight" : "text-action";
    out.push(
      <span key={m.index} className={className}>
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

export function CodeEditorMock({ path, code }: { path: string; code: string }) {
  const lines = code.replace(/\n$/, "").split("\n");
  return (
    <div
      role="region"
      aria-label={`Editor: ${path}`}
      tabIndex={0}
      className="min-h-0 flex-1 overflow-auto bg-canvas py-3 font-mono text-[13px] leading-[25px] focus:outline-none"
    >
      <div className="min-w-max">
        {lines.map((line, i) => (
          <div key={i} className="flex">
            <span aria-hidden className="sticky left-0 w-14 shrink-0 select-none bg-canvas pr-6 text-right text-muted/60">
              {i + 1}
            </span>
            <code className="whitespace-pre pr-8 text-text">{highlight(line)}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
