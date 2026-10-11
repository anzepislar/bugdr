import { useMe } from "@/components/app/Session";
import { PLANS, type Plan, type PlanId } from "@/lib/plans";

/**
 * The signed-in user's plan (guests: Free), from the (app) layout's session. Today's prompt count comes with the AI
 * chat (GET /attempts/:id/ai/messages), where the server counts it.
 */
export function usePlan(): { plan: Plan; planId: PlanId } {
  const planId = useMe()?.plan ?? "free";
  return { plan: PLANS[planId], planId };
}
