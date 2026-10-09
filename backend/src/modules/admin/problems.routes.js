import express, { Router } from "express";
import { randomBytes } from "node:crypto";
import { pool } from "../../db.js";
import { HttpError } from "../../errors.js";
import { checkCodeLoads, runChecks } from "../runner/runner.service.js";
import { analysis } from "./analysis.service.js";
import { readZip, ZIP_MAX_BYTES } from "./zip.js";

// A2: problem drafts, A10: a draft from an uploaded ZIP + Claude's analysis (D22). Publishing (with the check run,
// D20) is A5, so everything here stays is_published = FALSE and a published problem cannot be edited.
export const adminProblemsRouter = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE_POINTS = { easy: 100, medium: 250, hard: 500, get_a_job: 1000 }; // 03_scoring.md, also a CHECK in 0004
const TIME_LIMIT = { easy: 15, medium: 30, hard: 60, get_a_job: 120 }; // D45: low end of TIME_LIMIT_RANGE (04)
const CHECK_TYPES = ["test", "build", "lint", "custom"];
const notFound = () => new HttpError(404, "NOT_FOUND", "Problem not found");

/** Same as toSlug in frontend/src/lib/types/problem.ts. */
export const toSlug = (title) =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const str = (v) => (typeof v === "string" ? v.trim() : "");
// ponytail: typescript or javascript from the file names (D54, Node only); no framework detection.
const languageOf = (files) => (Object.keys(files).some((p) => /\.(c|m)?ts$/.test(p)) ? "typescript" : "javascript");
// Relative path inside the repo: no absolute paths, no "..", no backslashes.
const safePath = (p) => /^[\w.-]+(\/[\w.-]+)*$/.test(p) && !p.split("/").includes("..");

/** AdminProblemDraft from the body, or 400 with a message per field. */
function parseDraft(body) {
  const d = {
    title: str(body?.title),
    shortDescription: str(body?.shortDescription),
    codebaseContext: str(body?.codebaseContext),
    incidentReport: str(body?.incidentReport),
    difficulty: body?.difficulty,
    categorySlug: body?.categorySlug,
    timeLimitMinutes: body?.timeLimitMinutes,
    tags: Array.isArray(body?.tags) ? [...new Set(body.tags.map((t) => str(t).toLowerCase()))] : null,
    checks: Array.isArray(body?.checks) ? body.checks : null,
    hiddenFiles: body?.hiddenFiles,
    bugSummary: typeof body?.bugSummary === "string" ? body.bugSummary : "",
    // K1 (D66): the career paths it belongs to; none = a general problem on /problems. Missing = none.
    careerPaths: body?.careerPaths === undefined ? [] : body.careerPaths,
  };
  const details = {};
  if (!d.title || d.title.length > 255) details.title = "1-255 characters";
  else if (!toSlug(d.title)) details.title = "Needs at least one letter or number";
  if (!d.shortDescription || d.shortDescription.length > 300) details.shortDescription = "1-300 characters";
  if (!d.codebaseContext) details.codebaseContext = "Required";
  if (!d.incidentReport) details.incidentReport = "Required";
  if (!(d.difficulty in BASE_POINTS)) details.difficulty = "easy, medium, hard or get_a_job";
  // A draft may have no role yet (the analysis does not pick one); the form requires it.
  if (d.categorySlug !== null && typeof d.categorySlug !== "string") details.categorySlug = "Pick a role";
  if (!Number.isInteger(d.timeLimitMinutes) || d.timeLimitMinutes < 1 || d.timeLimitMinutes > 480)
    details.timeLimitMinutes = "1-480 minutes";
  if (!d.tags || d.tags.length > 20 || d.tags.some((t) => !t || t.length > 50)) details.tags = "Up to 20 tags, 1-50 characters each";
  if (
    !d.checks ||
    d.checks.length > 20 ||
    d.checks.some(
      (c) =>
        !str(c?.description) ||
        str(c.description).length > 255 ||
        !CHECK_TYPES.includes(c.checkType) ||
        !str(c.checkCommand) ||
        typeof c.mustPass !== "boolean",
    )
  )
    details.checks = "Up to 20 checks, each with a description (max 255), type, command and must-pass flag";
  if (
    !d.hiddenFiles ||
    typeof d.hiddenFiles !== "object" ||
    Array.isArray(d.hiddenFiles) ||
    Object.entries(d.hiddenFiles).some(([path, content]) => !safePath(path) || typeof content !== "string")
  )
    details.hiddenFiles = "An object of relative file paths to file contents";
  if (!Array.isArray(d.careerPaths) || d.careerPaths.some((r) => typeof r !== "string")) details.careerPaths = "A list of roles";
  else d.careerPaths = [...new Set(d.careerPaths)];
  if (Object.keys(details).length) throw new HttpError(400, "VALIDATION_ERROR", "Check the highlighted fields", details);
  return d;
}

