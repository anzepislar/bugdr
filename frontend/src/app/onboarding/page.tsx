"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ErrorMessage, primaryButton, Spinner } from "@/components/admin/problems/shared";
import { AuthHeader } from "@/components/auth/AuthShell";
import { Icon } from "@/components/Icon";
import { useLogout } from "@/components/app/Session";
import { api } from "@/lib/api";
import {
  EXPERIENCE_LABEL,
  STARTING_DIFFICULTY,
  type ExperienceLevel,
  type OnboardingAnswers,
  type PlatformGoal,
} from "@/lib/types/dashboard";
import { DIFFICULTY_LABEL } from "@/lib/types/problem";
import { LANGUAGES } from "@/lib/types/profile";

interface Choice<T> {
  value: T;
  name: string;
  hint: string;
}

// "exploring" is only a UI value; it is saved as goalRole null (D41).
type RoleChoice = NonNullable<OnboardingAnswers["goalRole"]> | "exploring";

const ROLES: Choice<RoleChoice>[] = [
  { value: "backend", name: "Backend engineer", hint: "APIs, services and distributed systems" },
  { value: "frontend", name: "Frontend engineer", hint: "Interfaces, accessibility and performance" },
  { value: "fullstack", name: "Full-stack engineer", hint: "From the browser to the database" },
  { value: "ai-engineer", name: "AI engineer", hint: "Models, retrieval and data pipelines" },
  { value: "database", name: "Database engineer", hint: "Queries, storage and reliability" },
  { value: "exploring", name: "Exploring my path", hint: "Start with a little of everything" },
];

const EXPERIENCE_HINT: Record<ExperienceLevel, string> = {
  student: "I have not worked on a production codebase yet.",
  junior: "I have shipped changes and fixed a few real issues.",
  mid: "I regularly work on production systems.",
  senior: "I own systems and handle complex incidents.",
};
const EXPERIENCE: Choice<ExperienceLevel>[] = (Object.keys(EXPERIENCE_HINT) as ExperienceLevel[]).map((l) => ({
  value: l,
  name: EXPERIENCE_LABEL[l],
  hint: EXPERIENCE_HINT[l],
}));

const GOALS: Choice<PlatformGoal>[] = [
  { value: "get_hired", name: "Get hired", hint: "Build a record of real engineering work." },
  { value: "improve_skills", name: "Improve my skills", hint: "Practice debugging beyond the happy path." },
  { value: "both", name: "Both", hint: "Grow my skills and show what I can do." },
];

const STEPS = [
  { title: "What role best describes you?", intro: "Choose your current role or the one you are working toward." },
  { title: "How much production experience?", intro: "We will use this to choose your starting difficulty." },
  { title: "What brings you to Bugdr?", intro: "Choose the outcome that matters most to you." },
  { title: "Which languages feel familiar?", intro: "Select all that apply. You can explore new stacks anytime." },
];

const cardClass =
  "flex cursor-pointer items-center gap-4 rounded border border-border px-4 py-4 hover:border-muted has-checked:border-action has-checked:bg-action/10 has-focus-visible:ring-2 has-focus-visible:ring-action";

