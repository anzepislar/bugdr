import Link from "next/link";
import { primaryButton, secondaryButton } from "@/components/admin/problems/shared";
import { Icon } from "@/components/Icon";
import { PLANS, type PlanId } from "@/lib/plans";

type Feature = "career_paths" | "feedback" | "prompts";

interface UpgradePromptProps {
  feature: Feature;
  className?: string;
  /** prompts: the daily limit that was hit (default Free's). */
  limit?: number;
  /** The user's plan, when known: a paid plan is not offered Pro again. */
  planId?: PlanId;
}

const COPY: Record<Feature, (limit: number) => { heading: string; description: string }> = {
  career_paths: () => ({
    heading: "Career paths are a Pro feature",
    description:
      "Follow a structured path from Easy to Get a job. Unlock Medium, Hard and Get a job problems in the right order for your target role.",
  }),
  feedback: () => ({
    heading: "AI feedback is a Pro feature",
    description:
      "After every solve, get a personalized breakdown comparing your session to top performers — exactly what to improve and how.",
  }),
  prompts: (limit) => ({
    heading: `You've used all ${limit} prompts for today`,
    description: "Upgrade to Pro for 150 prompts/day with Claude Sonnet, or connect your own API key for unlimited prompts.",
  }),
};

// X2: shown in place of a feature the user's plan does not include.
export function UpgradePrompt({ feature, className = "", limit = Number(PLANS.free.promptsPerDay), planId = "free" }: UpgradePromptProps) {
  const paid = planId !== "free";
  const { heading, description } = COPY[feature](limit);
  return (
    <div className={`rounded-lg border border-action/25 bg-action/8 p-6 backdrop-blur-md text-center ${className}`}>
      <Icon name="lock" className="mx-auto h-5 w-5 text-muted" />
      <p className="mt-3 font-semibold text-text">{heading}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
        {paid && feature === "prompts" ? "Connect your own API key for unlimited prompts. Limits reset at midnight UTC." : description}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {paid ? null : (
          <Link href="/pricing" className={primaryButton}>
            Upgrade to Pro
          </Link>
        )}
        <Link href="/settings?tab=account" className={secondaryButton}>
          Connect API key
        </Link>
      </div>
    </div>
  );
}
