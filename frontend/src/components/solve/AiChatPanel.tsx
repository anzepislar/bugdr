"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/Icon";
import { estimateTokens, type SessionTracker } from "@/hooks/useSessionTracker";
import { AI_TOOLS, BENCHMARKS, mockAskAi, type AiTool } from "@/lib/mock/aiChat";
import { DIFFICULTY_LABEL, type Difficulty } from "@/lib/types/problem";

interface Message {
  role: "user" | "ai";
  text: string;
  tool: AiTool;
  at: Date;
}

const MAX_INPUT_HEIGHT = 96; // px, 4 rows of text-sm
const toolLabel = (id: AiTool) => AI_TOOLS.find((t) => t.id === id)?.label ?? id;
const time = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// Fenced blocks become code boxes, `inline` spans become <code>.
function MessageText({ text }: { text: string }) {
  return text.split(/```\w*\n?([\s\S]*?)```/).map((part, i) =>
    i % 2 ? (
      <pre key={i} className="my-2 overflow-x-auto rounded-[4px] bg-[#1e1e1e] p-2 font-mono text-xs leading-5 text-text">
        {part.trimEnd()}
      </pre>
    ) : (
      <p key={i} className="whitespace-pre-wrap break-words">
        {part.trim().split(/`([^`]+)`/).map((s, j) => (j % 2 ? <code key={j} className="font-mono text-[13px]">{s}</code> : s))}
      </p>
    ),
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span>
      {label}: <span className="tabular-nums text-text">{value.toLocaleString()}</span>
    </span>
  );
}

// Right panel of the solve page: built-in AI chat, live session stats and the efficiency estimate.
export function AiChatPanel({ tracker, difficulty }: { tracker: SessionTracker; difficulty: Difficulty }) {
  const [tool, setTool] = useState<AiTool>("claude");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [efficiencyOpen, setEfficiencyOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, typing]);

  // Auto-grow the textarea from 1 to 4 rows.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    // Empty = back to rows={1} (measuring while the panel is collapsed to 0 px would give 4 rows).
    if (input) el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [input]);

  async function send() {
    const text = input.trim();
    if (!text || typing) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text, tool, at: new Date() }]);
    tracker.track("ai_prompt", { tokens: estimateTokens(text) });
    setTyping(true);
    const reply = await mockAskAi(tracker.promptCount);
    setMessages((m) => [...m, { role: "ai", text: reply, tool, at: new Date() }]);
    tracker.track("ai_response", { tokens: estimateTokens(reply) });
    setTyping(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  const bench = BENCHMARKS[difficulty];
  const level = DIFFICULTY_LABEL[difficulty];
  // ponytail: average of prompt and token use vs. the benchmark; the real score (03_scoring.md) is computed on solve.
  const usage = (tracker.promptCount / bench.prompts + tracker.totalTokens / bench.tokens) / 2;
  const rating = usage <= 1 ? { label: "Efficient", tone: "text-passed" } : { label: "Above average use", tone: "text-pending" };

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border px-4 pl-8">
        <h2 className="truncate text-sm font-medium text-text">AI Assistant</h2>
        <label className="flex shrink-0 items-center gap-1.5">
          <span
            aria-hidden
            className="flex h-5 w-5 items-center justify-center rounded bg-highlight/15 text-[11px] font-semibold text-highlight"
          >
            {toolLabel(tool)[0]}
          </span>
          <span className="sr-only">AI tool</span>
          <select
            value={tool}
            onChange={(e) => setTool(e.target.value as AiTool)}
            className="rounded border border-border bg-canvas px-1.5 py-0.5 text-xs text-muted"
          >
            {AI_TOOLS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div aria-live="polite" className="flex h-8 shrink-0 items-center gap-3 overflow-x-auto whitespace-nowrap bg-canvas px-4 pl-8 text-xs text-muted">
        <Stat label="Prompts" value={tracker.promptCount} />
        <span aria-hidden className="h-3 w-px shrink-0 bg-border" />
        <Stat label="Tokens" value={tracker.totalTokens} />
        <span aria-hidden className="h-3 w-px shrink-0 bg-border" />
        <Stat label="Runs" value={tracker.testRunCount} />
      </div>

      <div className="shrink-0 border-b border-border">
        <button
          type="button"
          onClick={() => setEfficiencyOpen((o) => !o)}
          aria-expanded={efficiencyOpen}
          className="flex w-full items-center justify-between px-4 pl-8 py-2 text-xs font-medium text-muted hover:text-text"
        >
          Session Efficiency
          <Icon name="chevronDown" className={`h-4 w-4 transition-transform ${efficiencyOpen ? "rotate-180" : ""}`} />
        </button>
        {efficiencyOpen ? (
          <dl className="space-y-1.5 px-4 pb-3 pl-8 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Prompts</dt>
              <dd className="text-right text-text">
                {tracker.promptCount} <span className="text-muted">(avg: {bench.prompts} for {level})</span>
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Tokens</dt>
              <dd className="text-right text-text">
                {tracker.totalTokens.toLocaleString()}{" "}
                <span className="text-muted">(avg: {bench.tokens.toLocaleString()} for {level})</span>
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Rating</dt>
              <dd className={`font-medium ${rating.tone}`}>{rating.label}</dd>
            </div>
            <p className="pt-1 text-muted">Fewer prompts and tokens = higher score</p>
          </dl>
        ) : null}
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !typing ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted">
            <Icon name="help" className="h-6 w-6" />
            Ask AI to help debug
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map((m, i) => (
              <li key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[90%] rounded-lg border border-border px-3.5 py-2.5 text-sm text-text ${
                    m.role === "user" ? "bg-surface" : "bg-canvas"
                  }`}
                >
                  {m.role === "ai" ? <p className="mb-1 text-xs text-muted">{toolLabel(m.tool)}</p> : null}
                  <MessageText text={m.text} />
                </div>
                <time className="mt-1 text-xs text-muted">{time(m.at)}</time>
              </li>
            ))}
            {typing ? (
              <li aria-label="AI is typing" className="flex w-fit gap-1 rounded-lg border border-border bg-canvas px-3.5 py-3">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${d}ms` }} />
                ))}
              </li>
            ) : null}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-3">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          aria-label="Ask AI"
          placeholder="Ask AI for help..."
          className="block w-full resize-none rounded border border-border bg-canvas px-3 py-2 text-sm text-text placeholder:text-muted focus:border-action focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-muted">~{estimateTokens(input)} tokens</span>
          <button
            type="button"
            onClick={() => void send()}
            disabled={!input.trim() || typing}
            className="rounded bg-action px-3 py-1 text-xs font-medium text-canvas hover:opacity-90 disabled:opacity-60"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
