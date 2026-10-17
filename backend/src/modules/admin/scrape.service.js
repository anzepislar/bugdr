import { config } from "../../config.js";
import { pool } from "../../db.js";

// GitHub scrape for the bulk import (/admin/import): merged bug-fix PRs that change a few JavaScript files, with the
// diff and the buggy (base) version of each changed file. Enrichment (enrich.service.js) turns a candidate into a
// standalone Node-only problem. Plain fetch against the REST API, no SDK. GITHUB_TOKEN raises the limit from 60 to
// 5000 requests an hour.

const API = "https://api.github.com";
const PAGES = 10; // 100 closed PRs per page, newest first (up to 1000 per repo)
const MAX_PER_REPO = 10; // candidates per repo (each one costs a Claude call in enrichment)
const MAX_FILE_LOOKUPS = 40; // bug-titled PRs whose file lists are fetched, per repo
const MAX_SOURCE_FILES = 3;
const MAX_CHANGED_LINES = 150; // in source files, tests excluded: small, self-contained bugs only
const MAX_PATCH_BYTES = 10_000;
const MAX_BEFORE_BYTES = 15_000; // a larger base file is left out; the diff still carries context
const MAX_RATE_LIMIT_WAIT = 5 * 60; // seconds; longer = give up on the repo

const FIX = /\b(fix(es|ed)?|bug|regression|crash(es)?|incorrect|wrong|broken)\b/i;
const NOT_A_BUG = /\b(docs?|typo|readme|ci|deps?|bump|chore|lint|benchmarks?|perf|revert|release)\b/i;
const JS = /\.(c|m)?[jt]s$/;
const TEST = /(^|\/)(test|tests|__tests__|spec|fixtures?|benchmark|bench)\//i;
const IGNORED = /(^|\/)(docs?\/|[^/]*\.md$|CHANGELOG|AUTHORS|\.github\/)/i;

/** A merged PR whose title reads like a bug fix. */
export function isBugFix(pr) {
  return !!pr.merged_at && FIX.test(pr.title) && !NOT_A_BUG.test(pr.title);
}

/**
 * The PR's changed source files, or null when it is not a small JavaScript-only fix: 1-3 modified .js/.ts files
 * outside tests, at most 150 changed lines, nothing else changed but tests and docs (no C++, configs, lock files).
 */
export function sourceFiles(files) {
  const source = [];
  for (const f of files) {
    if (TEST.test(f.filename) || /\.(test|spec)\.[cm]?[jt]s$/.test(f.filename) || IGNORED.test(f.filename)) continue;
    if (!JS.test(f.filename) || f.status !== "modified" || !f.patch || f.patch.length > MAX_PATCH_BYTES) return null;
    source.push(f);
  }
  if (!source.length || source.length > MAX_SOURCE_FILES) return null;
  if (source.reduce((n, f) => n + f.changes, 0) > MAX_CHANGED_LINES) return null;
  return source;
}

const wait = (seconds, signal) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, seconds * 1000);
    signal?.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

/** GitHub GET; waits out a rate limit (emitting { type: "rate_limit", seconds }) up to 5 minutes, once. */
async function github(path, { emit, signal, raw = false }) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      headers: {
        Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
        "User-Agent": "bugdr-import",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(config.githubToken && { Authorization: `Bearer ${config.githubToken}` }),
      },
      signal,
    });
    const limited =
      (res.status === 403 || res.status === 429) &&
      (res.headers.get("x-ratelimit-remaining") === "0" || res.headers.has("retry-after"));
    if (limited && attempt === 0) {
      const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
      const seconds = Number(res.headers.get("retry-after")) || Math.max(1, Math.ceil((reset - Date.now()) / 1000));
      if (seconds <= MAX_RATE_LIMIT_WAIT) {
        emit({ type: "rate_limit", seconds });
        await wait(seconds, signal);
        continue;
      }
    }
    if (limited)
      throw new Error(
        config.githubToken ? "GitHub rate limit reached. Try again later." : "GitHub rate limit reached. Set GITHUB_TOKEN in backend/.env.",
      );
    if (res.status === 404) throw new Error("Repository or file not found");
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
    return raw ? res.text() : res.json();
  }
}

