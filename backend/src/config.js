// Defaults match docker-compose.yml, so local dev works without a .env.
const env = process.env;
const production = env.NODE_ENV === "production";

if (production && !env.JWT_SECRET) throw new Error("JWT_SECRET must be set in production");
if (env.ADMIN_PASSWORD_HASH && !/^scrypt:[^:]+:[^:]+$/.test(env.ADMIN_PASSWORD_HASH))
  throw new Error("ADMIN_PASSWORD_HASH is not a hash: paste the line from `npm run hash-password`");

export const config = {
  production,
  port: Number(env.PORT ?? 4000),
  databaseUrl:
    env.NODE_ENV === "test"
      ? (env.TEST_DATABASE_URL ?? "postgres://bugdr:bugdr@localhost:5432/bugdr_test")
      : (env.DATABASE_URL ?? "postgres://bugdr:bugdr@localhost:5432/bugdr"),
  jwtSecret: env.JWT_SECRET ?? "dev-only-secret",
  // R3/D54: one Node base image for the check runner.
  runnerImage: env.RUNNER_IMAGE ?? "node:24-alpine",
  // D48: the admin is not a user account. Unset = admin login switched off.
  adminEmail: env.ADMIN_EMAIL?.trim().toLowerCase() ?? "",
  adminPasswordHash: env.ADMIN_PASSWORD_HASH ?? "",
  // A10: Claude analysis of uploaded problems (server only, D21). Model chosen by the user: Sonnet 5.5.
  anthropicApiKey: env.ANTHROPIC_API_KEY ?? "",
  analysisModel: env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
};
