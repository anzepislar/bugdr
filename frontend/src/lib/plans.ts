// X2: subscription plans. The server decides (backend/src/modules/plans/plans.js); this is what the UI shows.
export type PlanId = "free" | "pro" | "own_key" | "max";

export interface Plan {
  id: PlanId;
  name: string;
  price: string;
  promptsPerDay: number | "unlimited";
  model: string;
  hasCareerPaths: boolean;
  hasFeedback: boolean;
  hasRankUpEmails: boolean;
  hasAllProblems: boolean;
  ownApiKey: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    price: "€0",
    promptsPerDay: 30,
    model: "claude-haiku",
    hasCareerPaths: false,
    hasFeedback: false,
    hasRankUpEmails: false,
    hasAllProblems: true,
    ownApiKey: false,
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: "€12.99/month",
    promptsPerDay: 150,
    model: "claude-sonnet",
    hasCareerPaths: true,
    hasFeedback: true,
    hasRankUpEmails: true,
    hasAllProblems: true,
    ownApiKey: false,
  },
  own_key: {
    id: "own_key",
    name: "Own Key",
    price: "€9.99/month",
    promptsPerDay: "unlimited",
    model: "user_provided",
    hasCareerPaths: true,
    hasFeedback: true,
    hasRankUpEmails: true,
    hasAllProblems: true,
    ownApiKey: true,
  },
  max: {
    id: "max",
    name: "Max",
    price: "€199/month",
    promptsPerDay: 150,
    model: "claude-opus",
    hasCareerPaths: true,
    hasFeedback: true,
    hasRankUpEmails: true,
    hasAllProblems: true,
    ownApiKey: false,
  },
};

export function getPlanById(id: PlanId): Plan {
  return PLANS[id];
}

export function canAccessCareerPaths(planId: PlanId): boolean {
  return PLANS[planId].hasCareerPaths;
}

export function canAccessFeedback(planId: PlanId): boolean {
  return PLANS[planId].hasFeedback;
}

export function getPromptsPerDay(planId: PlanId): number | "unlimited" {
  return PLANS[planId].promptsPerDay;
}
