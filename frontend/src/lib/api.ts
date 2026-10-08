/** Error from the backend's shared format: { error: { code, message, details? } }. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Browser-side call to /api/v1 (proxied to the backend by next.config.ts). */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "same-origin",
    headers: init.body ? { "Content-Type": "application/json", ...init.headers } : init.headers,
  });
  const body = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) {
    const err = body?.error;
    throw new ApiError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? res.statusText, err?.details);
  }
  return body as T;
}

/**
 * Browser-side call to a streaming /api/v1 endpoint (R5 terminal, R6 test results): newline-delimited JSON, one
 * event per line, handed to onEvent as it arrives. An error response (before the stream starts) throws ApiError.
 */
export async function apiStream<E>(path: string, init: RequestInit, onEvent: (event: E) => void): Promise<void> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "same-origin",
    headers: init.body ? { "Content-Type": "application/json", ...init.headers } : init.headers,
  });
  if (!res.ok || !res.body) {
    const err = (await res.json().catch(() => undefined))?.error;
    throw new ApiError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? res.statusText, err?.details);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line) onEvent(JSON.parse(line) as E);
  }
}
