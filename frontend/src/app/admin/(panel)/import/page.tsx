"use client";

import { useState, type ReactNode } from "react";
import {
  cardClass,
  DifficultyBadge,
  ErrorMessage,
  inputClass,
  primaryButton,
  saveErrorMessage,
  secondaryButton,
  Spinner,
} from "@/components/admin/problems/shared";
import { Icon } from "@/components/Icon";
import { api, apiStream, ApiError } from "@/lib/api";
import { CATEGORIES, DIFFICULTIES, type Difficulty } from "@/lib/types/problem";

// Bulk import from GitHub: scrape merged bug-fix PRs (POST /admin/scrape) → Claude rebuilds each one as a
// standalone Node problem or rejects it (POST /admin/enrich) → preview → saved one at a time on confirm
// (POST /admin/bulk-import-problem) as drafts; the server runs the checks in the background and publishes on a pass.

const DEFAULT_REPOS = [
  "nodejs/node",
  "expressjs/express",
  "fastify/fastify",
  "koajs/koa",
  "nestjs/nest",
  "socket.io/socket.io",
  "axios/axios",
  "node-fetch/node-fetch",
  "sindresorhus/got",
  "sindresorhus/execa",
  "sindresorhus/p-limit",
  "yargs/yargs",
  "chalk/chalk",
  "mochajs/mocha",
  "jestjs/jest",
  "eslint/eslint",
  "prettier/prettier",
  "vitejs/vite",
  "rollup/rollup",
  "webpack/webpack",
  "babel/babel",
  "postcss/postcss",
  "sequelize/sequelize",
  "typeorm/typeorm",
  "knex/knex",
  "django/django",
  "pallets/flask",
  "fastapi/fastapi",
  "psf/requests",
  "celery/celery",
  "sqlalchemy/sqlalchemy",
  "pydantic/pydantic",
  "encode/httpx",
  "rails/rails",
  "sinatra/sinatra",
  "golang/go",
  "gin-gonic/gin",
  "gorilla/mux",
  "labstack/echo",
  "rust-lang/rust",
  "actix/actix-web",
  "tokio-rs/tokio",
  "hyperium/hyper",
  "laravel/laravel",
  "symfony/symfony",
  "spring-projects/spring-boot",
  "vercel/next.js",
  "nuxt/nuxt",
  "sveltejs/svelte",
  "vuejs/vue",
  "angular/angular",
  "prisma/prisma",
  "supabase/supabase",
  "drizzle-team/drizzle-orm",
  "stripe/stripe-node",
  "stripe/stripe-python",
  "twilio/twilio-node",
  "redis/node-redis",
  "mongoosejs/mongoose",
].join("\n");
const ENRICH_BATCH = 10; // candidates per /admin/enrich request: keeps each body small and a dropped stream cheap
const REPO = /^[\w.-]+\/[\w.-]+$/;

type Phase = "idle" | "scraping" | "scrape_done" | "enriching" | "enrich_done" | "importing" | "done" | "error";

/** A scraped PR; only pr_url is read here, the rest goes back to the server as is. */
interface Candidate {
  pr_url: string;
}

/** One enriched problem in import.json shape - nothing is trusted until validate() passes. */
interface Entry {
  title?: unknown;
  slug?: unknown;
  short_description?: unknown;
  difficulty?: unknown;
  category_slug?: unknown;
  time_limit_minutes?: unknown;
  source_url?: unknown;
  codebase?: { files?: unknown; language?: unknown };
  checks?: unknown;
}

type Status = "pending" | "importing" | "done" | "failed";
interface Row {
  key: number;
  entry: Entry;
  errors: string[];
  status: Status;
  message?: string;
}

interface RepoStatus {
  repo: string;
  state: "pending" | "running" | "done" | "error";
  fetched: number;
  accepted: number;
  message?: string;
}

type ScrapeEvent =
  | { type: "repo_start"; repo: string }
  | { type: "repo_progress" | "repo_done"; repo: string; fetched: number; accepted: number; duplicates: number }
  | { type: "repo_error"; repo: string; message: string }
  | { type: "rate_limit"; seconds: number }
  | { type: "done"; candidates: Candidate[]; totalFetched: number; totalAccepted: number; duplicates: number }
  | { type: "error"; message: string };

type EnrichEvent =
  | { type: "enrich_progress"; index: number; total: number; pr_url: string }
  | { type: "accepted"; index: number; pr_url: string; problem: Entry }
  | { type: "rejected"; index: number; pr_url: string; reason: string }
  | { type: "rate_limit"; seconds: number }
  | { type: "enrich_done"; total: number; accepted: number; rejected: number; problems: Entry[] }
  | { type: "error"; message: string };