export default function OnboardingPage() {
  const router = useRouter();
  const logout = useLogout();
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<RoleChoice | null>(null);
  const [experience, setExperience] = useState<ExperienceLevel | null>(null);
  const [goal, setGoal] = useState<PlatformGoal | null>(null);
  const [languages, setLanguages] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Each step swaps the question in place: move focus to it so screen readers announce it.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) firstRender.current = false;
    else headingRef.current?.focus();
  }, [step]);

  const answered = [role, experience, goal, true][step] !== null;
  const last = step === STEPS.length - 1;

  async function next() {
    if (!last) return setStep(step + 1);
    if (!role || !experience || !goal) return;
    setStatus("saving");
    try {
      const answers: OnboardingAnswers = {
        goalRole: role === "exploring" ? null : role,
        experienceLevel: experience,
        platformGoal: goal,
        languages,
      };
      await api("/me/onboarding", { method: "PUT", body: JSON.stringify(answers) });
      router.push("/");
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  function toggleLanguage(lang: string) {
    setLanguages((ls) => (ls.includes(lang) ? ls.filter((l) => l !== lang) : [...ls, lang]));
  }

  const summary = [
    ROLES.find((r) => r.value === role)?.name,
    experience && DIFFICULTY_LABEL[STARTING_DIFFICULTY[experience]],
    languages[0],
  ].filter(Boolean);

  return (
    <div className="flex flex-1 flex-col">
      <AuthHeader>
        <button type="button" onClick={logout} className="text-sm text-muted hover:text-text">
          Sign out
        </button>
      </AuthHeader>

      <main className="mx-auto mt-12 w-full max-w-[708px] px-6 pb-8 sm:mt-24">
        <p className="text-xs font-semibold uppercase text-action">Your engineering path</p>
        <ol aria-label="Progress" className="mt-6 grid grid-cols-4 gap-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className={`h-[3px] rounded-full ${i <= step ? "bg-action" : "bg-border"}`}>
              <span className="sr-only">
                Step {i + 1}
                {i < step ? " (done)" : i === step ? " (current)" : ""}
              </span>
            </li>
          ))}
        </ol>

        <p className="mt-10 text-xs uppercase text-muted">
          Step {step + 1} of {STEPS.length}
        </p>
        <h1 ref={headingRef} tabIndex={-1} className="mt-4 text-3xl font-bold text-text focus:outline-none">
          {STEPS[step].title}
        </h1>
        <p className="mt-3 text-muted">{STEPS[step].intro}</p>

        <fieldset className="mt-12">
          <legend className="sr-only">{STEPS[step].title}</legend>
          {step === 0 ? <Choices name="role" grid choices={ROLES} value={role} onChange={setRole} /> : null}
          {step === 1 ? <Choices name="experience" choices={EXPERIENCE} value={experience} onChange={setExperience} /> : null}
          {step === 2 ? <Choices name="goal" choices={GOALS} value={goal} onChange={setGoal} /> : null}
          {step === 3 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {LANGUAGES.map((lang) => (
                <label key={lang} className={`${cardClass} py-3`}>
                  <input
                    type="checkbox"
                    checked={languages.includes(lang)}
                    onChange={() => toggleLanguage(lang)}
                    className="peer sr-only"
                  />
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-muted/50 text-canvas peer-checked:border-action peer-checked:bg-action [&>svg]:invisible peer-checked:[&>svg]:visible">
                    <Icon name="check" className="h-3 w-3" />
                  </span>
                  <span className="text-sm text-text">{lang}</span>
                </label>
              ))}
            </div>
          ) : null}
        </fieldset>

        {last && summary.length ? (
          <div className="mt-12 border-t border-border pt-8">
            <p className="text-xs font-semibold uppercase text-muted">Your starting path</p>
            <p className="mt-3 font-semibold text-text">{summary.join(" · ")}</p>
          </div>
        ) : null}

        <div className="mt-16 flex items-center gap-4">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="inline-flex items-center gap-1 text-sm text-action hover:underline"
            >
              <Icon name="arrowLeft" className="h-3.5 w-3.5" /> Back
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void next()}
            disabled={!answered || status === "saving"}
            className={`${primaryButton} ml-auto py-2.5 sm:min-w-38 sm:px-8`}
          >
            {status === "saving" && <Spinner />}
            {last ? "Go to dashboard" : "Continue"}
          </button>
        </div>
        {status === "error" && <ErrorMessage>Could not save your answers. Try again.</ErrorMessage>}
      </main>

      {step === 0 ? (
        <p className="mx-auto mt-auto w-full max-w-[708px] px-6 pb-8 pt-12 text-xs text-muted">
          You can change your path later in Settings.
        </p>
      ) : null}
    </div>
  );
}

function Choices<T extends string>({
  name,
  choices,
  value,
  onChange,
  grid = false,
}: {
  name: string;
  choices: Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
  grid?: boolean;
}) {
  return (
    <div className={`grid gap-4 ${grid ? "sm:grid-cols-2" : ""}`}>
      {choices.map((c) => (
        <label key={c.value} className={cardClass}>
          <input
            type="radio"
            name={name}
            checked={value === c.value}
            onChange={() => onChange(c.value)}
            className="peer sr-only"
          />
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-muted/50 text-canvas peer-checked:border-action peer-checked:bg-action [&>svg]:invisible peer-checked:[&>svg]:visible">
            <Icon name="check" className="h-3 w-3" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-text">{c.name}</span>
            <span className="mt-1 block text-xs text-muted">{c.hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