/**
 * Writes a draft (insert when id is null) with its tags, checks and hidden files in one transaction.
 * `codebase` (A10, new drafts only) = the uploaded files: { files, hash, repositoryName, slugSuffix }.
 */
async function saveDraft(id, d, codebase = null) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let categoryId = null;
    if (d.categorySlug !== null) {
      const { rows: category } = await client.query("SELECT id FROM problem_categories WHERE slug = $1", [d.categorySlug]);
      if (!category.length)
        throw new HttpError(400, "VALIDATION_ERROR", "Check the highlighted fields", { categorySlug: "Unknown role" });
      categoryId = category[0].id;
    }
    const values = [
      d.title,
      toSlug(d.title) + (codebase?.slugSuffix ?? ""),
      d.shortDescription,
      d.codebaseContext,
      d.incidentReport,
      d.difficulty,
      categoryId,
      BASE_POINTS[d.difficulty],
      d.timeLimitMinutes,
      d.bugSummary,
    ];
    const { rows } = id
      ? await client.query(
          `UPDATE problems SET title = $1, slug = $2, short_description = $3, codebase_context = $4, incident_report = $5,
             difficulty = $6, category_id = $7, base_points = $8, time_limit_minutes = $9, bug_summary = $10, updated_at = now()
           WHERE id = $11 AND NOT is_published RETURNING id, slug, is_published`,
          [...values, id],
        )
      : await client.query(
          `INSERT INTO problems (title, slug, short_description, codebase_context, incident_report, difficulty, category_id,
             base_points, time_limit_minutes, bug_summary, is_published)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE) RETURNING id, slug, is_published`,
          values,
        );
    if (!rows.length) throw new HttpError(409, "PROBLEM_PUBLISHED", "A published problem cannot be edited");
    const problemId = rows[0].id;

    await client.query("DELETE FROM problem_tags WHERE problem_id = $1", [problemId]);
    await client.query("INSERT INTO problem_tags (problem_id, tag) SELECT $1, unnest($2::text[])", [problemId, d.tags]);
    await client.query("DELETE FROM problem_career_paths WHERE problem_id = $1", [problemId]);
    await client.query("INSERT INTO problem_career_paths (problem_id, role) SELECT $1, unnest($2::text[])", [
      problemId,
      d.careerPaths,
    ]);
    await client.query("DELETE FROM problem_checks WHERE problem_id = $1", [problemId]);
    await client.query(
      `INSERT INTO problem_checks (problem_id, check_order, description, check_type, check_command, must_pass)
       SELECT $1, c.check_order, c.description, c.check_type, c.check_command, c.must_pass
       FROM json_to_recordset($2) AS c (check_order INT, description TEXT, check_type TEXT, check_command TEXT, must_pass BOOLEAN)`,
      [
        problemId,
        JSON.stringify(
          // Order = position in the list.
          d.checks.map((c, i) => ({
            check_order: i + 1,
            description: str(c.description),
            check_type: c.checkType,
            check_command: str(c.checkCommand),
            must_pass: c.mustPass,
          })),
        ),
      ],
    );
    // The uploaded code is written once, when the analysis creates the draft (A10); edits change only the
    // hidden files. A draft saved without an upload (POST without code) gets an empty codebase.
    const files = codebase?.files ?? {};
    const language = codebase ? languageOf(files) : "typescript";
    await client.query(
      `INSERT INTO problem_codebase (problem_id, repository_name, repository_structure, files, hidden_files, language, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (problem_id) DO UPDATE SET hidden_files = EXCLUDED.hidden_files`,
      [
        problemId,
        codebase?.repositoryName ?? null,
        JSON.stringify(Object.keys(files).sort()),
        files,
        d.hiddenFiles,
        language,
        codebase?.hash ?? null,
      ],
    );
    await client.query("COMMIT");
    return { id: problemId, slug: rows[0].slug, isPublished: rows[0].is_published };
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505" && err.constraint === "problem_codebase_content_hash_key")
      throw new HttpError(409, "DUPLICATE_CODEBASE", "This codebase was already added as a problem");
    if (err.code === "23505" && err.constraint === "problems_slug_key")
      throw new HttpError(409, "SLUG_TAKEN", "A problem with this title already exists", {
        title: "Another problem already uses this title",
      });
    if (err.code === "23503" && err.constraint === "problem_career_paths_role_fkey")
      throw new HttpError(400, "VALIDATION_ERROR", "Check the highlighted fields", { careerPaths: "Unknown role" });
    throw err;
  } finally {
    client.release();
  }
}

