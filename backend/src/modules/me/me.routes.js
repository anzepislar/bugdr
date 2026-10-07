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
