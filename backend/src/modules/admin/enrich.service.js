import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config.js";

// Bulk import step 2: one Claude call per scraped PR (scrape.service.js). Claude rebuilds the bug as a small
// standalone codebase on Node built-ins only - the source repos have dependencies, the runner has none (D53) - or
// rejects the PR. The result has the import.json shape, so POST /admin/import-problem saves it as a draft; the
// Docker check run on publish (A4/A5) stays the gate.

const SYSTEM_PROMPT = `You turn real bug-fix pull requests into debugging problems for Bugdr, a platform where engineers fix production bugs with AI help.

You get a merged pull request: title, description, the diff of each changed file and, where available, the buggy version of the file before the fix.

First decide whether this PR can become a good problem. Reject it (accepted: false, a one-sentence rejection_reason, problem: null) when:
- it is not a behaviour bug (docs, typos, refactors, performance, types only, build or CI changes, dependency bumps),
- the bug cannot be reproduced without native code, the network, a browser, a database or another external service,
- the bug cannot be rebuilt as a small standalone codebase (at most 10 files) that runs on Node.js built-ins only.

Otherwise (accepted: true, rejection_reason: "") build the problem:
- codebase.files: a small, self-contained codebase that contains the same bug, adapted from the original code. Plain JavaScript (CommonJS, or ESM with a package.json that has "type": "module" and no dependencies). Node.js 24 built-ins only, no npm packages. Realistic, like a slice of the real project, not a toy.
- codebase.solution_files: the fixed version of every file the fix changes (same paths as in files).
- codebase.hidden_files: the test files the checks run, under .bugdr/checks/, using node:test and node:assert, run with "node --test <file>".
- checks: 1 to 5 acceptance checks in run order. Every check must fail on files and pass with solution_files applied. check_command is the shell command (for example "node --test .bugdr/checks/retry.test.js"). description says what must work, without revealing the fix.
- codebase.repository_name: "<owner>/<repo>", language: "javascript", framework: "" unless the code uses one, setup_commands: "", run_command: how to start the code, or "".
- bug_summary: where the bug is and why it breaks things. Internal note for admins only.
- title: short and specific, under 60 characters, naming the symptom, never the cause. slug: the title in lowercase with hyphens.
- short_description: one sentence, at most 300 characters: what the system is plus the symptom.
- codebase_context: what the system does, as an onboarding note for a new engineer. No hint at anything broken.
- incident_report: what production shows (logs, errors, user reports). Symptoms only: never the cause, the file, the function or the expected fix.
- difficulty: easy, medium, hard or get_a_job. time_limit_minutes: 15 to 180, matching the difficulty.
- category_slug: the role this bug belongs to: ai-engineer, backend, frontend, fullstack, database, mobile or devops.
- tags: 2 to 6 lowercase tags.

The checks run in a Docker container with node:24-alpine from the project root, with no network access and no npm install.`;

const FILE_LIST = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["path", "content"],
    properties: { path: { type: "string" }, content: { type: "string" } },
  },
};

const PROBLEM = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "slug",
    "short_description",
    "codebase_context",
    "incident_report",
    "bug_summary",
    "difficulty",
    "category_slug",
    "time_limit_minutes",
    "tags",
    "codebase",
    "checks",
  ],
  properties: {
    title: { type: "string" },
    slug: { type: "string" },
    short_description: { type: "string" },
    codebase_context: { type: "string" },
    incident_report: { type: "string" },
    bug_summary: { type: "string" },
    difficulty: { type: "string", enum: ["easy", "medium", "hard", "get_a_job"] },
    category_slug: { type: "string", enum: ["ai-engineer", "backend", "frontend", "fullstack", "database", "mobile", "devops"] },
    time_limit_minutes: { type: "integer" },
    tags: { type: "array", items: { type: "string" } },
    codebase: {
      type: "object",
      additionalProperties: false,
      required: ["repository_name", "files", "solution_files", "hidden_files", "language", "framework", "setup_commands", "run_command"],
      properties: {
        repository_name: { type: "string" },
        files: FILE_LIST,
        solution_files: FILE_LIST,
        hidden_files: FILE_LIST,
        language: { type: "string" },
        framework: { type: "string" },
        setup_commands: { type: "string" },
        run_command: { type: "string" },
      },
    },
    checks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "check_type", "check_command", "must_pass"],
        properties: {
          description: { type: "string" },
          check_type: { type: "string", enum: ["test", "lint", "build", "custom"] },
          check_command: { type: "string" },
          must_pass: { type: "boolean" },
        },
      },
    },
  },
};

// Structured outputs: no maxLength / pattern / minimum (the import validates those), every object closed.
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["accepted", "rejection_reason", "problem"],
  properties: {
    accepted: { type: "boolean" },
    rejection_reason: { type: "string" },
    problem: { anyOf: [{ type: "null" }, PROBLEM] },
  },
};

