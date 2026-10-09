"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/Icon";
import { estimateTokens, type SessionTracker } from "@/hooks/useSessionTracker";
import { api, ApiError } from "@/lib/api";
import { DIFFICULTY_LABEL, type Difficulty } from "@/lib/types/problem";

interface Message {
  role: "user" | "ai";
  text: string;
  at: Date;
}

// S1: GET/POST /attempts/:id/ai/messages. model = null when the server has no AI key.
interface AiModel {
  keySource: "platform" | "user";
  name: string;
}
interface AiUsage {
  model: AiModel | null;
  totalPrompts: number;
  totalTokens: number;
  remainingTokens: number;
  /** S3: the score so far (as on solve) and the benchmark for the problem's difficulty. */
  /** source (S7): the problem's own averages once it has enough solves, else the difficulty's. */
  efficiency: {
    score: number;
    benchmark: { prompts: number; tokens: number; iterations: number; source: "problem" | "difficulty" };
  };
}

const MAX_INPUT_HEIGHT = 96; // px, 4 rows of text-sm
const time = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const modelLabel = (m: AiModel) => `${m.keySource === "user" ? "Your key" : "Free model"} · ${m.name}`;

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
// The AI sees the editor's current files and the earlier messages, never the problem text (S1).
export function AiChatPanel({
  tracker,
  difficulty,
  attemptId,
  files,
  runsDone,
}: {
  tracker: SessionTracker;
  difficulty: Difficulty;
  attemptId: string | null;
  files: Record<string, string>;
  /** Finished Submits; each one reloads the score. */
  runsDone: number;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [usage, setUsage] = useState<AiUsage | null>(null);
  // settings = the fix is in Settings (daily limit reached, own key rejected or unreadable - S6).
  const [error, setError] = useState<{ text: string; settings: boolean } | null>(null);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [efficiencyOpen, setEfficiencyOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // The chat so far (after a reload), the model, today's free limit and the score; again after each Submit.
  useEffect(() => {
    if (!attemptId) return;
    api<AiUsage & { messages: { role: Message["role"]; text: string; at: string }[] }>(`/attempts/${attemptId}/ai/messages`)
      .then(({ messages: history, ...rest }) => {
        setMessages(history.map((m) => ({ ...m, at: new Date(m.at) })));
        setUsage(rest);
      })
      .catch(() => setError({ text: "Could not load the AI chat. Reload the page.", settings: false }));
  }, [attemptId, runsDone]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, typing, error]);

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
    if (!text || typing || !attemptId) return;
    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", text, at: new Date() }]);
    tracker.track("ai_prompt");
    setTyping(true);
    try {
      const { message, ...rest } = await api<AiUsage & { message: Message & { at: string } }>(
        `/attempts/${attemptId}/ai/messages`,
        { method: "POST", body: JSON.stringify({ text, files }) },
      );
      setMessages((m) => [...m, { ...message, at: new Date(message.at) }]);
      setUsage(rest);
      tracker.track("ai_response");
    } catch (e) {
      // The prompt was not recorded: take it back out and return it to the input.
      setMessages((m) => m.slice(0, -1));
      setInput(text);
      const code = e instanceof ApiError ? e.code : "";
      if (code === "AI_DAILY_LIMIT") setUsage((u) => u && { ...u, remainingTokens: 0 });
      setError({
        text: e instanceof ApiError ? e.message : "The AI did not answer. Try again.",
        settings: ["AI_DAILY_LIMIT", "API_KEY_REJECTED", "API_KEY_UNREADABLE"].includes(code),
      });
    } finally {
      setTyping(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  const level = DIFFICULTY_LABEL[difficulty];
  const prompts = usage?.totalPrompts ?? 0;
  const tokens = usage?.totalTokens ?? 0;
  const efficiency = usage?.efficiency;
  const avgFor = efficiency?.benchmark.source === "problem" ? "on this problem" : `for ${level}`;
  const round = (n: number) => Math.round(n).toLocaleString();

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border px-4 pl-8">
        <h2 className="truncate text-sm font-medium text-text">AI Assistant</h2>
        {usage ? (
          <span className="min-w-0 truncate text-xs text-muted">{usage.model ? modelLabel(usage.model) : "AI not available"}</span>
        ) : null}
      </div>

      <div aria-live="polite" className="flex h-8 shrink-0 items-center gap-3 overflow-x-auto whitespace-nowrap bg-canvas px-4 pl-8 text-xs text-muted">
        <Stat label="Prompts" value={prompts} />
        <span aria-hidden className="h-3 w-px shrink-0 bg-border" />
        <Stat label="Tokens" value={tokens} />
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
        {efficiencyOpen && efficiency ? (
          <dl className="space-y-1.5 px-4 pb-3 pl-8 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Prompts</dt>
              <dd className="text-right text-text">
                {prompts} <span className="text-muted">(avg: {round(efficiency.benchmark.prompts)} {avgFor})</span>
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Tokens</dt>
              <dd className="text-right text-text">
                {tokens.toLocaleString()}{" "}
                <span className="text-muted">(avg: {round(efficiency.benchmark.tokens)} {avgFor})</span>
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Score so far</dt>
              <dd className={`font-medium tabular-nums ${efficiency.score >= 1 ? "text-passed" : "text-pending"}`}>
                {efficiency.score.toFixed(2)}x
              </dd>
            </div>
            <p className="pt-1 text-muted">
              Multiplies your points on solve (0.5-2x). Fewer prompts, tokens and test-fix rounds score higher.
            </p>
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
        {error ? (
          <p role="alert" className="mb-2 text-xs text-failed">
            {error.text}
            {error.settings ? (
              <>
                {" "}
                <Link href="/settings?tab=account" className="text-action hover:underline">
                  Open Settings
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
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
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-muted">
            ~{estimateTokens(input)} tokens
            {usage?.model?.keySource === "platform" ? ` · ${usage.remainingTokens.toLocaleString()} free left today` : ""}
          </span>
          <button
            type="button"
            onClick={() => void send()}
            disabled={!input.trim() || typing || !attemptId || usage?.model === null}
            className="shrink-0 rounded bg-action px-3 py-1 text-xs font-medium text-canvas hover:opacity-90 disabled:opacity-60"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
