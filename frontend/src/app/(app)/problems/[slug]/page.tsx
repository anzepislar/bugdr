import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DifficultyPill } from "@/components/DifficultyPill";
import { Icon } from "@/components/Icon";
import { Discussion } from "@/components/problems/Discussion";
import { AcceptanceChecks, Description } from "@/components/problems/ProblemOverview";
import { RateProblem } from "@/components/problems/RateProblem";
import { duration } from "@/lib/format";
import { loginHref, SESSION_COOKIE } from "@/lib/session";
import { mockGetComments, mockGetProblem } from "@/lib/mock/problems";
import { CATEGORIES, DIFFICULTY_LABEL, type ProblemDetail, type SolveResult } from "@/lib/types/problem";

const TABS = {
  overview: "Overview",
  discussion: "Discussion",
} as const;
type Tab = keyof typeof TABS;

// Tabs are ?tab= links, so the page needs no client JS (except the rating).
// A solved problem shows its result first and the problem itself below it.
export default async function ProblemPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ slug }, { tab: rawTab }] = await Promise.all([params, searchParams]);
  const [found, cookieStore] = await Promise.all([mockGetProblem(slug), cookies()]);
  if (!found) notFound();
  // Guests see the public problem: no attempt, so no solved state (P2 sends status null without a session).
  const signedIn = cookieStore.has(SESSION_COOKIE);
  const problem: ProblemDetail = signedIn ? found : { ...found, status: null };

  const tab: Tab = rawTab && rawTab in TABS ? (rawTab as Tab) : "overview";
  const result = problem.status === "solved" ? problem.result : null;
  const solved = result !== null;
  // On a solved problem the tabs sit further down; keep them in view when switching.
  const anchor = solved ? "#about" : "";
  // Comment content is only sent for solved problems (O2), and only fetched when the tab is open.
  const comments = solved && tab === "discussion" ? await mockGetComments(slug) : null;
  const category = CATEGORIES.find((c) => c.slug === problem.categorySlug)?.name;

  return (
    <div className="w-full px-6 py-8 wide:mx-auto wide:max-w-[1200px]">
      {result ? (
        <SolvedSummary problem={problem} result={result} />
      ) : (
        <Link href="/problems" className="inline-flex items-center gap-1.5 text-sm text-action hover:underline">
          <Icon name="arrowLeft" className="h-4 w-4" /> All problems
        </Link>
      )}

      <section
        id="about"
        aria-labelledby="about-heading"
        className={solved ? "mt-12 scroll-mt-6 border-t border-border pt-10" : ""}
      >
        {solved ? (
          <h2 id="about-heading" className="text-xl font-semibold text-text">
            About this problem
          </h2>
        ) : null}
        <div className={`${solved ? "mt-4" : "mt-8"} flex flex-wrap items-center gap-3`}>
          <DifficultyPill difficulty={problem.difficulty} />
          <span className="text-xs text-muted">{[category, ...problem.tags].join(" · ")}</span>
        </div>
        {solved ? null : (
          <h1 id="about-heading" className="mt-3 text-3xl font-semibold text-text">
            {problem.title}
          </h1>
        )}
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>
            <span className="text-medium">★</span> {problem.averageRating.toFixed(1)} ({problem.ratingCount} ratings)
          </span>
          <span>{problem.timeLimitMinutes} min</span>
          <span>{problem.solveCount.toLocaleString("en-US")} engineers solved this</span>
        </p>

        <nav aria-label="Problem sections" className="mt-6 flex gap-8 overflow-x-auto border-t border-border">
          {(Object.keys(TABS) as Tab[]).map((t) => (
            <Link
              key={t}
              href={`${t === "overview" ? `/problems/${slug}` : `/problems/${slug}?tab=${t}`}${anchor}`}
              aria-current={t === tab ? "page" : undefined}
              className={`shrink-0 border-b-2 pb-2 pt-5 text-sm ${
                t === tab ? "border-action font-semibold text-action" : "border-transparent text-muted hover:text-text"
              }`}
            >
              {TABS[t]}
              {t === "discussion" ? solved ? <span className="ml-1.5">{problem.commentCount}</span> : " Locked" : null}
            </Link>
          ))}
        </nav>

        <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start">
          <div className={`min-w-0 flex-1 ${tab === "discussion" ? "lg:self-stretch" : ""}`}>
            {tab === "overview" ? (
              <>
                <Description text={problem.description} />
                {/* A solved problem lists its checks in the validation results above. */}
                {solved ? null : <AcceptanceChecks checks={problem.checks} />}
                {!solved ? <DiscussionLocked className="mt-10" signedIn={signedIn} /> : null}
              </>
            ) : null}
            {tab === "discussion" ? (
              comments ? (
                <Discussion initial={comments} />
              ) : (
                <DiscussionEmpty count={problem.commentCount} signedIn={signedIn} />
              )
            ) : null}
          </div>

          {solved ? null : (
            <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:w-80 lg:overflow-y-auto xl:w-96">
              <StartCard problem={problem} signedIn={signedIn} />
            </aside>
          )}
        </div>
      </section>
    </div>
  );
}

