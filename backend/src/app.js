import express from "express";
import { pool } from "./db.js";
import { HttpError } from "./errors.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { meRouter } from "./modules/me/me.routes.js";

export const app = express();
app.use(express.json());

export const api = express.Router();
app.use("/api/v1", api);
api.use("/auth", authRouter);
api.use("/me", meRouter);

api.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
  } catch {
    throw new HttpError(503, "DB_UNAVAILABLE", "Database is not reachable");
  }
  res.json({ status: "ok" });
});

app.use((req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
});

// Express 5 forwards rejected async handlers here, so routes just throw.
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } });
  }
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong" } });
});
