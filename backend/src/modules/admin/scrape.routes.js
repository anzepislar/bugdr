import { config } from "../../config.js";
import { HttpError } from "../../errors.js";
import { enrichService } from "./enrich.service.js";
import { scrapeService } from "./scrape.service.js";

// Bulk import pipeline (/admin/import): scrape GitHub → enrich with Claude → the page previews the problems and
// saves them one by one with POST /admin/import-problem (drafts). Both steps stream NDJSON like the A10 analysis.

const REPO = /^[\w.-]+\/[\w.-]+$/;
const MAX_REPOS = 20;
const MAX_CANDIDATES = 2000;
const invalid = (message) => new HttpError(400, "VALIDATION_ERROR", message);

/**
 * NDJSON response for a long pipeline step. A newline every 15 s keeps the Next proxy from closing an idle
 * connection while Claude works (apiStream skips empty lines); the signal aborts when the admin leaves the page,
 * so no more GitHub or Claude calls are made for nobody.
 */
async function streamNdjson(req, res, run) {
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  res.status(200).type("application/x-ndjson").setHeader("Cache-Control", "no-store");
  const line = (event) => {
    if (!res.writableEnded && !res.destroyed) res.write(JSON.stringify(event) + "\n");
  };
  const heartbeat = setInterval(() => !res.destroyed && res.write("\n"), 15_000);
  try {
    await run(line, controller.signal);
  } catch (err) {
    console.error(err);
    line({ type: "error", message: "Something went wrong on the server. Try again." });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
}

export async function scrape(req, res) {
  const repos = req.body?.repos;
  if (!Array.isArray(repos) || !repos.length || repos.length > MAX_REPOS || repos.some((r) => typeof r !== "string" || !REPO.test(r)))
    throw invalid(`repos: 1-${MAX_REPOS} repositories as owner/name`);
  await streamNdjson(req, res, (line, signal) => scrapeService.scrape([...new Set(repos)], line, signal));
}

export async function enrich(req, res) {
  const candidates = req.body?.candidates;
  if (!Array.isArray(candidates) || !candidates.length || candidates.length > MAX_CANDIDATES)
    throw invalid(`candidates: 1-${MAX_CANDIDATES} candidates from the scrape`);
  if (candidates.some((c) => typeof c?.pr_url !== "string" || !Array.isArray(c.files)))
    throw invalid("candidates: each needs pr_url and files");
  if (!config.anthropicApiKey) throw new HttpError(503, "ANALYSIS_DISABLED", "ANTHROPIC_API_KEY is not set on the server");
  await streamNdjson(req, res, (line, signal) => enrichService.enrich(candidates, line, signal));
}
