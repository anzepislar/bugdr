import { Router } from "express";
import { pool } from "../../db.js";
import { HttpError } from "../../errors.js";
import {
  bannedError,
  clearSession,
  findUser,
  hashPassword,
  requireAuth,
  setSession,
  toUser,
  verifyPassword,
} from "./auth.service.js";

export const authRouter = Router();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[A-Za-z0-9_-]{3,50}$/;
const MIN_PASSWORD = 8; // D39
const MAX_PASSWORD = 200; // scrypt cost is per byte, so cap the input

const str = (v) => (typeof v === "string" ? v : "");

// Run scrypt for unknown emails too, so response time doesn't reveal which emails have an account.
const DUMMY_HASH = await hashPassword("not-a-real-password");

authRouter.post("/signup", async (req, res) => {
  const email = str(req.body?.email).trim().toLowerCase();
  const username = str(req.body?.username).trim();
  const password = str(req.body?.password);

  const details = {};
  if (!EMAIL.test(email) || email.length > 255) details.email = "Enter a valid email address";
  if (!USERNAME.test(username)) details.username = "3-50 characters: letters, numbers, - and _";
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD)
    details.password = `At least ${MIN_PASSWORD} characters`;
  if (Object.keys(details).length) throw new HttpError(400, "VALIDATION_ERROR", "Check the highlighted fields", details);

  const passwordHash = await hashPassword(password);
  const client = await pool.connect();
  let user;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "INSERT INTO users (email, username, password_hash) VALUES ($1, $2, $3) RETURNING *",
      [email, username, passwordHash],
    );
    user = toUser(rows[0]);
    await client.query("INSERT INTO user_stats (user_id) VALUES ($1)", [user.id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505" && err.constraint === "users_email_key")
      throw new HttpError(409, "EMAIL_TAKEN", "An account with this email already exists");
    if (err.code === "23505" && err.constraint === "users_username_lower_key")
      throw new HttpError(409, "USERNAME_TAKEN", "This username is taken");
    throw err;
  } finally {
    client.release();
  }

  setSession(res, user.id, false);
  res.status(201).json({ user });
});

authRouter.post("/login", async (req, res) => {
  const email = str(req.body?.email).trim().toLowerCase();
  const password = str(req.body?.password).slice(0, MAX_PASSWORD);
  const row = await findUser("email", email);
  const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) throw new HttpError(401, "INVALID_CREDENTIALS", "Incorrect email or password");
  if (row.is_banned) throw bannedError();
  const user = toUser(row);

  setSession(res, user.id, req.body?.remember === true);
  res.json({ user });
});

authRouter.post("/logout", (req, res) => {
  clearSession(res);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