const RATE_LIMIT_WAIT = 60;
let client;

/** The candidate as the user message: PR text, then per file the buggy version and the diff. */
function prompt(c) {
  const files = c.files
    .map(
      (f) =>
        (f.before ? `<file path="${f.path}" version="before-fix">\n${f.before}\n</file>\n` : "") +
        `<diff path="${f.path}">\n${f.patch}\n</diff>`,
    )
    .join("\n\n");
  return `Repository: ${c.repo}\nPull request #${c.pr_number}: ${c.title}\n\n<description>\n${c.body}\n</description>\n\n${files}`;
}

const toMap = (list) => Object.fromEntries(list.map((f) => [f.path, f.content]));

/** Claude's problem → one entry of import.json (maps instead of lists, empty strings → null). */
export function toImportEntry(p, prUrl) {
  const cb = p.codebase;
  return {
    title: p.title,
    slug: p.slug,
    short_description: p.short_description,
    codebase_context: p.codebase_context,
    incident_report: p.incident_report,
    difficulty: p.difficulty,
    category_slug: p.category_slug,
    time_limit_minutes: p.time_limit_minutes,
    bug_summary: p.bug_summary,
    source_url: prUrl,
    tags: p.tags,
    codebase: {
      repository_name: cb.repository_name,
      repository_structure: cb.files.map((f) => f.path).sort(),
      files: toMap(cb.files),
      language: cb.language || "javascript",
      framework: cb.framework || null,
      solution_files: toMap(cb.solution_files),
      hidden_files: toMap(cb.hidden_files),
      setup_commands: cb.setup_commands || null,
      run_command: cb.run_command || null,
    },
    checks: p.checks.map((c) => ({ ...c, expected_output: null })),
  };
}

/**
 * One Claude call → { accepted, rejection_reason, problem } (raw, from the schema), or throws a Rejection.
 * Wrapped in an object so tests can replace it without calling the API.
 */
export const enrichAi = {
  async analyze(candidate, signal) {
    client ??= new Anthropic({ apiKey: config.anthropicApiKey });
    const message = await client.beta.messages
      .stream(
        {
          model: config.analysisModel,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt(candidate) }],
        },
        { signal },
      )
      .finalMessage();
    if (message.stop_reason === "refusal") throw new Rejection("Claude declined this pull request");
    if (message.stop_reason === "max_tokens") throw new Rejection("The answer was cut off (problem too large)");
    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    try {
      return JSON.parse(text);
    } catch {
      throw new Rejection("Claude did not return valid JSON");
    }
  },
};

export class Rejection extends Error {}

const wait = (seconds, signal) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, seconds * 1000);
    signal?.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

/** The analysis with one retry after a rate limit (emits { type: "rate_limit", seconds }). */
async function analyzeWithRetry(candidate, emit, signal) {
  try {
    return await enrichAi.analyze(candidate, signal);
  } catch (err) {
    if (!(err instanceof Anthropic.RateLimitError)) throw err;
    emit({ type: "rate_limit", seconds: RATE_LIMIT_WAIT });
    await wait(RATE_LIMIT_WAIT, signal);
    return enrichAi.analyze(candidate, signal);
  }
}

export const enrichService = {
  /**
   * Enriches `candidates` one at a time. Events per candidate: enrich_progress { index, total, pr_url }, then
   * accepted { index, pr_url, problem } or rejected { index, pr_url, reason } (AI errors count as rejected);
   * rate_limit while waiting; at the end enrich_done { total, accepted, rejected, problems }.
   */
  async enrich(candidates, emit, signal) {
    const problems = [];
    let rejected = 0;
    for (const [index, c] of candidates.entries()) {
      if (signal?.aborted) return;
      emit({ type: "enrich_progress", index, total: candidates.length, pr_url: c.pr_url });
      let reason;
      try {
        const out = await analyzeWithRetry(c, emit, signal);
        if (out.accepted && out.problem) {
          const problem = toImportEntry(out.problem, c.pr_url);
          problems.push(problem);
          emit({ type: "accepted", index, pr_url: c.pr_url, problem });
          continue;
        }
        reason = out.rejection_reason || "Rejected without a reason";
      } catch (err) {
        if (signal?.aborted) return;
        if (err instanceof Rejection) reason = err.message;
        else if (err instanceof Anthropic.APIError) {
          console.error("Import enrichment failed:", err.status, err.message);
          reason = err instanceof Anthropic.RateLimitError ? "Claude rate limit (after one retry)" : `Claude API error ${err.status ?? ""}`.trim();
        } else throw err;
      }
      rejected++;
      emit({ type: "rejected", index, pr_url: c.pr_url, reason });
    }
    emit({ type: "enrich_done", total: candidates.length, accepted: problems.length, rejected, problems });
  },
};
