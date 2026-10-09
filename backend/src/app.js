import express from "express";
import { pool } from "./db.js";
import { HttpError } from "./errors.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { attemptsRouter } from "./modules/attempts/attempts.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { contestsRouter } from "./modules/contests/contests.routes.js";
import { commentsRouter } from "./modules/comments/comments.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { leaderboardRouter } from "./modules/leaderboard/leaderboard.routes.js";
import { meRouter } from "./modules/me/me.routes.js";
import { problemsRouter } from "./modules/problems/problems.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";

export const app = express();
// 3 MB: a Test submission carries the user's files (runner limit 2 MB, R3).
app.use(express.json({ limit: "3mb" }));

export const api = express.Router();
app.use("/api/v1", api);
api.use("/admin", adminRouter);
api.use("/attempts", attemptsRouter);
api.use("/auth", authRouter);
api.use("/contests", contestsRouter);
api.use("/dashboard", dashboardRouter);
api.use("/leaderboard", leaderboardRouter);
api.use("/me", meRouter);
api.use("/problems", problemsRouter);
api.use("/users", usersRouter);
api.use(commentsRouter);

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
  // A streamed response (the terminal, R5) has already sent its status: just end it.
  if (res.headersSent) {
    console.error(err);
    return res.end();
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" } });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } });
  }
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong" } });
});
