"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";

// Solve-session capture (S2). File opens and description open/close are sent to POST /attempts/:id/events in
// batches; test runs (R4) and prompts (S1) are recorded by the server itself, so they stay local (the Runs counter).
export type EditorEventType = "file_open" | "test_run" | "ai_prompt" | "ai_response" | "description_open" | "description_close";

const SENT: ReadonlySet<EditorEventType> = new Set(["file_open", "description_open", "description_close"]);
const FLUSH_MS = 10_000;
const MAX_BATCH = 100; // the server's limit

interface QueuedEvent {
  id: string; // makes a resent batch a no-op on the server
  type: EditorEventType;
  at: string;
  fileName?: string;
}

export interface SessionTracker {
  testRunCount: number;
  track: (type: EditorEventType, extra?: { fileName?: string }) => void;
  /** Sends the queued events now (before Submit, so they land before a solve closes the attempt). */
  flush: () => Promise<void>;
}

// ponytail: ~4 characters per token, only for the hint under the chat input; real counts come from the provider.
export const estimateTokens = (text: string) => Math.ceil(text.trim().length / 4);

export function useSessionTracker(attemptId: string | null): SessionTracker {
  const [testRunCount, setTestRunCount] = useState(0);
  const queue = useRef<QueuedEvent[]>([]);
  const sending = useRef<Promise<void> | null>(null);

  const track = useCallback<SessionTracker["track"]>((type, extra) => {
    if (type === "test_run") setTestRunCount((n) => n + 1);
    if (SENT.has(type)) queue.current.push({ id: crypto.randomUUID(), type, at: new Date().toISOString(), ...extra });
  }, []);

  const flush = useCallback(async () => {
    if (sending.current) return sending.current;
    if (!attemptId || !queue.current.length) return;
    const batch = queue.current.slice(0, MAX_BATCH);
    sending.current = api(`/attempts/${attemptId}/events`, { method: "POST", body: JSON.stringify({ events: batch }) })
      .then(() => {
        queue.current = queue.current.slice(batch.length);
      })
      .catch((e) => {
        // Rejected (e.g. 409 after solving): drop it. Network or server error: keep it for the next try.
        if (e instanceof ApiError && e.status < 500) queue.current = queue.current.slice(batch.length);
      })
      .finally(() => {
        sending.current = null;
      });
    return sending.current;
  }, [attemptId]);

  useEffect(() => {
    if (!attemptId) return;
    void flush();
    const timer = setInterval(() => void flush(), FLUSH_MS);
    // Closing the tab: one last batch that outlives the page.
    const leave = () => {
      if (!queue.current.length) return;
      void fetch(`/api/v1/attempts/${attemptId}/events`, {
        method: "POST",
        keepalive: true,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: queue.current.slice(0, MAX_BATCH) }),
      }).catch(() => {});
      queue.current = [];
    };
    window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", leave);
      leave(); // leaving the solve page inside the app
    };
  }, [attemptId, flush]);

  return useMemo(() => ({ testRunCount, track, flush }), [testRunCount, track, flush]);
}
