import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { config } from "../../config.js";
import { HttpError } from "../../errors.js";

// R3: runs a problem's checks against the user's files in a throwaway Docker container (D12: the docker CLI, no
// dependency). Isolation (02): no network, CPU/memory/process limits, read-only root, non-root user, no capabilities,
// files piped in over stdin (no host mounts), a time limit per check and for the container as a whole.
// No endpoint here - R4 calls runChecks from POST /attempts/:id/test.

export const LIMITS = {
  files: 200,
  fileBytes: 200_000,
  totalBytes: 2_000_000,
  pathLength: 200,
  checkSeconds: 20,
  setupSeconds: 60,
  containerSeconds: 300, // the container removes itself after this, even if the backend dies mid-run
  outputChars: 4000,
};

/** Only relative paths inside the project: no "..", no absolute paths, no backslashes, within the size limits. */
export function validateFiles(files) {
  const invalid = (message) => new HttpError(400, "INVALID_FILES", message);
  if (!files || typeof files !== "object" || Array.isArray(files)) throw invalid("files must be an object of path → content");
  const entries = Object.entries(files);
  if (entries.length > LIMITS.files) throw invalid(`At most ${LIMITS.files} files`);
  let total = 0;
  for (const [path, content] of entries) {
    const segments = path.split("/");
    if (
      !path ||
      path.length > LIMITS.pathLength ||
      path.startsWith("/") ||
      /[\\\0]/.test(path) ||
      segments.some((s) => s === "" || s === "." || s === "..")
    )
      throw invalid(`Invalid file path: ${path.slice(0, LIMITS.pathLength)}`);
    if (typeof content !== "string") throw invalid(`File content must be text: ${path}`);
    const bytes = Buffer.byteLength(content);
    if (bytes > LIMITS.fileBytes) throw invalid(`File too large: ${path}`);
    total += bytes;
  }
  if (total > LIMITS.totalBytes) throw invalid("The files are too large in total");
}

/** One docker CLI call. Output is stdout + stderr, capped; on timeout the client is killed and timedOut is set. */
function docker(args, { input, timeoutSeconds } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let timedOut = false;
    const collect = (chunk) => {
      if (output.length < 64_000) output += chunk;
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const timer = timeoutSeconds
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, timeoutSeconds * 1000)
      : null;
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output, timedOut });
    });
    child.stdin.on("error", () => {}); // the process may exit before reading everything
    child.stdin.end(input);
  });
}

// Runs inside the container: writes the JSON { path: content } from stdin under /workspace, refusing any path outside.
const WRITE_FILES = `
const fs = require("fs"), path = require("path");
let input = "";
process.stdin.on("data", (d) => (input += d)).on("end", () => {
  for (const [file, content] of Object.entries(JSON.parse(input))) {
    const target = path.resolve("/workspace", file);
    if (!target.startsWith("/workspace/")) process.exit(3);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
});`;

const tail = (s) => (s.length > LIMITS.outputChars ? "…" + s.slice(-LIMITS.outputChars) : s).trim();

/**
 * Runs the checks in check_order: problem files → user files → hidden files last (D10) → setup_commands → checks.
 * A check passes when its command exits 0 (and its output contains expected_output, if set).
 * Returns [{ checkId, passed, output? }] - output only for a failed check (R4). User files are validated first.
 */
export async function runChecks({ files, hiddenFiles, setupCommands, checks }, userFiles) {
  validateFiles(userFiles);
  const workspace = { ...files, ...userFiles, ...hiddenFiles };
  const name = `bugdr-run-${randomUUID()}`;
  const ordered = [...checks].sort((a, b) => a.checkOrder - b.checkOrder);
  const failAll = (output) => ordered.map((c) => ({ checkId: c.id, passed: false, output }));

  try {
    const started = await docker(
      [
        "run", "-d", "--rm", "--name", name,
        "--network", "none",
        "--memory", "512m", "--memory-swap", "512m", "--cpus", "1", "--pids-limit", "128",
        "--read-only", "--tmpfs", "/workspace:rw,exec,size=64m,uid=1000,gid=1000", "--tmpfs", "/tmp:rw,size=16m",
        "--user", "1000:1000", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
        "--workdir", "/workspace", "--env", "HOME=/tmp", "--env", "CI=1",
        config.runnerImage, "sleep", String(LIMITS.containerSeconds),
      ],
      { timeoutSeconds: 60 },
    );
    if (started.code !== 0) throw new Error(`Runner container did not start: ${started.output.trim()}`);

    const written = await docker(["exec", "-i", name, "node", "-e", WRITE_FILES], {
      input: JSON.stringify(workspace),
      timeoutSeconds: 30,
    });
    if (written.code !== 0) throw new Error(`Writing the workspace failed: ${written.output.trim()}`);

    if (setupCommands) {
      const setup = await docker(["exec", name, "sh", "-c", setupCommands], { timeoutSeconds: LIMITS.setupSeconds });
      if (setup.code !== 0 || setup.timedOut)
        return failAll(setup.timedOut ? `Setup timed out after ${LIMITS.setupSeconds}s` : `Setup failed:\n${tail(setup.output)}`);
    }

    const results = [];
    for (const check of ordered) {
      const run = await docker(["exec", name, "sh", "-c", check.command], { timeoutSeconds: LIMITS.checkSeconds });
      if (run.timedOut) {
        // Killing the docker client leaves the process running in the container: stop everything but PID 1.
        await docker(["exec", name, "kill", "-9", "-1"], { timeoutSeconds: 10 });
        results.push({ checkId: check.id, passed: false, output: `Timed out after ${LIMITS.checkSeconds}s` });
        continue;
      }
      const passed = run.code === 0 && (check.expectedOutput == null || run.output.includes(check.expectedOutput));
      results.push(passed ? { checkId: check.id, passed } : { checkId: check.id, passed, output: tail(run.output) });
    }
    return results;
  } finally {
    await docker(["rm", "-f", name], { timeoutSeconds: 30 }).catch(() => {});
  }
}
