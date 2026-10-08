"use client";

import Editor from "@monaco-editor/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Icon } from "@/components/Icon";
import { AcceptanceChecks, Description } from "@/components/problems/ProblemOverview";
import { AiChatPanel } from "@/components/solve/AiChatPanel";
import { ChecksPanel } from "@/components/solve/ChecksPanel";
import { useSessionTracker } from "@/hooks/useSessionTracker";
import { api, ApiError, apiStream } from "@/lib/api";
import type { Attempt, CheckRunResult, CheckStatus, TestRunEvent } from "@/lib/types/attempt";
import type { Difficulty } from "@/lib/types/problem";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const pad = (n: number) => String(n).padStart(2, "0");
const clock = (seconds: number) =>
  seconds >= 3600
    ? `${Math.floor(seconds / 3600)}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`
    : `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;

// ponytail: the selector only shows the language; Monaco detects it from the file extension.
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
  tone: "command" | "output" | "pass" | "fail" | "plain";
  /** Command output that has not ended with a newline yet: the next chunk continues it. */
  open?: boolean;
}
const TONE: Record<TerminalLine["tone"], string> = {
  command: "text-text",
  output: "text-[#cccccc]",
  pass: "text-passed",
  fail: "text-failed",
  plain: "text-[#858585]",
};

/** One line of the terminal stream, POST /attempts/:id/terminal (R5). */
type TerminalEvent =
  | { type: "output"; text: string }
  | { type: "exit"; code: number }
  | { type: "stopped"; reason: "timeout" | "output" | "aborted" };

const STOPPED: Record<Extract<TerminalEvent, { type: "stopped" }>["reason"], string> = {
  timeout: "Stopped: commands run for at most 30 seconds.",
  output: "Stopped: the command printed too much output.",
  aborted: "^C",
};

/** Appends streamed output: the first part continues an open line, every newline starts a new one. */
function appendOutput(lines: TerminalLine[], text: string): TerminalLine[] {
  const parts = text.split("\n");
  const next = [...lines];
  const last = next.at(-1);
  if (last?.open) next[next.length - 1] = { ...last, text: last.text + parts[0] };
  else next.push({ text: parts[0], tone: "output", open: true });
  for (const part of parts.slice(1)) {
    next[next.length - 1] = { ...next[next.length - 1], open: false };
    next.push({ text: part, tone: "output", open: true });
  }
  return next;
}
// px. All three panels are always side by side; 80 + 120 + 80 still fits a 320px screen.
const MIN_DESCRIPTION = 80;
const MIN_EDITOR = 120;
const MIN_CHAT = 80;

// D14: unsaved edits live in the browser, per attempt. started_at is part of the key, so a restart after
// giving up (D8, same attempt id) begins from the original code.
const draftKey = (a: Attempt) => `bugdr:draft:${a.id}:${a.startedAt}`;

function readDraft(a: Attempt): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(draftKey(a)) ?? "{}");
  } catch {
    return {};
  }
}

function firstFile(paths: string[]): string {
  return paths.find((p) => p.startsWith("src/")) ?? paths[0];
}

export function Workspace({
  slug,
  codebaseContext,
  incidentReport,
  checks,
  difficulty,
}: {
  slug: string;
  codebaseContext: string;
  incidentReport: string;
  checks: string[];
  difficulty: Difficulty;
}) {
  const router = useRouter();
  const tracker = useSessionTracker();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [startError, setStartError] = useState("");
  const [giveUpState, setGiveUpState] = useState<{ busy: boolean; error: string } | null>(null);
  // The original files with the user's edits on top (D14). R4 sends these on Test.
  const [files, setFiles] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const [activePath, setActivePath] = useState("");
  const [statuses, setStatuses] = useState<Record<string, CheckStatus>>({});
  const [results, setResults] = useState<Record<string, CheckRunResult>>({});
  const [running, setRunning] = useState(false);
  const [bottomTab, setBottomTab] = useState<BottomTab>("terminal");
  const [terminal, setTerminal] = useState<TerminalLine[]>([]);
  const [command, setCommand] = useState("");
  // R5: the command running in the terminal container, so Stop / Ctrl+C can cancel it.
  const [commandRunning, setCommandRunning] = useState(false);
  const commandAbort = useRef<AbortController | null>(null);
  // Side panel widths: null = a third of the screen each (the editor gets the last third) until the user drags.
  const [panelWidth, setPanelWidth] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  // AI chat panel (right), open on load.
  const [chatWidth, setChatWidth] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [dragging, setDragging] = useState<"description" | "chat" | null>(null);
  // Entry animation: the description starts full width (like the detail page) and the editor slides in.
  const [opening, setOpening] = useState(true);
  const splitRef = useRef<HTMLDivElement>(null);
  const descriptionRef = useRef<HTMLElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ attempt: Attempt }>(`/problems/${encodeURIComponent(slug)}/start`, { method: "POST" })
      .then(({ attempt: a }) => {
        setAttempt(a);
        // JSONB does not keep key order, so tabs are sorted by path.
        setFiles(Object.fromEntries(Object.entries({ ...a.files, ...readDraft(a) }).sort(([x], [y]) => x.localeCompare(y))));
        setActivePath(firstFile(Object.keys(a.files).sort()));
      })
      .catch((e) => {
        // A solved problem never reopens (R1): its detail page shows the result.
        if (e instanceof ApiError && e.code === "ALREADY_SOLVED") router.replace(`/problems/${slug}`);
        else setStartError(e instanceof ApiError ? e.message : "Could not start the problem. Try again.");
      });
  }, [slug, router]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // A handle takes space from the editor first; once the editor is at MIN_EDITOR it pushes the panel on the
  // other side down to its minimum. Dragging back gives the space to the editor. Dragging a side panel to
  // half its minimum closes it (like VS Code); its chevron tab opens it again.
  // Window listeners (capture phase) follow the mouse anywhere, also over Monaco, until it is released.
  useEffect(() => {
    if (!dragging) return;
    const width = (el: HTMLElement | null) => el?.getBoundingClientRect().width ?? 0;
    const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));
    const move = (e: globalThis.MouseEvent) => {
      e.preventDefault();
      const box = splitRef.current?.getBoundingClientRect();
      if (!box) return;
      const desc = width(descriptionRef.current);
      const chat = width(chatRef.current);
      const total = desc + width(editorRef.current) + chat; // space shared by the three panels
      if (dragging === "description" && e.clientX - box.left < MIN_DESCRIPTION / 2) {
        setDragging(null);
        setCollapsed(true);
        tracker.track("description_close");
      } else if (dragging === "chat" && box.right - e.clientX < MIN_CHAT / 2) {
        setDragging(null);
        setChatOpen(false);
      } else if (dragging === "description") {
        const minChat = chatOpen ? MIN_CHAT : 0;
        const d = clamp(e.clientX - box.left, MIN_DESCRIPTION, total - MIN_EDITOR - minChat);
        setPanelWidth(d);
        if (chatOpen) setChatWidth(Math.max(MIN_CHAT, Math.min(chat, total - d - MIN_EDITOR)));
      } else {
        const minDesc = collapsed ? 0 : MIN_DESCRIPTION;
        const c = clamp(box.right - e.clientX, MIN_CHAT, total - MIN_EDITOR - minDesc);
        setChatWidth(c);
        if (!collapsed) setPanelWidth(Math.max(MIN_DESCRIPTION, Math.min(desc, total - c - MIN_EDITOR)));
      }
    };
    const stop = () => setDragging(null);
    window.addEventListener("mousemove", move, true);
    window.addEventListener("mouseup", stop, true);
    return () => {
      window.removeEventListener("mousemove", move, true);
      window.removeEventListener("mouseup", stop, true);
    };
  }, [dragging, chatOpen, collapsed, tracker]);

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
    return <p className="p-8 text-sm text-muted">{startError || "Preparing your workspace…"}</p>;
  }

  function edit(path: string, code = "") {
    if (!attempt) return;
    const next = { ...files, [path]: code };
    setFiles(next);
    // Only changed files are stored, so the draft stays small.
    const changed = Object.fromEntries(Object.entries(next).filter(([p, c]) => c !== attempt.files[p]));
    try {
      localStorage.setItem(draftKey(attempt), JSON.stringify(changed));
    } catch {
      // Storage full or blocked: edits stay in memory for this tab.
    }
  }

  // All tries count (D56): earlier tries + the current one.
  const elapsed = attempt.previousSeconds + Math.max(0, Math.floor((now - Date.parse(attempt.startedAt)) / 1000));
  const limit = attempt.timeLimitMinutes * 60;
  // A line printed after streamed output closes it; an open line that stayed empty (trailing newline) is dropped.
  const print = (...lines: TerminalLine[]) =>
    setTerminal((t) => [...t.filter((l, i) => !(l.open && l.text === "" && i === t.length - 1)).map((l) => ({ ...l, open: false })), ...lines]);

  // Mouse events, not pointer events: Safari's pointer events cancelled or broke the drag.
  function startDrag(e: MouseEvent<HTMLDivElement>, panel: "description" | "chat") {
    if (e.button !== 0) return;
    e.preventDefault(); // no text selection or native drag-and-drop while dragging
    setDragging(panel);
  }

  function toggleDescription(open: boolean) {
    setCollapsed(!open);
    tracker.track(open ? "description_open" : "description_close");
  }

  async function submit() {
    if (!attempt || running) return;
    setRunning(true);
    tracker.track("test_run");
    setBottomTab("results");
    setResults({});
    setStatuses(Object.fromEntries(attempt.checks.map((c) => [c.id, "pending" as const])));
    print({ text: "Submit: running the checks…", tone: "command" });

    // R4: the server runs the checks in Docker on these files and decides solving; R6: each check streams in live.
    let done: Extract<TestRunEvent, { type: "done" }> | null = null;
    const description = (id: string) => attempt.checks.find((c) => c.id === id)?.description.toLowerCase() ?? id;
    try {
      await apiStream<TestRunEvent>(
        `/attempts/${attempt.id}/test`,
        { method: "POST", body: JSON.stringify({ files }) },
        (event) => {
          if (event.type === "running") setStatuses((s) => ({ ...s, [event.checkId]: "running" }));
          else if (event.type === "result") {
            const r: CheckRunResult = { checkId: event.checkId, passed: event.passed, output: event.output };
            setStatuses((s) => ({ ...s, [r.checkId]: r.passed ? "passed" : "failed" }));
            setResults((prev) => ({ ...prev, [r.checkId]: r }));
            print({ text: `${r.passed ? "PASS" : "FAIL"} ${description(r.checkId)}`, tone: r.passed ? "pass" : "fail" });
          } else done = event;
        },
      );
      if (!done) throw new Error("The check run ended early");
    } catch (e) {
      setStatuses({});
      setBottomTab("terminal");
      print({ text: e instanceof ApiError ? e.message : "Could not run the checks. Try again.", tone: "fail" });
      setRunning(false);
      // Solved in another tab: the detail page shows the result.
      if (e instanceof ApiError && e.code === "ALREADY_SOLVED") router.push(`/problems/${slug}`);
      return;
    }
    const response: Extract<TestRunEvent, { type: "done" }> = done;
    const all = response.results;
    const failed = all.filter((r) => !r.passed).length;
    print(
      { text: "", tone: "plain" },
      { text: `${all.length - failed} passed · ${failed} failed · ${all.length} total`, tone: failed ? "fail" : "pass" },
    );
    setRunning(false);
    if (!response.solved) return;
    print({
      text: `Solved · +${response.solved.pointsEarned} points (${response.solved.timeMultiplier}x time bonus)`,
      tone: "pass",
    });
    try {
      localStorage.removeItem(draftKey(attempt));
    } catch {
      // Blocked storage: a solved problem never reopens, so the draft is never read again.
    }
    // The detail page now shows the result (R4).
    await delay(1200);
    router.push(`/problems/${slug}`);
  }

  // R5: runs the command in the attempt's terminal container on the editor's current files; output streams in.
  async function submitCommand(e: React.FormEvent) {
    e.preventDefault();
    const cmd = command.trim();
    if (!cmd || !attempt || commandRunning) return;
    setCommand("");
    print({ text: `$ ${cmd}`, tone: "command" });
    const controller = new AbortController();
    commandAbort.current = controller;
    setCommandRunning(true);
    try {
      await apiStream<TerminalEvent>(
        `/attempts/${attempt.id}/terminal`,
        { method: "POST", body: JSON.stringify({ command: cmd, files }), signal: controller.signal },
        (event) => {
          if (event.type === "output") setTerminal((t) => appendOutput(t, event.text));
          else if (event.type === "stopped") print({ text: STOPPED[event.reason], tone: "fail" });
          else if (event.code !== 0) print({ text: `exit code ${event.code}`, tone: "fail" });
          else print();
        },
      );
    } catch (e) {
      if (e instanceof ApiError) print({ text: e.message, tone: "fail" });
      else if (controller.signal.aborted) print({ text: "^C", tone: "fail" });
      else print({ text: "The connection to the terminal was lost.", tone: "fail" });
    } finally {
      commandAbort.current = null;
      setCommandRunning(false);
    }
  }

  function stopCommand() {
    commandAbort.current?.abort();
  }

  // R2: the attempt becomes abandoned; starting again opens the next try with the original code (D8, R2b).
  async function giveUp() {
    if (!attempt) return;
    setGiveUpState({ busy: true, error: "" });
    try {
      await api(`/attempts/${attempt.id}/give-up`, { method: "POST" });
    } catch (e) {
      return setGiveUpState({ busy: false, error: e instanceof ApiError ? e.message : "Could not give up. Try again." });
    }
    try {
      localStorage.removeItem(draftKey(attempt));
    } catch {
      // Blocked storage: the draft key includes started_at, so a restart ignores it anyway.
    }
    router.push(`/problems/${slug}`);
  }

  return (
    <div
      className={`flex h-screen w-screen flex-col overflow-hidden bg-canvas ${dragging ? "cursor-col-resize select-none" : ""}`}
    >
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
          title={`${attempt.tryNumber > 1 ? `Try ${attempt.tryNumber} · ` : ""}Time limit ${clock(limit)}`}
          className={`text-sm font-semibold tabular-nums ${elapsed >= limit * 0.8 ? "text-failed" : "text-text"}`}
        >
          {clock(elapsed)}
        </p>
        <div className="flex items-center justify-end gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setGiveUpState({ busy: false, error: "" })}
            className="px-2 py-1.5 text-sm text-muted hover:text-text"
          >
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
        className="relative flex min-h-0 flex-1"
        style={
          {
            "--panel-w": panelWidth === null ? "33.333%" : `${panelWidth}px`,
            "--chat-w": chatWidth === null ? "33.333%" : `${chatWidth}px`,
          } as React.CSSProperties
        }
      >
        <section
          ref={descriptionRef}
          aria-label="Problem description"
          aria-hidden={collapsed}
          // The description and the chat shrink (down to their minimums) before the editor goes below MIN_EDITOR.
          className={`relative shrink overflow-hidden bg-canvas ${
            dragging ? "" : "transition-all duration-500 ease-out motion-reduce:transition-none"
          } ${collapsed ? "w-0" : opening ? "w-full" : "w-[var(--panel-w)] min-w-[80px]"
          }`}
        >
          <div className="h-full overflow-y-auto px-6 py-6 pr-10">
            <Description codebaseContext={codebaseContext} incidentReport={incidentReport} />
            <AcceptanceChecks checks={checks} />
          </div>
          <button
            type="button"
            onClick={() => toggleDescription(false)}
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
            onMouseDown={(e) => startDrag(e, "description")}
            className={`relative z-20 w-1 shrink-0 cursor-col-resize touch-none after:absolute after:inset-y-0 after:-left-1.5 after:-right-1.5 hover:bg-action ${
              dragging === "description" ? "bg-action" : "bg-border"
            }`}
          />
        )}

        <div
          ref={editorRef}
          className="relative flex min-w-[120px] flex-1 flex-col bg-[#1e1e1e]"
        >
          {collapsed ? (
            <button
              type="button"
              onClick={() => toggleDescription(true)}
              aria-label="Show description"
              title="Show description"
              className="absolute left-0 top-1/2 z-10 flex h-10 w-6 -translate-y-1/2 items-center justify-center rounded-r border border-l-0 border-border bg-surface text-muted hover:text-action"
            >
              <Icon name="chevronRight" className="h-4 w-4" />
            </button>
          ) : null}
          {chatOpen ? null : (
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              aria-label="Show AI assistant"
              title="Show AI assistant"
              className="absolute right-0 top-1/2 z-10 flex h-10 w-6 -translate-y-1/2 items-center justify-center rounded-l border border-r-0 border-border bg-surface text-muted hover:text-action"
            >
              <Icon name="chevronLeft" className="h-4 w-4" />
            </button>
          )}

          <div className="flex h-9 shrink-0 items-stretch bg-[#252526]">
            <div role="tablist" aria-label="Files" className="flex min-w-0 flex-1 overflow-x-auto">
              {Object.keys(files).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={p === activePath}
                  title={p}
                  onClick={() => {
                    setActivePath(p);
                    tracker.track("file_open", { fileName: p });
                  }}
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
            {/* ponytail: @monaco-editor/react loads Monaco from cdn.jsdelivr.net; bundle it if the CDN becomes a problem. */}
            <Editor
              // One model per attempt and file: same paths in another problem or a restarted attempt start fresh.
              path={`${attempt.id}/${Date.parse(attempt.startedAt)}/${activePath}`}
              defaultValue={files[activePath] ?? ""}
              onChange={(code) => edit(activePath, code)}
              theme="vs-dark"
              // The browser has no Node types or project config, so type errors would be false alarms (".ts" imports,
              // process, node:test). Syntax errors stay on; the checks run the real code.
              beforeMount={(monaco) => {
                for (const lang of [monaco.typescript.typescriptDefaults, monaco.typescript.javascriptDefaults]) {
                  lang.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
                }
              }}
              loading={<p className="p-4 text-sm text-muted">Loading editor…</p>}
              options={{
                fontSize: 13,
                lineHeight: 25,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 12 },
              }}
            />
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
                    <p className="text-[#858585]">
                      Run commands in your workspace, e.g. `npm test`. Submit runs the acceptance checks.
                    </p>
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
                    onKeyDown={(e) => {
                      if (e.ctrlKey && e.key === "c" && commandRunning) {
                        e.preventDefault();
                        stopCommand();
                      }
                    }}
                    aria-label="Terminal command"
                    placeholder={commandRunning ? "Running… Ctrl+C to stop" : ""}
                    spellCheck={false}
                    autoComplete="off"
                    className="min-w-0 flex-1 bg-transparent text-text placeholder:text-[#858585] focus:outline-none"
                  />
                  {commandRunning ? (
                    <button type="button" onClick={stopCommand} className="shrink-0 text-xs text-muted hover:text-failed">
                      Stop
                    </button>
                  ) : null}
                </form>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <ChecksPanel checks={attempt.checks} statuses={statuses} results={results} />
              </div>
            )}
          </section>
        </div>

        {chatOpen ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize AI assistant"
            onMouseDown={(e) => startDrag(e, "chat")}
            className={`relative z-20 w-1 shrink-0 cursor-col-resize touch-none after:absolute after:inset-y-0 after:-left-1.5 after:-right-1.5 hover:bg-action ${
              dragging === "chat" ? "bg-action" : "bg-border"
            }`}
          />
        ) : null}
        <aside
          ref={chatRef}
          aria-label="AI assistant"
          aria-hidden={!chatOpen}
          inert={!chatOpen}
          className={`relative shrink overflow-hidden bg-surface ${
            dragging ? "" : "transition-all duration-300 ease-out motion-reduce:transition-none"
          } ${chatOpen ? "w-[var(--chat-w)] min-w-[80px]" : "w-0"}`}
        >
          <AiChatPanel tracker={tracker} difficulty={difficulty} />
          <button
            type="button"
            onClick={() => setChatOpen(false)}
            aria-label="Hide AI assistant"
            title="Hide AI assistant"
            className="absolute left-0 top-1/2 z-10 flex h-10 w-6 -translate-y-1/2 items-center justify-center rounded-r border border-l-0 border-border bg-surface text-muted hover:text-action"
          >
            <Icon name="chevronRight" className="h-4 w-4" />
          </button>
        </aside>
      </div>

      <ConfirmDialog
        open={giveUpState !== null}
        title="Give up this problem?"
        message="You can start it again later. Your time keeps counting from where it stopped, and your changes are discarded."
        confirmLabel="Give up"
        busy={giveUpState?.busy}
        error={giveUpState?.error}
        onConfirm={() => void giveUp()}
        onCancel={() => setGiveUpState(null)}
      />
    </div>
  );
}
