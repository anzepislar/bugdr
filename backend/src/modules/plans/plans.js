import { HttpError } from "../../errors.js";

// X2: what each plan gets. Same plans as frontend/src/lib/plans.ts. promptsPerDay counts platform-key prompts per
// UTC day; null = no platform prompts at all (Own Key: the user's key, no limit). A connected own key is always used
// for the chat, on any plan, and never counts. models = the platform model per provider.
export const PLANS = {
  free: {
    promptsPerDay: 30,
    models: { anthropic: "claude-haiku-4-5", openai: "gpt-4o-mini" },
    careerPaths: false,
    feedback: false,
    rankUpEmails: false,
  },
  pro: {
    promptsPerDay: 150,
    models: { anthropic: "claude-sonnet-5-5", openai: "gpt-4o" },
    careerPaths: true,
    feedback: true,
    rankUpEmails: true,
  },
  own_key: { promptsPerDay: null, models: null, careerPaths: true, feedback: true, rankUpEmails: true },
  max: {
    promptsPerDay: 150,
    models: { anthropic: "claude-opus-5-5", openai: "gpt-4o" },
    careerPaths: true,
    feedback: true,
    rankUpEmails: true,
  },
};

export const planRequired = (what) => new HttpError(403, "PLAN_REQUIRED", `${what} need a Pro, Own Key or Max plan`);
