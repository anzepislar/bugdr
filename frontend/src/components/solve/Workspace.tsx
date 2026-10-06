"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { ChecksPanel } from "@/components/solve/ChecksPanel";
import { CodeEditorMock } from "@/components/solve/CodeEditorMock";
import { FileTree } from "@/components/solve/FileTree";
import { mockRunTests, mockStartAttempt } from "@/lib/mock/attempts";
import type { Attempt, CheckRunResult, CheckStatus } from "@/lib/types/attempt";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const pad = (n: number) => String(n).padStart(2, "0");
const clock = (seconds: number) =>
  seconds >= 3600
    ? `${Math.floor(seconds / 3600)}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`
    : `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;

const LANGUAGE: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  json: "JSON",
  md: "Markdown",
  py: "Python",
  go: "Go",
};

const BOTTOM_TABS = ["terminal", "output", "problems"] as const;
type BottomTab = (typeof BOTTOM_TABS)[number];

interface TerminalLine {
  text: string;
  tone: "command" | "pass" | "fail" | "plain";
}
const TONE: Record<TerminalLine["tone"], string> = {
  command: "text-text",
  pass: "text-action",
  fail: "text-highlight",
  plain: "text-muted",
};

const TEST_COMMAND = "npm run test:scenario";
const BRIEF = "README.md";

function firstFile(files: Record<string, string>): string {
  return Object.keys(files).find((p) => p.startsWith("src/")) ?? Object.keys(files)[0];
}

export function Workspace({ slug }: { slug: string }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [activePath, setActivePath] = useState("");
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [statuses, setStatuses] = useState<Record<string, CheckStatus>>({});
  const [results, setResults] = useState<Record<string, CheckRunResult>>({});
  const [selectedCheck, setSelectedCheck] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [bottomTab, setBottomTab] = useState<BottomTab>("terminal");
  const [terminal, setTerminal] = useState<TerminalLine[]>([]);
  const [command, setCommand] = useState("");
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mockStartAttempt(slug).then((a) => {
      if (!a) return;
      const path = firstFile(a.files);
      setAttempt(a);
      setOpenPaths([path, BRIEF].filter((p) => p in a.files));
      setActivePath(path);
    });
  }, [slug]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight });
  }, [terminal]);

  if (!attempt) {
    return <p className="p-8 text-sm text-muted">Preparing your workspace…</p>;
  }

  const elapsed = Math.max(0, Math.floor((now - Date.parse(attempt.startedAt)) / 1000));
  const limit = attempt.timeLimitMinutes * 60;
  const ext = activePath.split(".").pop() ?? "";
  const print = (...lines: TerminalLine[]) => setTerminal((t) => [...t, ...lines]);

  function openFile(path: string) {
    setOpenPaths((paths) => (paths.includes(path) ? paths : [...paths, path]));
    setActivePath(path);
  }

  async function runTests() {
    if (!attempt || running) return;
    setRunning(true);
    setBottomTab("terminal");
    setResults({});
    setSelectedCheck(null);
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
      print(
        { text: `${r.passed ? "PASS" : "FAIL"} ${c.description.toLowerCase()}`, tone: r.passed ? "pass" : "fail" },
        ...(r.output ?? "")
          .split("\n")
          .filter(Boolean)
          .map((text) => ({ text: `  ${text}`, tone: "fail" as const })),
      );
    }
    const failed = all.filter((r) => !r.passed);
    print(
      { text: "", tone: "plain" },
      {
        text: `${all.length - failed.length} passed · ${failed.length} failed · ${all.length} total`,
        tone: failed.length ? "fail" : "pass",
      },
    );
    setSelectedCheck(failed[0]?.checkId ?? null);
    setRunning(false);
    // All checks passed = solved (R4): the detail page now shows the result.
    if (failed.length === 0) router.push(`/problems/${slug}`);
  }

  function submitCommand(e: React.FormEvent) {
    e.preventDefault();
    const cmd = command.trim();
    setCommand("");
    if (!cmd) return;
    if (cmd === TEST_COMMAND || cmd === "npm test") {
      void runTests();
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
    <div className="flex min-h-screen flex-col bg-canvas lg:h-screen lg:overflow-hidden">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 sm:gap-5 sm:px-5">
        <Link href="/dashboard" className="shrink-0">
          <Image src="/logo/bugdr-mark.png" alt="Bugdr" width={90} height={126} className="h-9 w-auto sm:hidden" />
          <Image src="/logo/bugdr-logo.png" alt="Bugdr" width={447} height={126} className="hidden h-10 w-auto sm:block" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-semibold text-text sm:pl-6">{attempt.problemTitle}</h1>
        <span className="hidden rounded bg-action/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-action md:inline">
          Running
        </span>
        <p className="shrink-0 tabular-nums" aria-label="Time elapsed">
          <span className={`text-xl font-semibold ${elapsed >= limit * 0.8 ? "text-failed" : "text-text"}`}>
            {clock(elapsed)}
          </span>
          <span className="ml-1.5 hidden text-xs text-muted sm:inline">/ {clock(limit)}</span>
        </p>
        <button type="button" onClick={giveUp} className="hidden text-sm text-muted hover:text-text md:block">
          Give up
        </button>
        <button
          type="button"
          onClick={() => void runTests()}
          disabled={running}
          className="shrink-0 rounded bg-action px-4 py-2.5 text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-60 sm:px-8"
        >
          {running ? "Running…" : "Run tests"}
        </button>
        <Link
          href={`/problems/${slug}`}
          aria-label="Leave workspace"
          title="Leave workspace (the timer keeps running)"
          className="shrink-0 text-muted hover:text-text"
        >
          <Icon name="x" />
        </Link>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1">
          <nav aria-label="Workspace" className="hidden w-12 shrink-0 flex-col items-center gap-5 bg-canvas py-5 md:flex">
            <ActivityButton
              icon="problems"
              label={explorerOpen ? "Hide explorer" : "Show explorer"}
              active={explorerOpen}
              onClick={() => setExplorerOpen((o) => !o)}
            />
            {/* ponytail: search and extensions are placeholders from the design, nothing behind them yet. */}
            <ActivityButton icon="search" label="Search (coming soon)" disabled />
            <ActivityButton icon="dashboard" label="Extensions (coming soon)" disabled />
          </nav>
          {explorerOpen ? (
            <div className="hidden w-56 shrink-0 overflow-y-auto bg-surface md:block">
              <FileTree
                rootName={attempt.repositoryName.split(" / ").pop() ?? ""}
                paths={Object.keys(attempt.files)}
                activePath={activePath}
                onOpen={openFile}
              />
            </div>
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-11 shrink-0 items-end overflow-x-auto bg-surface" role="tablist" aria-label="Open files">
              {openPaths.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={p === activePath}
                  onClick={() => setActivePath(p)}
                  className={`hidden shrink-0 border-b-2 px-5 py-2.5 text-[13px] md:block ${
                    p === activePath ? "border-action bg-canvas text-text" : "border-transparent text-muted hover:text-text"
                  }`}
                >
                  {p.split("/").pop()}
                </button>
              ))}
              {/* Phones have no explorer or tabs: pick a file here instead. */}
              <select
                aria-label="Open file"
                value={activePath}
                onChange={(e) => openFile(e.target.value)}
                className="m-2 w-full min-w-0 rounded border border-border bg-canvas px-2 py-1.5 text-xs text-text md:hidden"
              >
                {Object.keys(attempt.files).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <p className="shrink-0 truncate bg-canvas px-5 pt-3 text-xs text-muted">{activePath.split("/").join(" › ")}</p>
            <div className="flex h-[55vh] min-h-0 flex-col lg:h-auto lg:flex-1">
              <CodeEditorMock path={activePath} code={attempt.files[activePath] ?? ""} />
            </div>

            <section aria-label="Panel" className="flex h-72 shrink-0 flex-col border-t border-border bg-surface lg:h-[38%]">
              <div role="tablist" aria-label="Panel" className="flex shrink-0 gap-8 px-5">
                {BOTTOM_TABS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={t === bottomTab}
                    onClick={() => setBottomTab(t)}
                    className={`border-b-2 py-3 text-xs font-medium uppercase tracking-wide ${
                      t === bottomTab ? "border-action text-action" : "border-transparent text-muted hover:text-text"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {bottomTab === "terminal" ? (
                <div className="flex min-h-0 flex-1 flex-col font-mono text-[13px] leading-6">
                  <div ref={terminalRef} aria-live="polite" className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
                    {terminal.length === 0 ? (
                      <p className="text-muted">Run the checks with the button above or type `{TEST_COMMAND}`.</p>
                    ) : (
                      terminal.map((l, i) => (
                        <p key={i} className={`min-h-6 whitespace-pre-wrap ${TONE[l.tone]}`}>
                          {l.text}
                        </p>
                      ))
                    )}
                  </div>
                  <form onSubmit={submitCommand} className="flex shrink-0 items-center gap-2 px-5 pb-3">
                    <span aria-hidden className="text-muted">
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
                <p className="px-5 py-3 text-[13px] text-muted">
                  {bottomTab === "output"
                    ? `Workspace started ${new Date(attempt.startedAt).toLocaleTimeString("en-US")}.`
                    : "No problems detected in the workspace."}
                </p>
              )}
            </section>
          </div>
        </div>

        <div className="shrink-0 border-t border-border bg-surface lg:w-80 lg:overflow-y-auto lg:border-l lg:border-t-0">
          <ChecksPanel
            checks={attempt.checks}
            statuses={statuses}
            results={results}
            selectedId={selectedCheck}
            onSelect={setSelectedCheck}
            onOpenBrief={() => openFile(BRIEF)}
          />
        </div>
      </div>

      <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-border bg-surface px-5 text-xs">
        <span className="flex items-center gap-1.5 text-muted">
          main <Icon name="check" className="h-3.5 w-3.5" /> Workspace saved
        </span>
        <span className="ml-auto text-action">{LANGUAGE[ext] ?? "Plain text"} UTF-8 LF</span>
        <button type="button" onClick={giveUp} className="text-muted hover:text-text md:hidden">
          Give up
        </button>
      </footer>
    </div>
  );
}

function ActivityButton({
  icon,
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={onClick ? active : undefined}
      disabled={disabled}
      onClick={onClick}
      className={`${active ? "text-text" : "text-muted"} hover:text-text disabled:cursor-not-allowed disabled:hover:text-muted`}
    >
      <Icon name={icon} className="h-5 w-5" />
    </button>
  );
}
