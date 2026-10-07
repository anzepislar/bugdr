import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import jwt from "jsonwebtoken";
import { config } from "../../config.js";
import { pool } from "../../db.js";
import { HttpError } from "../../errors.js";

const scryptAsync = promisify(scrypt);
export const SESSION_COOKIE = "bugdr_session"; // same name as frontend/src/lib/session.ts
const SESSION_DAYS = 30;

/** "scrypt:<salt>:<hash>", base64 (D4). */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export async function verifyPassword(password, stored) {
  const [, salt, hash] = stored.split(":");
  const expected = Buffer.from(hash, "base64");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Session cookie with a JWT that carries only the user id (D5). Without `remember` it ends with the browser (D40). */
export function setSession(res, userId, remember) {
  const token = jwt.sign({}, config.jwtSecret, { subject: userId, expiresIn: `${SESSION_DAYS}d`, algorithm: "HS256" });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.production,
    path: "/",
    ...(remember && { maxAge: SESSION_DAYS * 86400 * 1000 }),
  });
}

export function clearSession(res) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: config.production, path: "/" });
}

function readCookie(req, name) {
  for (const part of req.headers.cookie?.split(";") ?? []) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
}

/** A users row joined with its onboarding state. `by` is a column name from this file, never user input. */
export async function findUser(by, value) {
  const { rows } = await pool.query(
    `SELECT u.*, coalesce(p.onboarding_completed, false) AS onboarding_completed,
       u.last_active_at < now() - interval '1 minute' AS stale
     FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
     WHERE u.${by} = $1`,
    [value],
  );
  return rows[0];
}

/** What the client gets: never password_hash or is_banned. */
export const toUser = (row) => ({
  id: row.id,
  email: row.email,
  username: row.username,
  avatarUrl: row.avatar_url,
  isAdmin: row.is_admin,
  onboardingCompleted: row.onboarding_completed ?? false,
});

export const bannedError = () => new HttpError(403, "BANNED", "This account has been suspended");

/**
 * Loads the signed-in user from the database on every request (D5) into req.user, else 401.
 * A ban or admin change applies on the next request, without logging in again.
 */
export async function requireAuth(req, res, next) {
  let userId;
  try {
    userId = jwt.verify(readCookie(req, SESSION_COOKIE) ?? "", config.jwtSecret, { algorithms: ["HS256"] }).sub;
  } catch {
    throw new HttpError(401, "UNAUTHENTICATED", "Log in to continue");
  }
  const row = await findUser("id", userId);
  if (!row) throw new HttpError(401, "UNAUTHENTICATED", "Log in to continue");
  if (row.is_banned) throw bannedError();
  // At most one write a minute per user.
  if (row.stale) await pool.query("UPDATE users SET last_active_at = now() WHERE id = $1", [row.id]);
  req.user = toUser(row);
  next();
}

/** requireAuth + is_admin, else 403. */
export const requireAdmin = [
  requireAuth,
  (req, res, next) => {
    if (!req.user.isAdmin) throw new HttpError(403, "FORBIDDEN", "Admins only");
    next();
  },
];
