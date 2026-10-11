"use client";

import { primaryButton } from "@/components/admin/problems/shared";
import { Icon } from "@/components/Icon";
import { usePlan } from "@/hooks/usePlan";
import { PLANS, type Plan } from "@/lib/plans";

const MODEL_LABEL: Record<string, string> = {
  "claude-haiku": "Claude Haiku",
  "claude-sonnet": "Claude Sonnet",
  "claude-opus": "Claude Opus",
  user_provided: "Your own API key and model",
};

const features = (p: Plan) => [
  { label: p.promptsPerDay === "unlimited" ? "Unlimited AI prompts" : `${p.promptsPerDay} AI prompts a day`, on: true },
  { label: MODEL_LABEL[p.model] ?? p.model, on: true },
  { label: "All problems", on: p.hasAllProblems },
  { label: "Career paths", on: p.hasCareerPaths },
  { label: "AI feedback after every solve", on: p.hasFeedback },
  { label: "Rank up emails", on: p.hasRankUpEmails },
];

// X2: the four plans side by side. No checkout yet: the admin sets plans by hand until payments exist.
export default function PricingPage() {
  const { planId } = usePlan();
  return (
    <div className="w-full px-6 py-8 wide:mx-auto wide:max-w-[1200px]">
      <h1 className="text-3xl font-semibold text-text">Pricing</h1>
      <p className="mt-2 text-muted">Pick the AI you debug with. Prompt limits reset at midnight UTC.</p>

      <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {Object.values(PLANS).map((p) => {
          const current = p.id === planId;
          return (
            <li
              key={p.id}
              className={`flex min-w-0 flex-col rounded border bg-surface p-5 ${current ? "border-action/60" : "border-border"}`}
            >
              <h2 className="text-lg font-semibold text-text">{p.name}</h2>
              <p className="mt-1 text-2xl font-semibold text-text">{p.price}</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {features(p).map((f) => (
                  <li key={f.label} className={`flex items-start gap-2 ${f.on ? "text-text" : "text-muted line-through"}`}>
                    <Icon name={f.on ? "check" : "lock"} className={`mt-0.5 h-4 w-4 shrink-0 ${f.on ? "text-passed" : "text-muted"}`} />
                    <span className="min-w-0 break-words">{f.label}</span>
                  </li>
                ))}
              </ul>
              {current ? (
                <p className="mt-6 rounded border border-action/60 px-4 py-2 text-center text-sm font-medium text-action">
                  Current plan
                </p>
              ) : (
                <button type="button" disabled className={`${primaryButton} mt-6 w-full`}>
                  Coming soon
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
