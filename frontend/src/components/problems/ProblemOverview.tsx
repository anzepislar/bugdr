// Overview content of a problem: shown on /problems/[slug] and in the solve page description panel.

type Block =
  { kind: "h"; text: string } | { kind: "p"; text: string } | { kind: "code"; title: string; lines: string[] };

// ponytail: a tiny subset of markdown (## headings, paragraphs, ``` blocks). Swap for a markdown lib if admins need more.
function parseDescription(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let code: Extract<Block, { kind: "code" }> | null = null;
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };

  for (const line of text.split("\n")) {
    if (code) {
      if (line.startsWith("```")) {
        blocks.push(code);
        code = null;
      } else code.lines.push(line);
    } else if (line.startsWith("```")) {
      flush();
      code = { kind: "code", title: line.slice(3).trim(), lines: [] };
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push({ kind: "h", text: line.slice(3) });
    } else if (!line.trim()) flush();
    else para.push(line.trim());
  }
  flush();
  if (code) blocks.push(code);
  return blocks;
}

export function Description({ text }: { text: string }) {
  return (
    <div className="flex flex-col">
      {parseDescription(text).map((b, i) =>
        b.kind === "h" ? (
          <h2 key={i} className="mt-8 text-xl font-semibold text-text first:mt-0">
            {b.text}
          </h2>
        ) : b.kind === "p" ? (
          <p key={i} className="mt-4 leading-relaxed text-muted">
            {b.text}
          </p>
        ) : (
          <figure key={i} className="mt-8 rounded bg-surface px-5 py-4">
            {b.title ? <figcaption className="text-xs text-muted">{b.title}</figcaption> : null}
            <pre className="mt-3 overflow-x-auto text-[13px] leading-6 text-text">{b.lines.join("\n")}</pre>
          </figure>
        ),
      )}
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
