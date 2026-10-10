// Defaults match docker-compose.yml, so local dev works without a .env.
const env = process.env;
const production = env.NODE_ENV === "production";
// Tests never reach an AI provider with a real key from .env (S8 feedback runs in the background after every solve);
// a test that needs a key sets it on config itself.
const testing = env.NODE_ENV === "test";

if (production && !env.JWT_SECRET) throw new Error("JWT_SECRET must be set in production");
if (env.ADMIN_PASSWORD_HASH && !/^scrypt:[^:]+:[^:]+$/.test(env.ADMIN_PASSWORD_HASH))
  throw new Error("ADMIN_PASSWORD_HASH is not a hash: paste the line from `npm run hash-password`");
if (env.API_KEY_ENCRYPTION_KEY && !/^[0-9a-f]{64}$/i.test(env.API_KEY_ENCRYPTION_KEY))
  throw new Error("API_KEY_ENCRYPTION_KEY must be 32 bytes as 64 hex characters: `openssl rand -hex 32`");

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
  anthropicApiKey: testing ? "" : (env.ANTHROPIC_API_KEY ?? ""),
  analysisModel: env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
  // A9.1: or OpenAI (model chosen by the user: gpt-4o). With both keys, AI_PROVIDER=openai|anthropic decides.
  openaiApiKey: testing ? "" : (env.OPENAI_API_KEY ?? ""),
  openaiModel: env.OPENAI_MODEL ?? "gpt-4o",
  aiProvider: env.AI_PROVIDER ?? "",
  // S1 (D62): the built-in chat on the platform key uses a cheap model (default per provider) and a daily
  // per-user token limit (UTC day).
  aiFreeModel: env.AI_FREE_MODEL ?? "",
  aiFreeDailyTokens: Number(env.AI_FREE_DAILY_TOKENS ?? 20000),
  // S6 (D63): master key for users' own API keys (AES-256-GCM). Unset = connecting a key is switched off.
  apiKeyEncryptionKey: env.API_KEY_ENCRYPTION_KEY ?? "",
  // D68: every email goes through Resend. Unset outside production = emails are printed instead of sent.
  // Tests never send: a test that needs it sets resendApiKey + resendApiUrl (a local fake) on config.
  resendApiKey: testing ? "" : (env.RESEND_API_KEY ?? ""),
  resendApiUrl: env.RESEND_API_URL ?? "https://api.resend.com",
  emailFrom: env.EMAIL_FROM ?? "Bugdr <hello@mail.bugdr.app>",
  // Links in emails (password reset).
  appUrl: (env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
};
