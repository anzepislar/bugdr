"use client";

import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/admin/problems/shared";
import { Icon } from "@/components/Icon";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { api } from "@/lib/api";

// S8: GET /attempts/:id/feedback. unavailable = solved before feedback existed; locked = not on the user's plan (X2).
interface Feedback {
  status: "pending" | "ready" | "failed" | "unavailable" | "locked";
  content: string | null;
}

// Placeholder under the blur of the locked state; never real feedback.
const LOCKED_SAMPLE =
  "You found the root cause quickly, but your second and third prompts repeated context the AI already had. " +
  "Top solvers describe the failing behaviour once, ask for the likely cause, then verify it in the code before " +
  "asking for a fix. Your first test run failed on an edge case the incident report already pointed to.";

// The feedback is one plain-text string (the prompt asks for: what went well, the comparison, one or two tips).
// Split it into lines and sentences and walk forward: well -> compare (first comparison word) -> next ("Next time",
// a numbered tip). Every sentence lands in a section, so no text is dropped.
const NEXT = /\bnext time\b/i;
const LIST_ITEM = /^\s*(?:\d+[.)]|[-•*])\s+/;
const COMPARE = /\b(?:typical|average|compar|median|benchmark|top \d+\s*%)/i;
const TIP_START = /^(?:next time|also|second(?:ly)?|another|finally|instead)\b/i;

interface Parsed {
  well: string[];
  compare: string[];
  /** Tips without their own numbering. */
  next: string[];
}

function parseFeedback(text: string): Parsed {
  const units = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    // Decimals ("14.0", "1.56×") stay whole: a sentence ends only at punctuation followed by a space.
    .flatMap((line) => (LIST_ITEM.test(line) ? [line] : line.split(/(?<=[.!?])\s+/)))
    .map((u) => u.trim())
    .filter(Boolean);

  const parsed: Parsed = { well: [], compare: [], next: [] };
  let section: keyof Parsed = "well";
  for (const unit of units) {
    const listItem = LIST_ITEM.test(unit);
    if (listItem || NEXT.test(unit)) section = "next";
    else if (section === "well" && COMPARE.test(unit)) section = "compare";

    if (section !== "next") parsed[section].push(unit);
    else if (listItem || TIP_START.test(unit) || parsed.next.length === 0) parsed.next.push(unit.replace(LIST_ITEM, ""));
    else parsed.next[parsed.next.length - 1] += ` ${unit}`;
  }
  return parsed;
}

const NUM = String.raw`(\d[\d,]*(?:\.\d+)?)`;
const TYPICAL = /typical|average|top|median|compar|benchmark/i;

/** "6 prompts" -> yours, "the typical 14.0 prompts" -> typical (by the 40 characters before the number). */
function findCounts(text: string, unit: string) {
  let yours: string | undefined;
  let typical: string | undefined;
  for (const m of text.matchAll(new RegExp(`${NUM}\\s*${unit}`, "gi"))) {
    if (TYPICAL.test(text.slice(Math.max(0, m.index - 40), m.index))) typical ??= m[1];
    else yours ??= m[1];
  }
  return { yours, typical };
}

function findEfficiency(text: string): number | undefined {
  const m = text.match(new RegExp(`${NUM}\\s*[×x](?![a-z])`, "i")) ?? text.match(/efficiency[^.\d]{0,30}(\d+(?:\.\d+)?)/i);
  const value = m ? Number(m[1]) : NaN;
  return value > 0 && value <= 3 ? value : undefined;
}

function SectionLabel({ icon, className, children }: { icon: "check" | "ranking" | "arrowRight"; className: string; children: string }) {
  return (
    <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted">
      <Icon name={icon} className={`h-3.5 w-3.5 ${className}`} />
      {children}
    </p>
  );
}

function StatChip({ label, value, delay }: { label: string; value: string; delay: number }) {
  return (
    <div className="anim-chip" style={{ animationDelay: `${delay}ms` }}>
      <p className="text-[10px] text-muted">{label}</p>
      <p className="mt-1 rounded-[8px] border border-white/10 bg-white/6 px-2.5 py-1 text-xs font-medium text-text">{value}</p>
    </div>
  );
}

/** Efficiency 0 -> left edge, 1.0× -> middle, 2.0× -> right edge. */
function PerformanceBar({ efficiency }: { efficiency: number }) {
  const pct = Math.min(100, Math.max(0, (efficiency / 2) * 100));
  const at = `clamp(0.75rem, ${pct}%, 100% - 0.75rem)`;
  return (
    <div role="img" aria-label={`Efficiency ${efficiency}×: 1.0× is typical, 2.0× is the top.`} className="mt-4">
      <div className="relative h-4">
        <span
          className="anim-fade absolute bottom-0 -translate-x-1/2 text-[10px] font-medium text-text"
          style={{ left: at, animationDelay: "1100ms" }}
        >
          You
        </span>
      </div>
      <div className="relative mt-1 h-1 rounded-[2px] bg-white/8">
        <div
          className="anim-bar-fill h-full rounded-[2px] bg-[linear-gradient(90deg,#8BACFF,#22c55e)]"
          style={{ width: `${pct}%` }}
        />
        <span
          className="anim-dot absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-canvas bg-text"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-muted">
        <span>Average</span>
        <span>Top 10%</span>
      </div>
    </div>
  );
}