function SolvedSummary({ problem, result }: { problem: ProblemDetail; result: SolveResult }) {
  const stats = [
    { value: duration(result.timeTakenSeconds), label: "Time to solve" },
    { value: `${result.checksPassed} / ${result.checksTotal}`, label: "Scenario checks passed" },
    { value: `+${result.linesAdded} / −${result.linesDeleted}`, label: "Lines changed" },
    { value: DIFFICULTY_LABEL[problem.difficulty], label: "Difficulty" },
    {
      value: `+${result.pointsEarned.toLocaleString("en-US")}`,
      label: `Points earned · ${result.timeMultiplier}x time bonus`,
    },
  ];

  return (
    <section aria-labelledby="solved-heading">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <span className="inline-block rounded bg-action/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-action">
            Solved
          </span>
          <h1 id="solved-heading" className="mt-5 text-3xl font-semibold text-text">
            All checks passed.
          </h1>
          <p className="mt-2 text-lg text-muted">{problem.title}</p>
        </div>
        <Link
          href="/problems"
          className="flex shrink-0 items-center justify-center gap-2 rounded bg-action px-6 py-2.5 text-sm font-medium text-canvas hover:opacity-90 sm:w-48 sm:justify-start"
        >
          Next problem <Icon name="arrowRight" className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-8 flex items-start gap-4 rounded border border-action/20 bg-action/10 p-6">
        <Icon name="check" className="mt-1 h-5 w-5 shrink-0 text-action" />
        <div>
          <p className="text-lg font-semibold text-text">Your result has been recorded.</p>
          <p className="mt-2 text-sm text-action">
            This problem is complete. Your time and score cannot be improved by retrying.
          </p>
        </div>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 border-b border-border pb-8 md:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="flex min-w-0 flex-col-reverse justify-end">
            <dt className="mt-2 text-sm text-muted">{s.label}</dt>
            <dd className="text-3xl font-semibold tabular-nums text-text">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 flex flex-col gap-10 lg:flex-row lg:items-start">
        <section aria-labelledby="validation-heading" className="min-w-0 flex-1">
          <h2 id="validation-heading" className="text-xl font-semibold text-text">
            Validation results
          </h2>
          <ul className="mt-4">
            {problem.checks.map((c) => (
              <li key={c} className="flex items-center gap-4 border-b border-border py-3.5 text-sm">
                <Icon name="check" className="h-4 w-4 shrink-0 text-action" />
                <span className="min-w-0 flex-1 text-text">{c}</span>
                <span className="text-xs text-action">Passed</span>
              </li>
            ))}
          </ul>
        </section>

        <aside className="flex shrink-0 flex-col gap-8 lg:w-80 xl:w-96">
          <div>
            <h2 className="text-xl font-semibold text-text">What is next?</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Compare approaches in the discussion, or take on another production issue.
            </p>
            <Link
              href={`/problems/${problem.slug}?tab=discussion#about`}
              className="mt-6 block rounded border border-border bg-surface px-4 py-2.5 text-sm text-text hover:border-action"
            >
              Join the discussion
            </Link>
          </div>
          <RateProblem initial={result.myRating} />
        </aside>
      </div>

      <p className="mt-10 text-xs text-muted">
        {result.checksPassed}/{result.checksTotal} applies to this scenario&apos;s checks, not overall production
        reliability.
      </p>
    </section>
  );
}

