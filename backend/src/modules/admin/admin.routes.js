import { Router } from "express";
import { config } from "../../config.js";
import { HttpError } from "../../errors.js";
import { clearAdminSession, hashPassword, requireAdmin, setAdminSession, verifyPassword } from "../auth/auth.service.js";
import { adminContestsRouter } from "./contests.routes.js";
import { adminProblemsRouter } from "./problems.routes.js";

// Every admin endpoint goes on this router behind requireAdmin; only login and logout are open.
export const adminRouter = Router();

const str = (v) => (typeof v === "string" ? v : "");
const DUMMY_HASH = await hashPassword("not-a-real-password");

// ponytail: one global failure counter (behind the Next proxy every request has the same IP), so an attacker
// can lock the admin out for the window too. Per-IP limits come with Z2.
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
let failures = [];

adminRouter.post("/login", async (req, res) => {
  if (!config.adminEmail || !config.adminPasswordHash)
    throw new HttpError(503, "ADMIN_DISABLED", "Admin login is not configured");
  const now = Date.now();
  failures = failures.filter((t) => now - t < WINDOW_MS);
  if (failures.length >= MAX_FAILURES)
    throw new HttpError(429, "TOO_MANY_ATTEMPTS", "Too many failed attempts. Try again later");

  const emailOk = str(req.body?.email).trim().toLowerCase() === config.adminEmail;
  // Always run scrypt, so response time doesn't reveal whether the email matched.
  const passwordOk = await verifyPassword(
    str(req.body?.password).slice(0, 200),
    emailOk ? config.adminPasswordHash : DUMMY_HASH,
  );
  if (!emailOk || !passwordOk) {
    failures.push(now);
    throw new HttpError(401, "INVALID_CREDENTIALS", "Incorrect email or password");
  }
  failures = [];
  setAdminSession(res);
  res.status(204).end();
});

adminRouter.post("/logout", (req, res) => {
  clearAdminSession(res);
  res.status(204).end();
});

adminRouter.get("/me", requireAdmin, (req, res) => {
  res.json({ admin: { email: config.adminEmail } });
});

adminRouter.use("/problems", requireAdmin, adminProblemsRouter);
adminRouter.use("/contests", requireAdmin, adminContestsRouter);
