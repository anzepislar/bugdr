import { Router } from "express";
import { pool } from "../../db.js";
import { HttpError } from "../../errors.js";
import { requireAuth } from "../auth/auth.service.js";

export const meRouter = Router();
meRouter.use(requireAuth);

// Allowed values (01_database.md). Keep in sync with frontend/src/lib/types (CATEGORIES, EXPERIENCE_LEVELS,
// PLATFORM_GOALS, LANGUAGES).
const GOAL_ROLES = ["ai-engineer", "backend", "frontend", "fullstack", "database"];
const EXPERIENCE_LEVELS = ["student", "junior", "mid", "senior"];
const PLATFORM_GOALS = ["get_hired", "improve_skills", "both"];
const LANGUAGES = ["TypeScript", "JavaScript", "Python", "Go", "SQL", "Java", "Rust", "C#"];

// goalRole null = "Exploring my path" (D41). Re-submitting updates the same row.
meRouter.put("/onboarding", async (req, res) => {
  const { goalRole = null, experienceLevel, platformGoal, languages = [] } = req.body ?? {};

  const details = {};
  if (goalRole !== null && !GOAL_ROLES.includes(goalRole)) details.goalRole = "Unknown role";
  if (!EXPERIENCE_LEVELS.includes(experienceLevel)) details.experienceLevel = "Choose your experience";
  if (!PLATFORM_GOALS.includes(platformGoal)) details.platformGoal = "Choose a goal";
  if (!Array.isArray(languages) || !languages.every((l) => LANGUAGES.includes(l))) details.languages = "Unknown language";
  if (Object.keys(details).length) throw new HttpError(400, "VALIDATION_ERROR", "Check your answers", details);

  await pool.query(
    `INSERT INTO user_profiles (user_id, goal_role, experience_level, platform_goal, languages, onboarding_completed)
     VALUES ($1, $2, $3, $4, $5, TRUE)
     ON CONFLICT (user_id) DO UPDATE SET goal_role = $2, experience_level = $3, platform_goal = $4, languages = $5,
       onboarding_completed = TRUE`,
    [req.user.id, goalRole, experienceLevel, platformGoal, [...new Set(languages)]],
  );
  res.status(204).end();
});

// GET /me/profile → { username, settings: ProfileSettings } for /settings (D34). Empty optional fields are "".
meRouter.get("/profile", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT display_name, headline, github_username, goal_role, experience_level, languages, is_public
     FROM user_profiles WHERE user_id = $1`,
    [req.user.id],
  );
  const p = rows[0] ?? {};
  res.json({
    username: req.user.username,
    settings: {
      displayName: p.display_name ?? req.user.username,
      headline: p.headline ?? "",
      githubUsername: p.github_username ?? "",
      goalRole: p.goal_role ?? null,
      experienceLevel: p.experience_level ?? null,
      languages: p.languages ?? [],
      isPublic: p.is_public ?? true,
    },
  });
});

// GitHub's rule: letters, digits and single hyphens, not at the start or end, at most 39.
const GITHUB_USERNAME = /^[A-Za-z0-9](?:-?[A-Za-z0-9])*$/;

// PUT /me/profile: the whole /settings form. The difficulty field is experienceLevel (D36).
meRouter.put("/profile", async (req, res) => {
  const { displayName, headline = "", githubUsername = "", goalRole = null, experienceLevel, languages = [], isPublic } =
    req.body ?? {};
  const name = typeof displayName === "string" ? displayName.trim() : "";
  const head = typeof headline === "string" ? headline.trim() : null;
  const github = typeof githubUsername === "string" ? githubUsername.trim() : null;

  const details = {};
  if (!name || name.length > 50) details.displayName = "Enter a display name up to 50 characters";
  if (head === null || head.length > 80) details.headline = "Up to 80 characters";
  if (github === null || (github && (github.length > 39 || !GITHUB_USERNAME.test(github)))) details.githubUsername = "Not a valid GitHub username";
  if (goalRole !== null && !GOAL_ROLES.includes(goalRole)) details.goalRole = "Unknown role";
  if (!EXPERIENCE_LEVELS.includes(experienceLevel)) details.experienceLevel = "Choose your experience";
  if (!Array.isArray(languages) || !languages.every((l) => LANGUAGES.includes(l))) details.languages = "Unknown language";
  if (typeof isPublic !== "boolean") details.isPublic = "Must be true or false";
  if (Object.keys(details).length) throw new HttpError(400, "VALIDATION_ERROR", "Check your profile", details);

  await pool.query(
    `INSERT INTO user_profiles (user_id, display_name, headline, github_username, goal_role, experience_level, languages, is_public)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id) DO UPDATE SET display_name = $2, headline = $3, github_username = $4, goal_role = $5,
       experience_level = $6, languages = $7, is_public = $8`,
    [req.user.id, name, head || null, github || null, goalRole, experienceLevel, [...new Set(languages)], isPublic],
  );
  res.status(204).end();
});