const CAREER_PATHS = `coalesce((SELECT array_agg(cp.role ORDER BY cp.role) FROM problem_career_paths cp WHERE cp.problem_id = p.id),
  '{}') AS career_paths`;

// Every problem, drafts included, newest first. ponytail: no paging, the client filters (like /problems).
adminProblemsRouter.get("/", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.id, p.slug, p.title, p.difficulty, c.slug AS category_slug, p.is_published,
       (SELECT count(*)::int FROM user_problem_attempts a WHERE a.problem_id = p.id AND a.status = 'solved') AS solve_count,
       p.average_rating::float AS average_rating, p.rating_count, p.created_at, ${CAREER_PATHS}
     FROM problems p LEFT JOIN problem_categories c ON c.id = p.category_id
     ORDER BY p.created_at DESC, p.title`,
  );
  res.json({
    problems: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      difficulty: r.difficulty,
      categorySlug: r.category_slug,
      isPublished: r.is_published,
      solveCount: r.solve_count,
      averageRating: r.average_rating,
      ratingCount: r.rating_count,
      createdAt: r.created_at,
      careerPaths: r.career_paths,
    })),
  });
});

/** Everything the edit form needs, incl. check commands, hidden files and the bug summary (admin only). */
adminProblemsRouter.get("/:id", async (req, res) => {
  if (!UUID.test(req.params.id)) throw notFound();
  const { rows } = await pool.query(
    `SELECT p.*, c.slug AS category_slug, coalesce(cb.hidden_files, '{}') AS hidden_files, cb.repository_name,
       coalesce(cb.repository_structure, '[]') AS paths, ${CAREER_PATHS}, coalesce(p.dry_run_passed_for = p.updated_at, false) AS checks_verified,
       coalesce((SELECT array_agg(t.tag ORDER BY t.tag) FROM problem_tags t WHERE t.problem_id = p.id), '{}') AS tags,
       coalesce((SELECT json_agg(json_build_object('id', k.id, 'checkOrder', k.check_order, 'description', k.description,
           'checkType', k.check_type, 'checkCommand', k.check_command, 'mustPass', k.must_pass) ORDER BY k.check_order)
         FROM problem_checks k WHERE k.problem_id = p.id), '[]') AS checks
     FROM problems p
     LEFT JOIN problem_categories c ON c.id = p.category_id
     LEFT JOIN problem_codebase cb ON cb.problem_id = p.id
     WHERE p.id = $1`,
    [req.params.id],
  );
  const r = rows[0];
  if (!r) throw notFound();
  res.json({
    problem: {
      id: r.id,
      slug: r.slug,
      isPublished: r.is_published,
      title: r.title,
      shortDescription: r.short_description,
      codebaseContext: r.codebase_context,
      incidentReport: r.incident_report,
      difficulty: r.difficulty,
      categorySlug: r.category_slug,
      timeLimitMinutes: r.time_limit_minutes,
      tags: r.tags,
      checks: r.checks,
      hiddenFiles: r.hidden_files,
      bugSummary: r.bug_summary,
      careerPaths: r.career_paths,
      // A3: the code is shown as its file list only; it changes by uploading a new ZIP.
      repositoryName: r.repository_name,
      paths: r.paths,
      // A4: the last dry-run passed (every check failed on the buggy code) and nothing changed since.
      checksVerified: r.checks_verified,
    },
  });
});

adminProblemsRouter.post("/", async (req, res) => {
  res.status(201).json(await saveDraft(null, parseDraft(req.body)));
});

/** Replaces every editable field of a draft (the form always sends all of them). */
adminProblemsRouter.put("/:id", async (req, res) => {
  if (!UUID.test(req.params.id)) throw notFound();
  const draft = parseDraft(req.body);
  const { rows } = await pool.query("SELECT 1 FROM problems WHERE id = $1", [req.params.id]);
  if (!rows.length) throw notFound();
  res.json(await saveDraft(req.params.id, draft));
});

// A10 + A3: an uploaded ZIP is the raw request body. The routes stream one JSON line per pipeline stage
// ({ type: "stage", stage, status }), then { type: "done", ... }; a failed stage ends the stream with its message.
const zipBody = express.raw({
  type: ["application/zip", "application/x-zip-compressed", "application/octet-stream"],
  limit: ZIP_MAX_BYTES,
});

class StageFailed extends Error {}

/** The unpacked upload (400 before any stream starts). `?name=` is the ZIP's file name → repository name. */
function uploadedZip(req) {
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, "INVALID_ZIP", "Upload a .zip file.");
  const repositoryName = String(req.query.name ?? "").replace(/\.zip$/i, "").slice(0, 100) || null;
  return { ...readZip(req.body), repositoryName };
}

/** NDJSON stage reporting: run(name, fn) sends running → passed; fail(err) sends the failure of the current stage. */
function stageStream(res) {
  let stage;
  const line = (event) => {
    if (res.writableEnded || res.destroyed) return;
    if (!res.headersSent) res.status(200).type("application/x-ndjson").setHeader("Cache-Control", "no-store");
    res.write(JSON.stringify(event) + "\n");
  };
  return {
    line,
    async run(name, fn) {
      stage = name;
      line({ type: "stage", stage, status: "running" });
      const result = await fn();
      line({ type: "stage", stage, status: "passed" });
      return result;
    },
    fail(err) {
      if (err instanceof StageFailed || err instanceof HttpError) {
        line({ type: "stage", stage, status: "failed", message: err.message });
      } else {
        console.error(err);
        line({ type: "stage", stage, status: "failed", message: "Something went wrong on the server. Try again." });
      }
    },
  };
}

/** Duplicate Check: no other problem has the same files (A3: the problem's own code doesn't count). */
async function checkDuplicate(hash, exceptProblemId = null) {
  const { rows } = await pool.query(
    `SELECT p.title FROM problem_codebase cb JOIN problems p ON p.id = cb.problem_id
     WHERE cb.content_hash = $1 AND p.id IS DISTINCT FROM $2`,
    [hash, exceptProblemId],
  );
  if (rows.length) throw new StageFailed(`This codebase was already added as "${rows[0].title}". Upload a different codebase.`);
}

/** Production Test: no npm packages (D53: the runner has no network) and every .js/.ts file loads under Node 24. */
async function checkProduction(files) {
  if (files["package.json"] !== undefined) {
    let pkg;
    try {
      pkg = JSON.parse(files["package.json"]);
    } catch {
      throw new StageFailed("package.json is not valid JSON.");
    }
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    if (deps.length)
      throw new StageFailed(
        `The code needs npm packages (${deps.slice(0, 5).join(", ")}${deps.length > 5 ? ", …" : ""}). Problems must run on Node built-ins only.`,
      );
  }
  const loaded = await checkCodeLoads(files);
  if (!loaded.ok) throw new StageFailed(`The code does not load under Node 24:\n${loaded.output}`);
}

// A10: upload → duplicate check → production test → Claude analysis → a new draft (D22).
// Ends with { type: "done", problemId, analysis } (ProblemAnalysis, camelCase).
adminProblemsRouter.post("/analyze", zipBody, async (req, res) => {
  const { files, hash, repositoryName } = uploadedZip(req);
  const stages = stageStream(res);
  const { line, run } = stages;

  try {
    await run("duplicate", () => checkDuplicate(hash));
    await run("production", () => checkProduction(files));

    let reasoning = "";
    const draft = await run("analysis", async () => {
      const raw = await analysis.analyze(files);
      reasoning = typeof raw.difficulty_reasoning === "string" ? raw.difficulty_reasoning : "";
      try {
        return parseDraft({
          title: raw.title,
          shortDescription: raw.short_description,
          codebaseContext: raw.codebase_context,
          incidentReport: raw.incident_report,
          difficulty: raw.suggested_difficulty,
          categorySlug: null,
          timeLimitMinutes: TIME_LIMIT[raw.suggested_difficulty],
          tags: raw.tags,
          checks: raw.checks?.map((c) => ({
            description: c.description,
            checkType: c.check_type,
            checkCommand: c.check_command,
            mustPass: c.must_pass,
          })),
          hiddenFiles: Array.isArray(raw.hidden_files)
            ? Object.fromEntries(raw.hidden_files.map((f) => [f.path, f.content]))
            : null,
          bugSummary: raw.bug_summary,
        });
      } catch (err) {
        if (!(err instanceof HttpError)) throw err;
        throw new StageFailed(`The AI returned an unusable analysis (${Object.keys(err.details ?? {}).join(", ")}). Try again.`);
      }
    });

    // A title another problem already uses gets a random suffix on the slug; the admin renames it on Review.
    let saved;
    try {
      saved = await saveDraft(null, draft, { files, hash, repositoryName });
    } catch (err) {
      if (err.code !== "SLUG_TAKEN") throw err;
      saved = await saveDraft(null, draft, { files, hash, repositoryName, slugSuffix: `-${randomBytes(2).toString("hex")}` });
    }
    const { rows: checks } = await pool.query(
      "SELECT id FROM problem_checks WHERE problem_id = $1 ORDER BY check_order",
      [saved.id],
    );
    line({
      type: "done",
      problemId: saved.id,
      analysis: {
        bugSummary: draft.bugSummary,
        title: draft.title,
        shortDescription: draft.shortDescription,
        codebaseContext: draft.codebaseContext,
        incidentReport: draft.incidentReport,
        suggestedDifficulty: draft.difficulty,
        difficultyReasoning: reasoning,
        checks: draft.checks.map((c, i) => ({
          id: checks[i].id,
          checkOrder: i + 1,
          description: c.description.trim(),
          checkType: c.checkType,
          checkCommand: c.checkCommand.trim(),
          mustPass: c.mustPass,
        })),
        hiddenFiles: draft.hiddenFiles,
        tags: draft.tags,
      },
    });
  } catch (err) {
    stages.fail(err);
  }
  res.end();
});

// A3: the code of a draft is never edited in place - the admin uploads a whole new ZIP (user, 9. 10. 2026).
// Duplicate Check (other problems only) → Production Test → the files are replaced. Title, descriptions, checks and
// hidden tests stay as they are. The duplicate hash becomes the new upload's. Ends with { type: "done", paths, repositoryName }.
adminProblemsRouter.put("/:id/codebase", zipBody, async (req, res) => {
  if (!UUID.test(req.params.id)) throw notFound();
  const { rows } = await pool.query("SELECT is_published FROM problems WHERE id = $1", [req.params.id]);
  if (!rows.length) throw notFound();
  if (rows[0].is_published) throw new HttpError(409, "PROBLEM_PUBLISHED", "A published problem cannot be edited");
  const { files, hash, repositoryName } = uploadedZip(req);
  const stages = stageStream(res);

  try {
    await stages.run("duplicate", () => checkDuplicate(hash, req.params.id));
    await stages.run("production", () => checkProduction(files));
    const paths = Object.keys(files).sort();
    let updated;
    try {
      ({ rows: updated } = await pool.query(
        `UPDATE problem_codebase cb SET files = $2, repository_structure = $3, language = $4,
           repository_name = coalesce($5, cb.repository_name), content_hash = $6
         FROM problems p WHERE p.id = cb.problem_id AND cb.problem_id = $1 AND NOT p.is_published
         RETURNING cb.repository_name`,
        [req.params.id, files, JSON.stringify(paths), languageOf(files), repositoryName, hash],
      ));
    } catch (err) {
      if (err.code === "23505") throw new StageFailed("This codebase was just added as another problem.");
      throw err;
    }
    if (!updated.length) throw new StageFailed("The problem was published meanwhile, so its code can no longer change.");
    // New code = a new version: the last dry-run no longer counts (A4).
    await pool.query("UPDATE problems SET updated_at = now() WHERE id = $1", [req.params.id]);
    stages.line({ type: "done", paths, repositoryName: updated[0].repository_name });
  } catch (err) {
    stages.fail(err);
  }
  res.end();
});

// A4 dry-run (D20): every check runs in Docker against the buggy code - the problem's files + hidden files, no user
// files - and every check must FAIL. Streams { type: "checks", checks: [{ id, description }] }, then per check
// { type: "running", checkId } and { type: "result", checkId, passed, output? } (output only when it failed, R3).
// A passing run is recorded for this version of the problem only (dry_run_passed_for = updated_at).

/** What a check run needs; 404 / 409 before any stream starts. */
async function loadForRun(problemId) {
  if (!UUID.test(problemId)) throw notFound();
  const { rows } = await pool.query(
    `SELECT p.updated_at::text AS version, p.is_published, p.category_id, coalesce(cb.files, '{}') AS files,
       coalesce(cb.hidden_files, '{}') AS hidden_files, cb.setup_commands,
       coalesce((SELECT json_agg(json_build_object('id', k.id, 'checkOrder', k.check_order, 'command', k.check_command,
         'expectedOutput', k.expected_output, 'description', k.description) ORDER BY k.check_order)
         FROM problem_checks k WHERE k.problem_id = p.id), '[]') AS checks
     FROM problems p LEFT JOIN problem_codebase cb ON cb.problem_id = p.id
     WHERE p.id = $1`,
    [problemId],
  );
  const p = rows[0];
  if (!p) throw notFound();
  if (!Object.keys(p.files).length) throw new HttpError(409, "NO_CODE", "Upload the code before running the checks");
  if (!p.checks.length) throw new HttpError(409, "NO_CHECKS", "Add checks before running them");
  return p;
}

/** Streams the run and records a pass for the version it ran on. Resolves ok (every check failed), or null on error. */
async function streamCheckRun(problemId, p, stages) {
  stages.line({ type: "checks", checks: p.checks.map((c) => ({ id: c.id, description: c.description })) });
  try {
    const results = await runChecks(
      { files: p.files, hiddenFiles: p.hidden_files, setupCommands: p.setup_commands, checks: p.checks },
      {},
      {
        onProgress: (e) =>
          stages.line(e.status === "running" ? { type: "running", checkId: e.checkId } : { type: "result", ...e.result }),
      },
    );
    const ok = results.every((r) => !r.passed);
    // Recorded only if the problem did not change while the checks ran.
    await pool.query(
      "UPDATE problems SET dry_run_passed_for = CASE WHEN $3 THEN updated_at END WHERE id = $1 AND updated_at::text = $2",
      [problemId, p.version, ok],
    );
    return ok;
  } catch (err) {
    console.error(err);
    stages.line({ type: "error", message: "The checks could not run. Is Docker running? Try again." });
    return null;
  }
}

// Ends with { type: "done", ok }.
adminProblemsRouter.post("/:id/dry-run", async (req, res) => {
  const p = await loadForRun(req.params.id);
  const stages = stageStream(res);
  const ok = await streamCheckRun(req.params.id, p, stages);
  if (ok !== null) stages.line({ type: "done", ok });
  res.end();
});

// A5: Publish always runs the checks again (user, 9. 10. 2026) and publishes only if every check fails on the buggy
// code and the draft did not change meanwhile (04 "Never publish a problem without testing all checks first").
// Needs a role, at least 3 checks (04 "Quality Guidelines"), the code and hidden test files (D53: without them the
// checks cannot run for users). Same stream as the dry-run, ending with { type: "done", ok, published, slug? }.
const MIN_CHECKS = 3;

adminProblemsRouter.post("/:id/publish", async (req, res) => {
  const p = await loadForRun(req.params.id);
  if (p.is_published) throw new HttpError(409, "ALREADY_PUBLISHED", "This problem is already published");
  if (!p.category_id) throw new HttpError(409, "NO_ROLE", "Pick a role before publishing");
  if (p.checks.length < MIN_CHECKS) throw new HttpError(409, "TOO_FEW_CHECKS", `Add at least ${MIN_CHECKS} checks before publishing`);
  if (!Object.keys(p.hidden_files).length)
    throw new HttpError(409, "NO_HIDDEN_FILES", "The checks need hidden test files before publishing");

  const stages = stageStream(res);
  const ok = await streamCheckRun(req.params.id, p, stages);
  if (ok === null) return res.end();
  if (!ok) {
    stages.line({ type: "done", ok, published: false });
    return res.end();
  }
  const { rows } = await pool.query(
    `UPDATE problems SET is_published = TRUE WHERE id = $1 AND updated_at::text = $2 AND NOT is_published RETURNING slug`,
    [req.params.id, p.version],
  );
  stages.line(
    rows.length
      ? { type: "done", ok, published: true, slug: rows[0].slug }
      : { type: "done", ok, published: false, message: "The draft changed while the checks ran. Publish again." },
  );
  res.end();
});

// A5: unpublish = back to a draft (editable again; republishing runs the checks again). Never while the problem is in
// a contest that has not ended. Deleting a problem is not offered (04 "Admin Rules": unpublish instead).
adminProblemsRouter.post("/:id/unpublish", async (req, res) => {
  if (!UUID.test(req.params.id)) throw notFound();
  const { rows } = await pool.query(
    `SELECT p.is_published,
       EXISTS (SELECT 1 FROM contest_problems cp JOIN contests ct ON ct.id = cp.contest_id
               WHERE cp.problem_id = p.id AND ct.starts_at IS NOT NULL AND ct.ends_at > now()) AS in_contest
     FROM problems p WHERE p.id = $1`,
    [req.params.id],
  );
  if (!rows.length) throw notFound();
  if (!rows[0].is_published) throw new HttpError(409, "NOT_PUBLISHED", "This problem is not published");
  if (rows[0].in_contest)
    throw new HttpError(409, "IN_CONTEST", "This problem is part of a contest that has not ended");
  // A version change: the next publish runs the checks again anyway.
  const { rows: updated } = await pool.query(
    "UPDATE problems SET is_published = FALSE, updated_at = now() WHERE id = $1 RETURNING id, slug, is_published",
    [req.params.id],
  );
  res.json({ id: updated[0].id, slug: updated[0].slug, isPublished: updated[0].is_published });
});
