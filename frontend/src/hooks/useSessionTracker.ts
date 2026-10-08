"use client";

import { useCallback, useState } from "react";

// Mock of the solve-session capture (solve_sessions / prompt_events / editor_events, md_files/01_database.md).
// ponytail: React state only; a backend slice posts these events.
export type EditorEventType = "file_open" | "test_run" | "ai_prompt" | "ai_response" | "description_open" | "description_close";

export interface EditorEvent {
  type: EditorEventType;
  at: Date;
  fileName?: string;
  tokens?: number;
}

export interface SessionTracker {
  promptCount: number;
  totalTokens: number;
  testRunCount: number;
  startTime: Date;
  events: EditorEvent[];
  track: (type: EditorEventType, extra?: Omit<EditorEvent, "type" | "at">) => void;
}

// ponytail: ~4 characters per token; the Claude API returns real counts.
export const estimateTokens = (text: string) => Math.ceil(text.trim().length / 4);

export function useSessionTracker(): SessionTracker {
  const [startTime] = useState(() => new Date());
  const [events, setEvents] = useState<EditorEvent[]>([]);

  const track = useCallback<SessionTracker["track"]>(
    (type, extra) => setEvents((e) => [...e, { type, at: new Date(), ...extra }]),
    [],
  );

  return {
    promptCount: events.filter((e) => e.type === "ai_prompt").length,
    totalTokens: events.reduce((sum, e) => sum + (e.tokens ?? 0), 0),
    testRunCount: events.filter((e) => e.type === "test_run").length,
    startTime,
    events,
    track,
  };
}
