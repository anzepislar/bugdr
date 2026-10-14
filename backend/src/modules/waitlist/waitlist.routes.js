import { Router } from "express";
import { pool } from "../../db.js";
import { HttpError } from "../../errors.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v) => (typeof v === "string" ? v : "");

export const waitlistRouter = Router();

// GET /waitlist → { count }, for the social proof line in the modal.
waitlistRouter.get("/", async (req, res) => {
  const { rows } = await pool.query("SELECT count(*)::int AS count FROM waitlist");
  res.json({ count: rows[0].count });
});

// POST /waitlist { email } → 201 { success: true }. Joining twice is the same success, so the form never says
// whether an email is already on the list.
// ponytail: no per-IP limit yet, add with the other public endpoints in Z2.
waitlistRouter.post("/", async (req, res) => {
  const email = str(req.body?.email).trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) {
    throw new HttpError(400, "VALIDATION_ERROR", "Please enter a valid email address.", { email: "Invalid email" });
  }
  await pool.query("INSERT INTO waitlist (email) VALUES ($1) ON CONFLICT (email) DO NOTHING", [email]);
  res.status(201).json({ success: true });
});