/** Candidates of one repo; reports progress after every PR it looks at. */
async function scrapeRepo(repo, known, { emit, signal }) {
  const counts = { repo, fetched: 0, accepted: 0, duplicates: 0 };
  const candidates = [];
  let lookups = 0;
  for (let page = 1; page <= PAGES && candidates.length < MAX_PER_REPO; page++) {
    const prs = await github(`/repos/${repo}/pulls?state=closed&sort=created&direction=desc&per_page=100&page=${page}`, {
      emit,
      signal,
    });
    for (const pr of prs) {
      if (signal?.aborted || candidates.length >= MAX_PER_REPO || lookups >= MAX_FILE_LOOKUPS) break;
      counts.fetched++;
      if (!isBugFix(pr)) continue;
      if (known.has(pr.html_url)) {
        counts.duplicates++;
        continue;
      }
      lookups++;
      const files = await github(`/repos/${repo}/pulls/${pr.number}/files?per_page=100`, { emit, signal });
      const source = sourceFiles(files);
      if (!source) continue;
      const changed = [];
      for (const f of source) {
        // The buggy version = the file at the PR's base commit. Too large → diff only.
        const before = await github(`/repos/${repo}/contents/${encodeURI(f.filename)}?ref=${pr.base.sha}`, {
          emit,
          signal,
          raw: true,
        }).catch(() => null);
        changed.push({ path: f.filename, patch: f.patch, before: before && before.length <= MAX_BEFORE_BYTES ? before : null });
      }
      // Tests the PR added or changed show the expected behaviour; diffs only.
      const tests = files
        .filter((f) => !source.includes(f) && JS.test(f.filename) && f.patch && f.patch.length <= MAX_PATCH_BYTES)
        .slice(0, 2)
        .map((f) => ({ path: f.filename, patch: f.patch, before: null }));
      candidates.push({
        repo,
        pr_number: pr.number,
        pr_url: pr.html_url,
        title: pr.title,
        body: (pr.body ?? "").slice(0, 4000),
        files: [...changed, ...tests],
      });
      known.add(pr.html_url);
      counts.accepted++;
      emit({ type: "repo_progress", ...counts });
    }
    emit({ type: "repo_progress", ...counts });
    if (prs.length < 100 || lookups >= MAX_FILE_LOOKUPS) break;
  }
  return { counts, candidates };
}

export const scrapeService = {
  /**
   * Scrapes `repos` ("owner/name") one after another. Events: repo_start, repo_progress, rate_limit, repo_done,
   * repo_error (that repo is skipped), then done { candidates, totalFetched, totalAccepted, duplicates }.
   * PRs already imported (problems.source_url) are skipped.
   */
  async scrape(repos, emit, signal) {
    const { rows } = await pool.query("SELECT source_url FROM problems WHERE source_url IS NOT NULL");
    const known = new Set(rows.map((r) => r.source_url));
    const all = [];
    const total = { totalFetched: 0, totalAccepted: 0, duplicates: 0 };
    for (const repo of repos) {
      if (signal?.aborted) return;
      emit({ type: "repo_start", repo });
      try {
        const { counts, candidates } = await scrapeRepo(repo, known, { emit, signal });
        all.push(...candidates);
        total.totalFetched += counts.fetched;
        total.totalAccepted += counts.accepted;
        total.duplicates += counts.duplicates;
        emit({ type: "repo_done", ...counts });
      } catch (err) {
        if (signal?.aborted) return;
        emit({ type: "repo_error", repo, message: err.message });
      }
    }
    emit({ type: "done", candidates: all, ...total });
  },
};
