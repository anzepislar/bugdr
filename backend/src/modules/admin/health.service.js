import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config.js";

// Admin overview "Services": one cheap real call per configured service, reported as ok / warn / error /
// unconfigured. Never throws, never returns a key.

const TIMEOUT = 10_000;
const UNCONFIGURED = { status: "unconfigured", detail: "No key set" };
const ok = (detail = "Responding") => ({ status: "ok", detail });
const warn = (detail) => ({ status: "warn", detail });
const error = (detail) => ({ status: "error", detail });
let client;

/** Status of a plain HTTP check from its response code; `onOk` reads a 200. */
async function httpCheck(url, headers, { onOk = () => ok(), rejected = "Key rejected", rateLimit = true } = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT) });
  if (res.ok) return onOk(await res.json().catch(() => ({})));
  if (rateLimit && res.status === 429) return warn("Rate limited");
  if (res.status === 401 || res.status === 403) return error(rejected);
  return error("Unreachable");
}

/** One function per service; wrapped in an object so tests can replace them. */
export const healthChecks = {
  async anthropic() {
    if (!config.anthropicApiKey) return UNCONFIGURED;
    client ??= new Anthropic({ apiKey: config.anthropicApiKey });
    try {
      // Haiku 4.5 does not think unless asked, so this is one cheap token; the newer models think by default and
      // Sonnet 5.5 rejects thinking: disabled. It checks the key, not access to ANTHROPIC_MODEL.
      await client.messages.create(
        { model: "claude-haiku-4-5", max_tokens: 1, messages: [{ role: "user", content: "ping" }] },
        { timeout: TIMEOUT, maxRetries: 0 },
      );
      return ok();
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return warn("Rate limited");
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError)
        return error("Key rejected");
      return error("Unreachable");
    }
  },

  async openai() {
    if (!config.openaiApiKey) return UNCONFIGURED;
    return httpCheck("https://api.openai.com/v1/models", { Authorization: `Bearer ${config.openaiApiKey}` });
  },

  async github() {
    if (!config.githubToken) return UNCONFIGURED;
    return httpCheck(
      "https://api.github.com/rate_limit",
      {
        Authorization: `Bearer ${config.githubToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "bugdr-admin/1.0",
      },
      {
        rejected: "Token rejected",
        rateLimit: false,
        onOk: ({ rate }) => {
          const detail = `${rate?.remaining ?? "?"} / ${rate?.limit ?? "?"} requests remaining`;
          return rate?.remaining < 100 ? warn(detail) : ok(detail);
        },
      },
    );
  },

  async resend() {
    if (!config.resendApiKey) return UNCONFIGURED;
    return httpCheck(`${config.resendApiUrl}/domains`, { Authorization: `Bearer ${config.resendApiKey}` }, { rateLimit: false });
  },
};

/** All four in parallel; a check that throws (timeout, network) is "Unreachable". */
export async function checkHealth() {
  const names = Object.keys(healthChecks);
  const results = await Promise.allSettled(names.map((name) => healthChecks[name]()));
  return Object.fromEntries(
    names.map((name, i) => [name, results[i].status === "fulfilled" ? results[i].value : error("Unreachable")]),
  );
}
