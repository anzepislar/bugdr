import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "../../config.js";
import { pool } from "../../db.js";
import { HttpError } from "../../errors.js";

// S6 (D63): users' own API keys, AES-256-GCM under API_KEY_ENCRYPTION_KEY. The plain key exists only in memory for
// the provider call - never in the database, a log or a response.

const masterKey = () => {
  if (!config.apiKeyEncryptionKey)
    throw new HttpError(503, "AI_KEYS_DISABLED", "Connecting your own API key is not available yet.");
  return Buffer.from(config.apiKeyEncryptionKey, "hex");
};

export function encryptKey(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

/** Throws if the data or the master key changed (GCM checks the tag) - never returns garbage. */
export function decryptKey({ ciphertext, iv, authTag }) {
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** The user's own key as { provider, model, apiKey }, or null when none is connected. */
export async function loadUserKey(userId) {
  const { rows } = await pool.query(
    "SELECT provider, model, ciphertext, iv, auth_tag FROM user_api_keys WHERE user_id = $1",
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  let apiKey;
  try {
    apiKey = decryptKey({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.auth_tag });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(409, "API_KEY_UNREADABLE", "Your saved API key can no longer be read. Connect it again in Settings.");
  }
  return { provider: row.provider, model: row.model, apiKey };
}

/** Provider + model of the connected key without decrypting it (labels, status), or null. */
export async function connectedKey(userId) {
  const { rows } = await pool.query("SELECT provider, model FROM user_api_keys WHERE user_id = $1", [userId]);
  return rows[0] ?? null;
}
