// Defaults match docker-compose.yml, so local dev works without a .env.
const env = process.env;
const production = env.NODE_ENV === "production";

if (production && !env.JWT_SECRET) throw new Error("JWT_SECRET must be set in production");

export const config = {
  production,
  port: Number(env.PORT ?? 4000),
  databaseUrl:
    env.NODE_ENV === "test"
      ? (env.TEST_DATABASE_URL ?? "postgres://bugdr:bugdr@localhost:5432/bugdr_test")
      : (env.DATABASE_URL ?? "postgres://bugdr:bugdr@localhost:5432/bugdr"),
  jwtSecret: env.JWT_SECRET ?? "dev-only-secret",
};
