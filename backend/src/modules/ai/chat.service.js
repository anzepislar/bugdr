import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config.js";
import { HttpError } from "../../errors.js";

// S1: the built-in AI chat on the solve page. The AI sees only the code (the user's current files) and the earlier
// turns - never the incident report or codebase context: like an assistant in a real repo, the engineer has to
// explain the problem (user, 9. 10. 2026). Platform key with a cheap model (D62), or the user's own key and model (S6).

const SYSTEM_PROMPT = `You are an AI coding assistant built into an engineer's editor. The engineer is working in the codebase below and asks you for help. You only know what is in the code and what the engineer tells you.

Answer questions about the code, help investigate problems the engineer describes, and suggest changes. Be concise and specific: refer to files and functions by name and show code in fenced blocks.`;

const MAX_ANSWER_TOKENS = 4000;
const FREE_MODELS = { anthropic: "claude-haiku-4-5", openai: "gpt-4o-mini" };
// D63: what a user can pick for their own key, default first.
export const USER_MODELS = {
  anthropic: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-4-5"],
  openai: ["gpt-4o", "gpt-4o-mini"],
};

const busy = () => new HttpError(503, "AI_BUSY", "The AI is busy right now. Try again in a minute.");
const failed = () => new HttpError(502, "AI_FAILED", "The AI did not answer. Try again.");
const rejected = () =>
  new HttpError(400, "API_KEY_REJECTED", "Your API key was rejected by the provider. Check it, or connect another one in Settings.");
let client;

/** Provider + model of the platform key (A9.1 provider choice, D62 cheap model). Null when no key is set. */
export function platformModel() {
  const provider = config.aiProvider || (config.anthropicApiKey ? "anthropic" : config.openaiApiKey ? "openai" : "");
  const key = provider === "anthropic" ? config.anthropicApiKey : provider === "openai" ? config.openaiApiKey : "";
  return key ? { provider, model: config.aiFreeModel || FREE_MODELS[provider] } : null;
}

/** The codebase as the system prompt: one <file> block per path, sorted so the prefix stays stable. */
export function systemPrompt(files) {
  const source = Object.keys(files)
    .sort()
    .map((path) => `<file path="${path}">\n${files[path]}\n</file>`)
    .join("\n\n");
  return `${SYSTEM_PROMPT}\n\n<codebase>\n${source}\n</codebase>`;
}

/**
 * One chat turn. `messages` = earlier turns + the new prompt, as { role, content }. `userKey` = { provider, apiKey,
 * model } of the user's own key (S6); without it the platform key and cheap model. A key the provider rejects is
 * 400 API_KEY_REJECTED for a user key, 502 for the platform key.
 * Returns { text, model, promptTokens, responseTokens } with the provider's real usage.
 * Wrapped in an object so tests can replace it without calling the API.
 */
export const chat = {
  async complete({ system, messages, userKey }) {
    const platform = platformModel();
    if (!userKey && !platform) throw new HttpError(503, "AI_DISABLED", "The AI assistant is not set up on the server yet.");
    const { provider, model } = userKey ?? platform;
    const apiKey = userKey?.apiKey ?? (provider === "openai" ? config.openaiApiKey : config.anthropicApiKey);
    return provider === "openai"
      ? completeWithOpenAI({ apiKey, own: !!userKey, model, system, messages })
      : completeWithClaude({ apiKey, own: !!userKey, model, system, messages });
  },
};

async function completeWithClaude({ apiKey, own, model, system, messages }) {
  // The platform client is reused; a user's key gets its own client for this call only (never kept or logged).
  const anthropic = own ? new Anthropic({ apiKey }) : (client ??= new Anthropic({ apiKey }));
  let message;
  try {
    message = await anthropic.messages.create({ model, max_tokens: MAX_ANSWER_TOKENS, system, messages });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) throw busy();
    if (own && (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError)) throw rejected();
    if (err instanceof Anthropic.APIError) {
      console.error("AI chat (Claude) failed:", err.status, err.message);
      throw failed();
    }
    throw err;
  }
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (!text) throw failed();
  return { text, model, promptTokens: message.usage.input_tokens, responseTokens: message.usage.output_tokens };
}

// Plain fetch like A9.1, no SDK.
async function completeWithOpenAI({ apiKey, own, model, system, messages }) {
  let res;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        max_completion_tokens: MAX_ANSWER_TOKENS,
        messages: [{ role: "system", content: system }, ...messages],
      }),
      signal: AbortSignal.timeout(2 * 60_000),
    });
  } catch (err) {
    console.error("AI chat (OpenAI) failed:", err.message);
    throw failed();
  }
  if (res.status === 429 || res.status >= 500) throw busy();
  if (own && (res.status === 401 || res.status === 403)) throw rejected();
  if (!res.ok) {
    console.error("AI chat (OpenAI) failed:", res.status, await res.text().catch(() => ""));
    throw failed();
  }
  const body = await res.json();
  const text = body.choices?.[0]?.message?.content;
  if (!text) throw failed();
  return { text, model, promptTokens: body.usage?.prompt_tokens ?? 0, responseTokens: body.usage?.completion_tokens ?? 0 };
}
