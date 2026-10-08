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

/**
 * One docker CLI call. Output is stdout + stderr, capped; on timeout the client is killed and timedOut is set.
 * onData receives every chunk as it arrives (the terminal streams it); returning false stops the call.
 */
function docker(args, { input, timeoutSeconds, onData } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let timedOut = false;
    const collect = (chunk) => {
      if (output.length < 64_000) output += chunk;
      if (onData && onData(chunk.toString()) === false) child.kill("SIGKILL");
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

/** A sandbox container that removes itself after `lifetimeSeconds` (02: no network, limits, non-root, read-only). */
async function startContainer(name, lifetimeSeconds) {
  const started = await docker(
    [
      "run", "-d", "--rm", "--name", name, "--label", "bugdr.runner=1",
      "--network", "none",
      "--memory", "512m", "--memory-swap", "512m", "--cpus", "1", "--pids-limit", "128",
      "--read-only", "--tmpfs", "/workspace:rw,exec,size=64m,uid=1000,gid=1000", "--tmpfs", "/tmp:rw,size=16m",
      "--user", "1000:1000", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
      "--workdir", "/workspace", "--env", "HOME=/tmp", "--env", "CI=1", "--env", "NO_COLOR=1",
      config.runnerImage, "sleep", String(lifetimeSeconds),
    ],
    { timeoutSeconds: 60 },
  );
  if (started.code !== 0) throw new Error(`Runner container did not start: ${started.output.trim()}`);
}

async function writeFiles(name, files) {
  const written = await docker(["exec", "-i", name, "node", "-e", WRITE_FILES], {
    input: JSON.stringify(files),
    timeoutSeconds: 30,
  });
  if (written.code !== 0) throw new Error(`Writing the workspace failed: ${written.output.trim()}`);
}

const tail = (s) => (s.length > LIMITS.outputChars ? "…" + s.slice(-LIMITS.outputChars) : s).trim();

/**
 * Runs the checks in check_order: problem files → user files → hidden files last (D10) → setup_commands → checks.
 * A check passes when its command exits 0 (and its output contains expected_output, if set).
 * Returns [{ checkId, passed, output? }] - output only for a failed check (R4). User files are validated first.
 * R6: onProgress({ checkId, status: "running" }) before each check and onProgress({ checkId, status: "done", result })
 * after it, so results can be shown while the later checks still run.
 */
export async function runChecks({ files, hiddenFiles, setupCommands, checks }, userFiles, { onProgress } = {}) {
  validateFiles(userFiles);
  const workspace = { ...files, ...userFiles, ...hiddenFiles };
  const name = `bugdr-run-${randomUUID()}`;
  const ordered = [...checks].sort((a, b) => a.checkOrder - b.checkOrder);
  const results = [];
  const record = (result) => {
    results.push(result);
    onProgress?.({ checkId: result.checkId, status: "done", result });
  };
  const failAll = (output) => {
    for (const c of ordered) record({ checkId: c.id, passed: false, output });
    return results;
  };

  try {
    await startContainer(name, LIMITS.containerSeconds);
    await writeFiles(name, workspace);

    if (setupCommands) {
      const setup = await docker(["exec", name, "sh", "-c", setupCommands], { timeoutSeconds: LIMITS.setupSeconds });
      if (setup.code !== 0 || setup.timedOut)
        return failAll(setup.timedOut ? `Setup timed out after ${LIMITS.setupSeconds}s` : `Setup failed:\n${tail(setup.output)}`);
    }

    for (const check of ordered) {
      onProgress?.({ checkId: check.id, status: "running" });
      const run = await docker(["exec", name, "sh", "-c", check.command], { timeoutSeconds: LIMITS.checkSeconds });
      if (run.timedOut) {
        // Killing the docker client leaves the process running in the container: stop everything but PID 1.
        await docker(["exec", name, "kill", "-9", "-1"], { timeoutSeconds: 10 });
        record({ checkId: check.id, passed: false, output: `Timed out after ${LIMITS.checkSeconds}s` });
        continue;
      }
      const passed = run.code === 0 && (check.expectedOutput == null || run.output.includes(check.expectedOutput));
      record(passed ? { checkId: check.id, passed } : { checkId: check.id, passed, output: tail(run.output) });
    }
    return results;
  } finally {
    await docker(["rm", "-f", name], { timeoutSeconds: 30 }).catch(() => {});
  }
}

// R5: one terminal container per open attempt, separate from the check runs. It holds the problem files and the
// user's files - never the hidden checks (D10). Commands run one at a time, stream their output, stop after
// TERMINAL.commandSeconds or when the client goes away. The container is removed after TERMINAL.idleSeconds without
// a command, on give up / solve (stopTerminal), and by itself after TERMINAL.lifetimeSeconds.
// ponytail: the map lives in this process - one backend instance; move it to a shared store when there are more.
export const TERMINAL = { commandSeconds: 30, idleSeconds: 600, lifetimeSeconds: 3600, outputBytes: 256_000, commandLength: 1000 };
const terminals = new Map(); // attemptId → { name, ready, busy, done, idle }

/**
 * Runs `command` in the attempt's terminal container after syncing the files. onOutput(text) gets the output as it
 * comes; `signal` stops the command. Resolves { exitCode } or { stopped: "timeout" | "output" | "aborted" }.
 */
export async function runTerminal(attemptId, problemFiles, userFiles, command, { onOutput, signal }) {
  validateFiles(userFiles);
  if (typeof command !== "string" || !command.trim() || command.length > TERMINAL.commandLength)
    throw new HttpError(400, "INVALID_COMMAND", `Enter a command of at most ${TERMINAL.commandLength} characters`);

  // A command sent right after Stop / Ctrl+C waits briefly for the stopped one to finish cleaning up.
  const running = terminals.get(attemptId);
  if (running?.busy) await Promise.race([running.done, new Promise((r) => setTimeout(r, 3000))]);
  // Checked and claimed without an await in between, so two waiting requests cannot both run.
  let terminal = terminals.get(attemptId);
  if (terminal?.busy) throw new HttpError(409, "TERMINAL_BUSY", "A command is still running. Stop it first.");
  if (!terminal) {
    const name = `bugdr-term-${randomUUID()}`;
    terminal = { name, ready: startContainer(name, TERMINAL.lifetimeSeconds), busy: false, done: null, idle: null };
    terminals.set(attemptId, terminal);
  }
  terminal.busy = true;
  let finished;
  terminal.done = new Promise((r) => (finished = r));
  clearTimeout(terminal.idle);
  try {
    try {
      await terminal.ready;
    } catch (err) {
      terminals.delete(attemptId);
      throw err;
    }
    await writeFiles(terminal.name, { ...problemFiles, ...userFiles });

    let bytes = 0;
    let stopped = null;
    const run = docker(["exec", terminal.name, "sh", "-c", command], {
      timeoutSeconds: TERMINAL.commandSeconds,
      onData: (text) => {
        if (stopped) return false;
        bytes += Buffer.byteLength(text);
        if (bytes > TERMINAL.outputBytes) {
          stopped = "output";
          return false;
        }
        onOutput(text);
      },
    });
    const abort = () => (stopped ??= "aborted");
    signal?.addEventListener("abort", abort);
    // The docker client only notices an abort on its next output chunk, so poll the signal too.
    const watcher = setInterval(() => stopped && killAll(terminal.name), 200);
    const result = await run.finally(() => {
      clearInterval(watcher);
      signal?.removeEventListener("abort", abort);
    });
    if (result.timedOut) stopped ??= "timeout";
    // Whatever stopped the client, stop the processes it started in the container too.
    if (stopped) await killAll(terminal.name);
    return stopped ? { stopped } : { exitCode: result.code };
  } finally {
    terminal.busy = false;
    finished();
    terminal.idle = setTimeout(() => void stopTerminal(attemptId), TERMINAL.idleSeconds * 1000);
    terminal.idle.unref();
  }
}

// Every process in the container except PID 1 (the container's sleep).
const killAll = (name) => docker(["exec", name, "kill", "-9", "-1"], { timeoutSeconds: 10 }).catch(() => {});

/** Removes the attempt's terminal container, if it has one (give up, solve, idle). */
export async function stopTerminal(attemptId) {
  const terminal = terminals.get(attemptId);
  if (!terminal) return;
  terminals.delete(attemptId);
  clearTimeout(terminal.idle);
  await docker(["rm", "-f", terminal.name], { timeoutSeconds: 30 }).catch(() => {});
}