function StartCard({ problem, signedIn }: { problem: ProblemDetail; signedIn: boolean }) {
  const solveHref = `/problems/${problem.slug}/solve`;
  const buttonClass =
    "mt-6 flex w-full items-center justify-center gap-2 rounded bg-action px-4 py-2.5 text-sm font-medium text-canvas hover:opacity-90 sm:w-fit sm:px-6 lg:w-full lg:justify-start lg:px-4";

  return (
    <section className="rounded border border-border bg-surface p-6 md:grid md:grid-cols-[minmax(0,1fr)_240px] md:gap-8 lg:block">
      <div>
        <>
          <h2 className="text-lg font-semibold text-text">
            {problem.status === "in_progress" ? "Pick up where you left off" : "Ready to investigate?"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            A codebase, terminal and {problem.checks.length} checks are ready in your workspace.
          </p>
          {signedIn ? (
            <Link href={solveHref} className={buttonClass}>
              {problem.status === "in_progress" ? "Resume problem" : "Start problem"}{" "}
              <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
          ) : (
            <>
              {/* The editor needs an account: log in, then land straight in the workspace. */}
              <Link href={loginHref(solveHref)} className={buttonClass}>
                <Icon name="lock" className="h-4 w-4" /> Log in to start
              </Link>
              <p className="mt-3 text-xs text-muted">
                No account?{" "}
                <Link href="/signup" className="text-action hover:underline">
                  Sign up free
                </Link>
              </p>
            </>
          )}
          <p className="mt-6 text-xs leading-relaxed text-muted">
            Your timer starts when you begin.
            <br />
            Your first successful result is final.
          </p>
        </>
      </div>
      <div className="mt-6 border-t border-border pt-6 md:mt-0 md:border-l md:border-t-0 md:pl-8 md:pt-0 lg:mt-6 lg:border-l-0 lg:border-t lg:pl-0 lg:pt-6">
        <p className="text-xs text-muted">Repository</p>
        <p className="mt-2 text-sm text-text">{problem.repository.name}</p>
        <p className="mt-2 text-xs text-muted">{problem.repository.stack.join(" · ")}</p>
      </div>
    </section>
  );
}

const LOCKED_TEXT = (signedIn: boolean) =>
  signedIn
    ? "complete this problem to join the discussion and rate your experience."
    : "log in and complete this problem to join the discussion and rate your experience.";

function DiscussionLocked({ className = "", signedIn }: { className?: string; signedIn: boolean }) {
  return (
    <section
      aria-label="Discussion locked"
      className={`flex items-start gap-4 rounded border border-border bg-surface p-5 ${className}`}
    >
      <Icon name="lock" className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
      <div>
        <p className="text-sm text-text">
          <span className="font-semibold">Discussion is locked</span> — {LOCKED_TEXT(signedIn)}
        </p>
      </div>
    </section>
  );
}

// Locked state of the Discussion tab: fills the column, so a short tab leaves no gap next to the side panel.
function DiscussionEmpty({ count, signedIn }: { count: number; signedIn: boolean }) {
  return (
    <section
      aria-label="Discussion locked"
      className="flex h-full flex-col items-center justify-center rounded border border-border bg-surface px-6 py-12 text-center"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-canvas">
        <Icon name="lock" className="h-5 w-5 text-muted" />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-text">Discussion is locked</h2>
      <p className="mt-2 max-w-md text-sm text-muted">
        {LOCKED_TEXT(signedIn).replace(/^./, (c) => c.toUpperCase())}
      </p>
      <p className="mt-3 text-xs text-muted">{count} engineers have commented.</p>
    </section>
  );
}