function FeedbackSections({ content }: { content: string }) {
  const { well, compare, next } = parseFeedback(content);
  const compareText = compare.join(" ");
  // Numbers from the whole text: "3 prompts" can sit in the praise sentence.
  const prompts = findCounts(content, "prompts?");
  const tokens = findCounts(content, "tokens?");
  const efficiency = findEfficiency(content);
  const chips = [
    { label: "Your prompts", value: prompts.yours && `${prompts.yours} prompts` },
    { label: "Typical prompts", value: prompts.typical && `${prompts.typical} prompts` },
    { label: "Your tokens", value: tokens.yours && `${tokens.yours} tokens` },
    { label: "Efficiency score", value: efficiency && `${efficiency}×` },
  ].filter((c): c is { label: string; value: string } => Boolean(c.value));

  return (
    <div className="space-y-3">
      {well.length > 0 && (
        <div className="anim-section relative overflow-hidden rounded bg-passed/5 py-3 pl-[18px] pr-4" style={{ animationDelay: "200ms" }}>
          <span aria-hidden className="anim-grow absolute left-0 top-0 h-full w-0.5 bg-passed/50" style={{ animationDelay: "200ms" }} />
          <SectionLabel icon="check" className="text-passed">
            What you did well
          </SectionLabel>
          <p className="mt-2 break-words text-[13px] leading-relaxed text-text">{well.join(" ")}</p>
        </div>
      )}

      {compare.length > 0 && (
        <div className="anim-section rounded bg-white/3 px-4 py-3" style={{ animationDelay: "350ms" }}>
          <SectionLabel icon="ranking" className="text-muted">
            How you compare
          </SectionLabel>
          {chips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {chips.map((c, i) => (
                <StatChip key={c.label} {...c} delay={400 + i * 40} />
              ))}
            </div>
          )}
          <p className="mt-3 break-words text-[13px] leading-relaxed text-muted">{compareText}</p>
          {efficiency !== undefined && <PerformanceBar efficiency={efficiency} />}
        </div>
      )}

      {next.length > 0 && (
        <div className="anim-section rounded border-l-2 border-action/30 bg-action/4 px-4 py-3" style={{ animationDelay: "500ms" }}>
          <SectionLabel icon="arrowRight" className="text-action">
            Next time
          </SectionLabel>
          <ol className="mt-1">
            {next.map((tip, i) => (
              <li key={i} className="flex gap-3 border-t border-white/6 py-2 first:border-t-0 last:pb-0">
                <span className="w-3 shrink-0 text-[13px] font-semibold leading-[1.6] tabular-nums text-action">{i + 1}</span>
                <span className="min-w-0 break-words text-[13px] leading-[1.6] text-text">{tip}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

const POLL_MS = 3000;
const MAX_POLLS = 40; // ~2 minutes, then the server restarts a stuck one on the next visit

/** The AI's feedback on the user's solve, in the solved result (only the owner gets it from the API). */
export function SolveFeedback({ attemptId }: { attemptId: string }) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [polls, setPolls] = useState(0);

  const load = useCallback(() => {
    api<Feedback>(`/attempts/${attemptId}/feedback`)
      .then(setFeedback)
      .catch(() => setFeedback({ status: "failed", content: null }));
  }, [attemptId]);

  useEffect(load, [load]);

  // Written in the background after the solve: ask again until it is there.
  useEffect(() => {
    if (feedback?.status !== "pending" || polls >= MAX_POLLS) return;
    const timer = setTimeout(() => {
      setPolls((n) => n + 1);
      load();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [feedback, polls, load]);

  if (!feedback || feedback.status === "unavailable") return null;

  return (
    <section aria-labelledby="feedback-heading" className="mb-10 rounded-lg border border-white/8 bg-white/4 p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="feedback-heading" className="flex items-center gap-2 text-xl font-semibold text-text">
          <Icon name="sparkle" className="h-3.5 w-3.5 text-action" />
          AI feedback
        </h2>
        <p className="rounded-[20px] border border-white/8 bg-white/6 px-2.5 py-0.5 text-[11px] text-muted">
          Only you can see this.
        </p>
      </div>
      <div aria-live="polite" className="mt-4">
        {feedback.status === "locked" ? (
          // One grid cell for both: the box is as tall as the taller of the two, on any width.
          <div className="grid">
            <p aria-hidden className="pointer-events-none col-start-1 row-start-1 select-none rounded border border-border bg-surface p-5 text-sm leading-relaxed text-text blur-sm">
              {LOCKED_SAMPLE} {LOCKED_SAMPLE}
            </p>
            <div className="col-start-1 row-start-1 flex items-center justify-center p-4">
              <UpgradePrompt feature="feedback" className="max-w-lg" />
            </div>
          </div>
        ) : feedback.status === "ready" ? (
          <FeedbackSections content={feedback.content ?? ""} />
        ) : feedback.status === "pending" && polls < MAX_POLLS ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner /> Writing your feedback...
          </p>
        ) : (
          <p className="text-sm text-muted">
            {feedback.status === "pending"
              ? "Your feedback is taking longer than usual."
              : "We could not write your feedback right now."}{" "}
            <button
              type="button"
              onClick={() => {
                setPolls(0);
                setFeedback({ status: "pending", content: null });
                load();
              }}
              className="text-action hover:underline"
            >
              Try again
            </button>
          </p>
        )}
      </div>
    </section>
  );
}
