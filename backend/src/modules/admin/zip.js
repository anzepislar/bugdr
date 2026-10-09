import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { HttpError } from "../../errors.js";
import { LIMITS, validateFiles } from "../runner/runner.service.js";

// A10: reads an uploaded ZIP into { path: text } with node:zlib, no dependency (D21).
// ponytail: plain ZIP only - no ZIP64 (> 4 GB / > 65k entries) and no encryption; both are refused with a 400.

export const ZIP_MAX_BYTES = 10 * 1024 * 1024; // D21
const MAX_ENTRIES = 10_000;
// Never part of a problem (D21): dependencies, VCS data, OS junk, lock files (no npm install in the runner, D53) and
// binary files, by name so they are never unpacked. Other binaries are dropped after unpacking (not UTF-8 / NUL bytes).
const SKIPPED_DIRS = new Set(["node_modules", ".git", "__MACOSX"]);
const SKIPPED_FILES = new Set([".DS_Store", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"]);
const BINARY = /\.(png|jpe?g|gif|webp|ico|bmp|pdf|zip|gz|tgz|tar|woff2?|ttf|otf|eot|mp[34]|mov|wasm|exe|dll|so|dylib|bin)$/i;
const SKIPPED = (segments) =>
  segments.some((s) => SKIPPED_DIRS.has(s)) || SKIPPED_FILES.has(segments.at(-1)) || BINARY.test(segments.at(-1));

const bad = (message) => new HttpError(400, "INVALID_ZIP", message);
const utf8 = new TextDecoder("utf-8", { fatal: true });

/** The raw entries of a ZIP: [{ name, method, flags, compressedSize, size, offset }] from the central directory. */
function centralDirectory(buf) {
  // End of central directory: 22 bytes + a comment of up to 65535 bytes at the very end.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw bad("This file is not a ZIP archive.");
  const count = buf.readUInt16LE(eocd + 10);
  const start = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || start === 0xffffffff) throw bad("ZIP64 archives are not supported.");
  if (count > MAX_ENTRIES) throw bad(`The ZIP has more than ${MAX_ENTRIES} entries.`);

  const entries = [];
  let p = start;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw bad("The ZIP archive is damaged.");
    const nameLength = buf.readUInt16LE(p + 28);
    entries.push({
      flags: buf.readUInt16LE(p + 8),
      method: buf.readUInt16LE(p + 10),
      compressedSize: buf.readUInt32LE(p + 20),
      size: buf.readUInt32LE(p + 24),
      offset: buf.readUInt32LE(p + 42),
      name: buf.toString("utf8", p + 46, p + 46 + nameLength),
    });
    p += 46 + nameLength + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return entries;
}

function inflate(buf, entry) {
  const local = entry.offset;
  if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw bad("The ZIP archive is damaged.");
  const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const data = buf.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.flags & 1) throw bad("Encrypted ZIP archives are not supported.");
  if (entry.size > LIMITS.fileBytes) throw bad(`File too large: ${entry.name}`);
  if (entry.method === 0) return data;
  if (entry.method !== 8) throw bad(`Unsupported compression in ${entry.name}.`);
  try {
    // The size in the header can lie (ZIP bomb): cap the output itself.
    return inflateRawSync(data, { maxOutputLength: LIMITS.fileBytes });
  } catch {
    throw bad(`File too large or damaged: ${entry.name}`);
  }
}

/**
 * The text files of a ZIP as { path: content }, plus a SHA-256 of them for the duplicate check.
 * Any path that leaves the root ("..", absolute, backslashes) rejects the whole upload. node_modules, .git and
 * binary files are left out; a single top-level folder (GitHub's "repo-main/") is removed.
 */
export function readZip(buf) {
  if (buf.length > ZIP_MAX_BYTES) throw bad("The ZIP is larger than 10 MB.");
  const kept = [];
  for (const entry of centralDirectory(buf)) {
    if (entry.name.endsWith("/")) continue; // folder
    const segments = entry.name.split("/");
    if (entry.name.startsWith("/") || /[\\\0]/.test(entry.name) || segments.some((s) => s === ".." || s === "."))
      throw bad(`Unsafe path in the ZIP: ${entry.name.slice(0, 200)}`);
    if (SKIPPED(segments)) continue;
    let text;
    try {
      text = utf8.decode(inflate(buf, entry));
    } catch (err) {
      if (err instanceof HttpError) throw err;
      continue; // not UTF-8 = binary
    }
    if (text.includes("\0")) continue; // binary
    kept.push([entry.name, text]);
  }
  if (!kept.length) throw bad("The ZIP has no source files.");

  const roots = new Set(kept.map(([path]) => path.split("/")[0]));
  const single = roots.size === 1 && kept.every(([path]) => path.includes("/"));
  const files = Object.fromEntries(kept.map(([path, text]) => [single ? path.slice(path.indexOf("/") + 1) : path, text]));
  validateFiles(files);

  const hash = createHash("sha256");
  for (const path of Object.keys(files).sort()) hash.update(path).update("\0").update(files[path]).update("\0");
  return { files, hash: hash.digest("hex") };
}