interface LogLine {
  ok: boolean;
  prUrl: string;
  text: string;
}

const filled = (v: unknown, max = Infinity) => typeof v === "string" && v.trim() !== "" && v.length <= max;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown) => (typeof v === "string" && v ? v : "—");
const isDifficulty = (v: unknown): v is Difficulty => DIFFICULTIES.includes(v as Difficulty);
const categoryName = (v: unknown) => CATEGORIES.find((c) => c.slug === v)?.name;
const checkCount = (e: Entry) => (Array.isArray(e.checks) ? e.checks.length : 0);
const prLabel = (url: string) => url.replace(/^https:\/\/github\.com\//, "").replace("/pull/", " #");
const errorText = (err: unknown) => (err instanceof ApiError ? err.message : "The connection to the server was lost.");

/** Problems with an entry, one message per field. The server checks everything again. */
function validate(e: Entry): string[] {
  const errors: string[] = [];
  if (!filled(e.title, 255)) errors.push("title: 1-255 characters");
  if (typeof e.slug !== "string" || !/^[a-z0-9-]+$/.test(e.slug)) errors.push("slug: lowercase letters, digits and hyphens");
  if (!filled(e.short_description, 300)) errors.push("short_description: 1-300 characters");
  if (!isDifficulty(e.difficulty)) errors.push("difficulty: easy, medium, hard or get_a_job");
  if (!categoryName(e.category_slug)) errors.push(`category_slug: one of ${CATEGORIES.map((c) => c.slug).join(", ")}`);
  const t = e.time_limit_minutes;
  if (!Number.isInteger(t) || (t as number) < 1 || (t as number) > 180) errors.push("time_limit_minutes: whole number 1-180");
  if (!isObject(e.codebase) || !isObject(e.codebase.files) || !Object.keys(e.codebase.files).length)
    errors.push("codebase.files: at least one file");
  if (
    !Array.isArray(e.checks) ||
    !e.checks.length ||
    e.checks.some((c) => !isObject(c) || !filled(c.description) || !filled(c.check_command))
  )
    errors.push("checks: at least one, each with a description and check_command");
  return errors;
}

function StatusIcon({ status }: { status: Status | RepoStatus["state"] }) {
  if (status === "importing" || status === "running")
    return (
      <span className="text-action" aria-label="In progress">
        <Spinner />
      </span>
    );
  if (status === "done") return <Icon name="check" className="h-4 w-4 text-passed" />;
  if (status === "failed" || status === "error") return <Icon name="x" className="h-4 w-4 text-failed" />;
  return <span aria-label="Pending" className="inline-block h-2 w-2 rounded-full bg-muted2" />;
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  return (
    <div
      className="mt-3 h-2 overflow-hidden rounded-full bg-canvas"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div className="h-full bg-action transition-[width]" style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
    </div>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">{children}</div>;
}

export default function AdminImportPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [repoText, setRepoText] = useState(DEFAULT_REPOS);
  const [inputError, setInputError] = useState("");
  const [error, setError] = useState("");
  const [rateLimit, setRateLimit] = useState(0);

  // Scrape
  const [repos, setRepos] = useState<RepoStatus[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [duplicates, setDuplicates] = useState(0);

  // Enrich
  const [current, setCurrent] = useState("");
  const [accepted, setAccepted] = useState(0);
  const [rejections, setRejections] = useState<string[]>([]);
  const [log, setLog] = useState<LogLine[]>([]);

  // Preview + import
  const [rows, setRows] = useState<Row[]>([]);

  const reset = () => {
    setPhase("idle");
    setError("");
    setRateLimit(0);
    setRepos([]);
    setCandidates([]);
    setDuplicates(0);
    setCurrent("");
    setAccepted(0);
    setRejections([]);
    setLog([]);
    setRows([]);
  };
  const fail = (message: string) => {
    setError(message);
    setPhase("error");
  };

  async function startScrape() {
    const list = [...new Set(repoText.split(/[\s,]+/).filter(Boolean))];
    const bad = list.filter((r) => !REPO.test(r));
    if (!list.length || list.length > 20 || bad.length)
      return setInputError(bad.length ? `Not owner/repo: ${bad.join(", ")}` : "Enter 1-20 repositories.");
    setInputError("");
    setRepos(list.map((repo) => ({ repo, state: "pending", fetched: 0, accepted: 0 })));
    setPhase("scraping");
    const patch = (repo: string, p: Partial<RepoStatus>) =>
      setRepos((rs) => rs.map((r) => (r.repo === repo ? { ...r, ...p } : r)));
    let done = false;
    try {
      await apiStream<ScrapeEvent>("/admin/scrape", { method: "POST", body: JSON.stringify({ repos: list }) }, (e) => {
        if (e.type === "repo_start" || e.type === "repo_progress") setRateLimit(0);
        if (e.type === "repo_start") patch(e.repo, { state: "running" });
        else if (e.type === "repo_progress") patch(e.repo, { fetched: e.fetched, accepted: e.accepted });
        else if (e.type === "repo_done") patch(e.repo, { state: "done", fetched: e.fetched, accepted: e.accepted });
        else if (e.type === "repo_error") patch(e.repo, { state: "error", message: e.message });
        else if (e.type === "rate_limit") setRateLimit(e.seconds);
        else if (e.type === "error") throw new ApiError(500, "STREAM", e.message);
        else if (e.type === "done") {
          done = true;
          setCandidates(e.candidates);
          setDuplicates(e.duplicates);
        }
      });
      if (!done) throw new Error("stream ended early");
      setRateLimit(0);
      setPhase("scrape_done");
    } catch (err) {
      fail(errorText(err));
    }
  }

  async function startEnrich() {
    setPhase("enriching");
    const problems: Entry[] = [];
    try {
      for (let start = 0; start < candidates.length; start += ENRICH_BATCH) {
        const batch = candidates.slice(start, start + ENRICH_BATCH);
        let done = false;
        await apiStream<EnrichEvent>("/admin/enrich", { method: "POST", body: JSON.stringify({ candidates: batch }) }, (e) => {
          if (e.type === "enrich_progress") {
            setCurrent(e.pr_url);
            setRateLimit(0);
          } else if (e.type === "rate_limit") setRateLimit(e.seconds);
          else if (e.type === "accepted") {
            problems.push(e.problem);
            setAccepted((n) => n + 1);
            setLog((l) => [{ ok: true, prUrl: e.pr_url, text: text(e.problem.title) }, ...l].slice(0, 10));
          } else if (e.type === "rejected") {
            setRejections((r) => [...r, e.reason]);
            setLog((l) => [{ ok: false, prUrl: e.pr_url, text: e.reason }, ...l].slice(0, 10));
          } else if (e.type === "error") throw new ApiError(500, "STREAM", e.message);
          else if (e.type === "enrich_done") done = true;
        });
        if (!done) throw new Error("stream ended early");
      }
      setRows(problems.map((entry, key) => ({ key, entry, errors: validate(entry), status: "pending" })));
      setRateLimit(0);
      setPhase("enrich_done");
    } catch (err) {
      fail(errorText(err));
    }
  }

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // One at a time, so a large import never hammers the database. Invalid rows are left out.
  async function startImport() {
    const queue = rows.filter((r) => !r.errors.length);
    setRows(queue);
    setPhase("importing");
    for (const row of queue) {
      update(row.key, { status: "importing" });
      try {
        await api("/admin/bulk-import-problem", { method: "POST", body: JSON.stringify(row.entry) });
        update(row.key, { status: "done" });
      } catch (err) {
        update(row.key, { status: "failed", message: saveErrorMessage(err) });
      }
    }
    setPhase("done");
  }

  /** The problems in the preview (removed rows left out) as import.json, so a reload doesn't lose the Claude work. */
  function downloadResults() {
    const blob = new Blob([JSON.stringify(rows.map((r) => r.entry), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "results.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const startOver = (
    <button type="button" onClick={reset} className={secondaryButton}>
      Start over
    </button>
  );
  const rateNotice = rateLimit > 0 && (
    <p className="mt-3 text-sm text-pending">Rate limit reached - resuming in about {rateLimit}s</p>
  );

  const valid = rows.filter((r) => !r.errors.length);
  const imported = rows.filter((r) => r.status === "done").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const totalFetched = repos.reduce((n, r) => n + r.fetched, 0);
  const processed = accepted + rejections.length;
  const topReasons = Object.entries(
    rejections.reduce<Record<string, number>>((acc, r) => ((acc[r] = (acc[r] ?? 0) + 1), acc), {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="w-full px-6 py-8 wide:mx-auto wide:max-w-[1200px]">
      <h1 className="text-3xl font-semibold text-text">Import problems</h1>
      <p className="mt-2 text-muted">
        Turn merged bug-fix pull requests into problems. Confirmed problems publish automatically once their checks pass.
      </p>

      {phase === "idle" && (
        <div className={`${cardClass} mt-8`}>
          <label htmlFor="repos" className="mb-1.5 block text-sm font-medium text-text">
            Repositories
          </label>
          <textarea
            id="repos"
            value={repoText}
            onChange={(e) => setRepoText(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder="owner/repo, one per line"
            className={`${inputClass} font-mono`}
          />
          <p className="mt-2 text-xs text-muted">
            owner/repo, one per line (up to 20). Each candidate PR costs one Claude call in the next step.
          </p>
          {inputError && <ErrorMessage>{inputError}</ErrorMessage>}
          <Actions>
            <button type="button" onClick={startScrape} className={primaryButton}>
              Start scrape
            </button>
          </Actions>
        </div>
      )}

      {(phase === "scraping" || phase === "scrape_done") && (
        <div className={`${cardClass} mt-8`}>
          {phase === "scraping" ? (
            <p className="text-sm text-text">
              Scraping GitHub… {totalFetched} PRs found, {candidates.length || repos.reduce((n, r) => n + r.accepted, 0)}{" "}
              candidates
            </p>
          ) : (
            <p className="text-sm font-semibold text-text">
              {candidates.length} candidates found across {repos.length} repos ({duplicates} duplicates skipped)
            </p>
          )}
          {phase === "scraping" && duplicates > 0 && (
            <p className="mt-1 text-sm text-muted">Skipped {duplicates} already-imported PRs</p>
          )}
          {rateNotice}
          <ul className="mt-4 divide-y divide-border">
            {repos.map((r) => (
              <li key={r.repo} className="flex items-start gap-3 py-2.5 text-sm">
                <span className="mt-0.5 flex w-4 justify-center">
                  <StatusIcon status={r.state} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="break-all text-text">{r.repo}</span>
                  {r.message && <span className="block text-xs text-failed">{r.message}</span>}
                </span>
                <span className="shrink-0 tabular-nums text-muted">
                  {r.fetched} PRs, {r.accepted} accepted
                </span>
              </li>
            ))}
          </ul>
          {phase === "scrape_done" && (
            <Actions>
              {startOver}
              {candidates.length > 0 && (
                <button type="button" onClick={startEnrich} className={primaryButton}>
                  Start enrichment
                </button>
              )}
            </Actions>
          )}
        </div>
      )}

      {phase === "enriching" && (
        <div className={`${cardClass} mt-8`}>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-text">
              {processed} / {candidates.length} processed
            </span>
            <span>
              <span className="text-passed">✓ {accepted} accepted</span>
              <span className="text-muted"> · </span>
              <span className="text-failed">✗ {rejections.length} rejected</span>
            </span>
          </div>
          <ProgressBar value={processed} max={candidates.length} />
          {current && <p className="mt-3 break-all text-xs text-muted">Analysing {prLabel(current)}…</p>}
          {rateNotice}
          {log.length > 0 && (
            <ul className="mt-4 space-y-1.5 text-xs">
              {log.map((l, i) => (
                <li key={`${l.prUrl}-${i}`} className="flex gap-2">
                  <span className={l.ok ? "text-passed" : "text-failed"}>{l.ok ? "✓" : "✗"}</span>
                  <span className="min-w-0 break-words">
                    <a href={l.prUrl} target="_blank" rel="noreferrer" className="text-action hover:underline">
                      {prLabel(l.prUrl)}
                    </a>{" "}
                    <span className="text-muted">{l.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {phase === "enrich_done" && (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className={cardClass}>
              <p className="text-sm text-muted">Accepted</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-passed">{accepted}</p>
            </div>
            <div className={cardClass}>
              <p className="text-sm text-muted">Rejected</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-failed">{rejections.length}</p>
            </div>
          </div>
          {topReasons.length > 0 && (
            <div className={`${cardClass} mt-4`}>
              <h2 className="text-lg font-semibold text-text">Top rejection reasons</h2>
              <ul className="mt-3 space-y-1.5 text-sm">
                {topReasons.map(([reason, n]) => (
                  <li key={reason} className="flex gap-3">
                    <span className="w-8 shrink-0 tabular-nums text-muted">×{n}</span>
                    <span className="min-w-0 break-words text-text">{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {rows.length > valid.length && (
            <p className="mt-4 text-sm text-failed">
              {rows.length - valid.length} {rows.length - valid.length === 1 ? "problem has" : "problems have"} errors and
              will be skipped.
            </p>
          )}
        </>
      )}

      {(phase === "importing" || phase === "done") && (
        <div className={`${cardClass} mt-8`}>
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-text">
              {imported} / {rows.length} imported
            </span>
            {failed > 0 && <span className="text-failed">{failed} failed</span>}
          </div>
          <ProgressBar value={imported + failed} max={rows.length} />
          {phase === "done" && (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-text">
                Imported {imported} problems — running checks, will publish automatically on pass.
                {failed > 0 && <span className="text-failed"> {failed} failed to import.</span>}
              </p>
              <button type="button" onClick={reset} className={`${primaryButton} sm:w-fit`}>
                Start over
              </button>
            </div>
          )}
        </div>
      )}

      {phase === "error" && (
        <div className={`${cardClass} mt-8`}>
          <ErrorMessage>{error}</ErrorMessage>
          <Actions>{startOver}</Actions>
        </div>
      )}

      {(phase === "enrich_done" || phase === "importing" || phase === "done") && rows.length > 0 && (
        <table className="mt-6 w-full table-fixed text-left text-sm">
          <thead className="bg-surface text-[11px] font-semibold uppercase tracking-wide text-muted">
            <tr>
              {phase !== "enrich_done" && (
                <th scope="col" className="w-10 rounded-l px-3 py-3">
                  <span className="sr-only">Status</span>
                </th>
              )}
              <th scope="col" className={`px-3 py-3 sm:px-4 ${phase === "enrich_done" ? "rounded-l" : ""}`}>
                Title
              </th>
              <th scope="col" className="hidden w-32 px-3 py-3 lg:table-cell">
                Category
              </th>
              <th scope="col" className="hidden w-28 px-3 py-3 md:table-cell">
                Difficulty
              </th>
              <th scope="col" className="hidden w-28 px-3 py-3 lg:table-cell">
                Language
              </th>
              <th scope="col" className="hidden w-20 px-3 py-3 md:table-cell">
                Checks
              </th>
              {phase === "enrich_done" && (
                <th scope="col" className="w-12 rounded-r px-3 py-3">
                  <span className="sr-only">Remove</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border align-top">
                {phase !== "enrich_done" && (
                  <td className="px-3 py-4">
                    <StatusIcon status={r.status} />
                  </td>
                )}
                <td className="px-3 py-4 sm:px-4">
                  <p className="break-words text-[15px] text-text">{text(r.entry.title)}</p>
                  {typeof r.entry.source_url === "string" && (
                    <a
                      href={r.entry.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block break-all text-xs text-action hover:underline"
                    >
                      {prLabel(r.entry.source_url)}
                    </a>
                  )}
                  <p className="mt-1.5 text-xs text-muted md:hidden">
                    {isDifficulty(r.entry.difficulty) ? <DifficultyBadge difficulty={r.entry.difficulty} /> : null}{" "}
                    {checkCount(r.entry)} checks
                  </p>
                  {r.errors.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-failed">
                      {r.errors.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  )}
                  {r.message && <p className="mt-2 break-words text-xs text-failed">{r.message}</p>}
                </td>
                <td className="hidden truncate px-3 py-4 text-text lg:table-cell">{text(r.entry.category_slug)}</td>
                <td className="hidden px-3 py-4 md:table-cell">
                  {isDifficulty(r.entry.difficulty) ? (
                    <DifficultyBadge difficulty={r.entry.difficulty} />
                  ) : (
                    <span className="text-failed">{text(r.entry.difficulty)}</span>
                  )}
                </td>
                <td className="hidden truncate px-3 py-4 text-text lg:table-cell">{text(r.entry.codebase?.language)}</td>
                <td className="hidden px-3 py-4 tabular-nums text-text md:table-cell">{checkCount(r.entry)}</td>
                {phase === "enrich_done" && (
                  <td className="px-3 py-4">
                    <button
                      type="button"
                      aria-label={`Remove ${text(r.entry.title)}`}
                      onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                      className="rounded p-1 text-muted hover:bg-white/6 hover:text-failed"
                    >
                      <Icon name="x" className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {phase === "enrich_done" && (
        <Actions>
          {startOver}
          <button type="button" onClick={downloadResults} disabled={!rows.length} className={secondaryButton}>
            Download results.json
          </button>
          <button type="button" onClick={startImport} disabled={!valid.length} className={primaryButton}>
            Confirm import ({valid.length} problems)
          </button>
        </Actions>
      )}
    </div>
  );
}
