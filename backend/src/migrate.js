import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "./db.js";

const root = path.resolve(import.meta.dirname, "../..");

/** Applies new .sql files from `dir` in name order, each in its own transaction (D2). Returns applied names. */
export async function migrate(dir = path.join(root, "migrations")) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT now())`);
  const { rows } = await pool.query("SELECT name FROM schema_migrations");
  const done = new Set(rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql") && !done.has(f)).sort();

  for (const file of files) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(await readFile(path.join(dir, file), "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${err.message}`);
    } finally {
      client.release();
    }
  }
  return files;
}

/** Dev data: runs every seeds/*.sql in one transaction. Seeds must be re-runnable (ON CONFLICT DO NOTHING). */
async function seed() {
  const dir = path.join(root, "seeds");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const file of files) await client.query(await readFile(path.join(dir, file), "utf8"));
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return files;
}

if (import.meta.main) {
  const applied = process.argv.includes("--seed") ? await seed() : await migrate();
  console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Nothing to apply");
  await pool.end();
}
