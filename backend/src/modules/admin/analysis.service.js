import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config.js";
import { HttpError } from "../../errors.js";

// A10: one Claude call per upload. The key stays on the server (D21); the answer is forced into this JSON schema
// (structured outputs) and then checked again by the route, so a bad answer is a 502, never a broken draft.

const SYSTEM_PROMPT = `You prepare debugging problems for Bugdr, a platform where engineers fix real production bugs with AI help.

You get the full source of a small codebase that contains exactly one bug. Study it, find the bug, and describe the problem.

Return only JSON matching the schema:
- bug_summary: where the bug is and why it breaks things (file, function, mechanism). Internal note for admins only.
- title: a short, specific title in plain words, under 60 characters, naming the symptom (for example "Payment retries disappear"). Never the cause.
- short_description: one sentence for the problem card, at most 300 characters: what the system is, plus the symptom. Never the cause.
- codebase_context: what the system does, written as an onboarding note for an engineer who just joined the team. It must not mention or hint at anything broken.
- incident_report: what production shows: log lines, error output, monitoring alerts, user complaints or support tickets. Symptoms only. Never the cause, never the file or function, never the expected or correct behaviour.
- suggested_difficulty: easy, medium, hard or get_a_job, and difficulty_reasoning: one or two sentences why.
- checks: 3 to 5 acceptance checks, in the order they should run. Each has a short description for the engineer (what must work, without revealing the fix), a check_type (test, build, lint or custom), the shell command that runs it, and must_pass. Every check must fail on the current, buggy code and pass once the bug is fixed.
- hidden_files: the test files the checks run, as path + full content. Put them under .bugdr/checks/. Engineers never see these files; they are written into the workspace after the engineer's files.
- tags: 2 to 6 lowercase tags (technologies and topics, for example "redis", "retries", "typescript").

The checks run in a Docker container with Node.js 24 (node:24-alpine), from the project root, with no network access and no npm install. Use only Node built-ins: node:test and node:assert, run with "node --test <file>". Node 24 runs TypeScript files directly in strip-only mode (no enums, no namespaces, no parameter properties), so test files may be .ts or .js and may import the project's files with their real extensions.`;

// Structured outputs: every object needs additionalProperties: false, and maps are not allowed,
// so hidden files come back as a list of { path, content }.
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "bug_summary",
    "title",
    "short_description",
    "codebase_context",
    "incident_report",
    "suggested_difficulty",
    "difficulty_reasoning",
    "checks",
    "hidden_files",
    "tags",
  ],
  properties: {
    bug_summary: { type: "string" },
    title: { type: "string" },
    short_description: { type: "string" },
    codebase_context: { type: "string" },
    incident_report: { type: "string" },
    suggested_difficulty: { type: "string", enum: ["easy", "medium", "hard", "get_a_job"] },
    difficulty_reasoning: { type: "string" },
    checks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "check_type", "check_command", "must_pass"],
        properties: {
          description: { type: "string" },
          check_type: { type: "string", enum: ["test", "build", "lint", "custom"] },
          check_command: { type: "string" },
          must_pass: { type: "boolean" },
        },
      },
    },
    hidden_files: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "content"],
        properties: { path: { type: "string" }, content: { type: "string" } },
      },
    },
    tags: { type: "array", items: { type: "string" } },
  },
};

const invalid = (message) => new HttpError(502, "ANALYSIS_INVALID", message);
let client;

/**
 * Claude's analysis of `files` ({ path: content }) as the raw snake_case object from the schema above.
 * Wrapped in an object so tests can replace it without calling the API.
 */
export const analysis = {
  async analyze(files) {
    if (!config.anthropicApiKey) throw new HttpError(503, "ANALYSIS_DISABLED", "ANTHROPIC_API_KEY is not set on the server");
    client ??= new Anthropic({ apiKey: config.anthropicApiKey });
    const source = Object.entries(files)
      .map(([path, content]) => `<file path="${path}">\n${content}\n</file>`)
      .join("\n\n");

    let message;
    try {
      // Streaming: a large codebase + long test files can take minutes. "default" fallbacks retry a safety
      // decline on the model Anthropic recommends for that category.
      message = await client.beta.messages
        .stream({
          model: config.analysisModel,
          max_tokens: 64000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: `Here is the codebase.\n\n${source}` }],
        })
        .finalMessage();
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError)
        throw new HttpError(503, "ANALYSIS_BUSY", "Claude is busy right now. Try again in a minute.");
      if (err instanceof Anthropic.AuthenticationError)
        throw new HttpError(502, "ANALYSIS_FAILED", "The server's ANTHROPIC_API_KEY was rejected.");
      if (err instanceof Anthropic.APIError) {
        console.error("Claude analysis failed:", err.status, err.message);
        throw new HttpError(502, "ANALYSIS_FAILED", "The AI analysis failed. Try again.");
      }
      throw err;
    }

    if (message.stop_reason === "refusal") throw invalid("Claude declined to analyse this codebase.");
    if (message.stop_reason === "max_tokens") throw invalid("The analysis was cut off. Try a smaller codebase.");
    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    try {
      return JSON.parse(text);
    } catch {
      throw invalid("Claude did not return valid JSON.");
    }
  },
};
