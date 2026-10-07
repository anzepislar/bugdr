"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Icon } from "@/components/Icon";
import { AcceptanceChecks, Description } from "@/components/problems/ProblemOverview";
import { ChecksPanel } from "@/components/solve/ChecksPanel";
import { CodeEditorMock } from "@/components/solve/CodeEditorMock";
import { mockRunTests, mockStartAttempt } from "@/lib/mock/attempts";
import type { Attempt, CheckRunResult, CheckStatus } from "@/lib/types/attempt";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const pad = (n: number) => String(n).padStart(2, "0");
const clock = (seconds: number) =>
  seconds >= 3600
    ? `${Math.floor(seconds / 3600)}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`
    : `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;

// ponytail: the selector only shows the language; Monaco (slice R1) sets it from the file.
const LANGUAGES = ["TypeScript", "JavaScript", "Python", "Go", "JSON", "Markdown"];
const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  py: "Python",
  go: "Go",
  json: "JSON",
  md: "Markdown",
};

const BOTTOM_TABS = { terminal: "Terminal", results: "Test Results" } as const;
type BottomTab = keyof typeof BOTTOM_TABS;

interface TerminalLine {
  text: string;
  tone: "command" | "pass" | "fail" | "plain";
}
const TONE: Record<TerminalLine["tone"], string> = {
  command: "text-text",
  pass: "text-passed",
  fail: "text-failed",
  plain: "text-[#858585]",
};

const TEST_COMMAND = "npm run test:scenario";
const MIN_PANEL = 300; // px, both the description panel and the editor

function firstFile(files: Record<string, string>): string {
  return Object.keys(files).find((p) => p.startsWith("src/")) ?? Object.keys(files)[0];
}

export function Workspace({ slug, description, checks }: { slug: string; description: string; checks: string[] }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [activePath, setActivePath] = useState("");
  const [statuses, setStatuses] = useState<Record<string, CheckStatus>>({});
  const [results, setResults] = useState<Record<string, CheckRunResult>>({});
  const [running, setRunning] = useState(false);
  const [bottomTab, setBottomTab] = useState<BottomTab>("terminal");
  const [terminal, setTerminal] = useState<TerminalLine[]>([]);
  const [command, setCommand] = useState("");
  // Description panel: null width = the 40% default until the user drags.
  const [panelWidth, setPanelWidth] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Entry animation: the description starts full width (like the detail page) and the editor slides in.
  const [opening, setOpening] = useState(true);
  const splitRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mockStartAttempt(slug).then((a) => {
      if (!a) return;
      setAttempt(a);
      setActivePath(firstFile(a.files));
    });
  }, [slug]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!attempt) return;
    // Two frames, so the full-width panel is painted before the width transition starts.
    let id = requestAnimationFrame(() => (id = requestAnimationFrame(() => setOpening(false))));
    return () => cancelAnimationFrame(id);
  }, [attempt]);

  useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight });
  }, [terminal]);

  if (!attempt) {
    return <p className="p-8 text-sm text-muted">Preparing your workspace…</p>;
  }

  const elapsed = Math.max(0, Math.floor((now - Date.parse(attempt.startedAt)) / 1000));
  const limit = attempt.timeLimitMinutes * 60;
  const print = (...lines: TerminalLine[]) => setTerminal((t) => [...t, ...lines]);

  function resize(e: PointerEvent<HTMLDivElement>) {
    const box = splitRef.current?.getBoundingClientRect();
    if (!dragging || !box) return;
    const max = Math.max(MIN_PANEL, box.width - MIN_PANEL);
    setPanelWidth(Math.min(max, Math.max(MIN_PANEL, e.clientX - box.left)));
  }

  async function submit() {
    if (!attempt || running) return;
    setRunning(true);
    setBottomTab("results");
    setResults({});
    setStatuses(Object.fromEntries(attempt.checks.map((c) => [c.id, "pending" as const])));
    print({ text: `$ ${TEST_COMMAND}`, tone: "command" });

    const all = await mockRunTests(attempt);
    // ponytail: results arrive at once and are revealed one by one; R6 streams them per check.
    for (const c of attempt.checks) {
      setStatuses((s) => ({ ...s, [c.id]: "running" }));
      await delay(250);
      const r = all.find((x) => x.checkId === c.id);
      if (!r) continue;
      setStatuses((s) => ({ ...s, [c.id]: r.passed ? "passed" : "failed" }));
      setResults((prev) => ({ ...prev, [c.id]: r }));
      print({ text: `${r.passed ? "PASS" : "FAIL"} ${c.description.toLowerCase()}`, tone: r.passed ? "pass" : "fail" });
    }
    const failed = all.filter((r) => !r.passed).length;
    print(
      { text: "", tone: "plain" },
      { text: `${all.length - failed} passed · ${failed} failed · ${all.length} total`, tone: failed ? "fail" : "pass" },
    );
    setRunning(false);
    // All checks passed = solved (R4): the detail page now shows the result.
    if (failed === 0) router.push(`/problems/${slug}`);
  }

  function submitCommand(e: React.FormEvent) {
    e.preventDefault();
    const cmd = command.trim();
    setCommand("");
    if (!cmd) return;
    if (cmd === TEST_COMMAND || cmd === "npm test") {
      void submit();
      return;
    }
    // ponytail: no container behind the terminal yet; slice R5 runs commands for real (D13).
    print({ text: `$ ${cmd}`, tone: "command" }, { text: "The terminal connects to your workspace container soon.", tone: "plain" });
  }

  function giveUp() {
    // ponytail: mock of POST /attempts/:id/give-up (slice R2).
    if (window.confirm("Give up this problem? You can start it again later, but the timer restarts.")) {
      router.push(`/problems/${slug}`);
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-canvas">
      <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border bg-surface px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/dashboard" className="shrink-0">
            <Image src="/logo/bugdr-mark.png" alt="Bugdr" width={90} height={126} className="h-7 w-auto sm:hidden" />
            <Image src="/logo/bugdr-logo.png" alt="Bugdr" width={447} height={126} className="hidden h-7 w-auto sm:block" />
          </Link>
          <h1 className="hidden min-w-0 truncate text-sm font-semibold text-text md:block">{attempt.problemTitle}</h1>
        </div>
        <p
          aria-label="Time elapsed"
          title={`Time limit ${clock(limit)}`}
          className={`text-sm font-semibold tabular-nums ${elapsed >= limit * 0.8 ? "text-failed" : "text-text"}`}
        >
          {clock(elapsed)}
        </p>
        <div className="flex items-center justify-end gap-2 sm:gap-3">
          <button type="button" onClick={giveUp} className="px-2 py-1.5 text-sm text-muted hover:text-text">
            Give up
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={running}
            className="rounded bg-action px-3 py-1.5 text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-60 sm:px-5"
          >
            {running ? "Running…" : "Submit"}
          </button>
        </div>
      </header>

      <div
        ref={splitRef}
        className="flex min-h-0 flex-1"
        style={{ "--panel-w": panelWidth === null ? "40%" : `${panelWidth}px` } as React.CSSProperties}
      >
        {/* Below md the open panel takes the whole width; the chevron switches to the editor. */}
        <section
          aria-label="Problem description"
          aria-hidden={collapsed}
          className={`relative shrink-0 overflow-hidden bg-canvas ${
            dragging ? "" : "transition-all duration-500 ease-out motion-reduce:transition-none"
          } ${collapsed ? "w-0" : opening ? "w-full" : "w-full md:w-[var(--panel-w)] md:min-w-[300px]"
          }`}
        >
          <div className="h-full overflow-y-auto px-6 py-6 pr-10">
            <Description text={description} />
            <AcceptanceChecks checks={checks} />
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Hide description"
            title="Hide description"
            className="absolute right-0 top-1/2 flex h-10 w-6 -translate-y-1/2 items-center justify-center rounded-l border border-r-0 border-border bg-surface text-muted hover:text-action"
          >
            <Icon name="chevronLeft" className="h-4 w-4" />
          </button>
        </section>

        {collapsed ? null : (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize description"
            onPointerDown={(e) => {
              e.preventDefault(); // no text selection while dragging
              e.currentTarget.setPointerCapture(e.pointerId);
              setDragging(true);
            }}
            onPointerMove={resize}
            onPointerUp={() => setDragging(false)}
            className={`hidden w-1 shrink-0 cursor-col-resize touch-none hover:bg-action md:block ${
              dragging ? "bg-action" : "bg-border"
            }`}
          />
        )}

        <div className={`relative min-w-0 flex-1 flex-col bg-[#1e1e1e] ${collapsed ? "flex" : "hidden md:flex"}`}>
          {collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label="Show description"
              title="Show description"
              className="absolute left-0 top-1/2 z-10 flex h-10 w-6 -translate-y-1/2 items-center justify-center rounded-r border border-l-0 border-border bg-surface text-muted hover:text-action"
            >
              <Icon name="chevronRight" className="h-4 w-4" />
            </button>
          ) : null}

          <div className="flex h-9 shrink-0 items-stretch bg-[#252526]">
            <div role="tablist" aria-label="Files" className="flex min-w-0 flex-1 overflow-x-auto">
              {Object.keys(attempt.files).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={p === activePath}
                  title={p}
                  onClick={() => setActivePath(p)}
                  className={`shrink-0 border-t-2 px-4 text-[13px] ${
                    p === activePath
                      ? "border-action bg-[#1e1e1e] text-text"
                      : "border-transparent text-[#858585] hover:text-text"
                  }`}
                >
                  {p.split("/").pop()}
                </button>
              ))}
            </div>
            <select
              key={activePath}
              aria-label="Language"
              defaultValue={LANGUAGE_BY_EXT[activePath.split(".").pop() ?? ""] ?? LANGUAGES[0]}
              className="m-1 shrink-0 rounded border border-border bg-[#1e1e1e] px-2 text-xs text-muted"
            >
              {LANGUAGES.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <CodeEditorMock path={activePath} code={attempt.files[activePath] ?? ""} />
          </div>

          {/* ponytail: drag handle is visual only; resizing the bottom panel comes later. */}
          <div aria-hidden className="h-1 shrink-0 cursor-row-resize bg-border hover:bg-action" />
          <section aria-label="Panel" className="flex h-[200px] shrink-0 flex-col bg-[#1e1e1e]">
            <div role="tablist" aria-label="Panel" className="flex shrink-0 gap-6 border-b border-border bg-[#252526] px-4">
              {(Object.keys(BOTTOM_TABS) as BottomTab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={t === bottomTab}
                  onClick={() => setBottomTab(t)}
                  className={`border-b-2 py-2 text-xs font-medium ${
                    t === bottomTab ? "border-action text-text" : "border-transparent text-[#858585] hover:text-text"
                  }`}
                >
                  {BOTTOM_TABS[t]}
                </button>
              ))}
            </div>
            {bottomTab === "terminal" ? (
              <div className="flex min-h-0 flex-1 flex-col font-mono text-[13px] leading-6">
                <div ref={terminalRef} aria-live="polite" className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
                  {terminal.length === 0 ? (
                    <p className="text-[#858585]">Submit to run the checks, or type `{TEST_COMMAND}`.</p>
                  ) : (
                    terminal.map((l, i) => (
                      <p key={i} className={`min-h-6 whitespace-pre-wrap ${TONE[l.tone]}`}>
                        {l.text}
                      </p>
                    ))
                  )}
                </div>
                <form onSubmit={submitCommand} className="flex shrink-0 items-center gap-2 px-4 pb-2">
                  <span aria-hidden className="text-[#858585]">
                    $
                  </span>
                  <input
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    aria-label="Terminal command"
                    spellCheck={false}
                    autoComplete="off"
                    className="min-w-0 flex-1 bg-transparent text-text focus:outline-none"
                  />
                </form>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <ChecksPanel checks={attempt.checks} statuses={statuses} results={results} />
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
