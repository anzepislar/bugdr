import Link from "next/link";
import { notFound } from "next/navigation";
import { DifficultyPill } from "@/components/DifficultyPill";
import { Icon } from "@/components/Icon";
import { mockGetProblem } from "@/lib/mock/problems";
import { CATEGORIES, type ProblemDetail } from "@/lib/types/problem";

const TABS = {
  overview: "Overview",
  repository: "Repository",
  discussion: "Discussion",
} as const;
type Tab = keyof typeof TABS;

// Tabs are ?tab= links, so the page needs no client JS.
export default async function ProblemPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ slug }, { tab: rawTab }] = await Promise.all([params, searchParams]);
  const problem = await mockGetProblem(slug);
  if (!problem) notFound();

  const tab: Tab = rawTab && rawTab in TABS ? (rawTab as Tab) : "overview";
  const solved = problem.status === "solved";
  const category = CATEGORIES.find((c) => c.slug === problem.categorySlug)?.name;

  return (
    <div className="w-full px-6 py-8 wide:mx-auto wide:max-w-[1200px]">
      <Link href="/problems" className="inline-flex items-center gap-1.5 text-sm text-action hover:underline">
        <Icon name="arrowLeft" className="h-4 w-4" /> All problems
      </Link>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <DifficultyPill difficulty={problem.difficulty} />
        <span className="text-xs text-muted">{[category, ...problem.tags].join(" · ")}</span>
      </div>
      <h1 className="mt-3 text-3xl font-semibold text-text">{problem.title}</h1>
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
            href={t === "overview" ? `/problems/${slug}` : `/problems/${slug}?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={`shrink-0 border-b-2 pb-2 pt-5 text-sm ${
              t === tab ? "border-action font-semibold text-action" : "border-transparent text-muted hover:text-text"
            }`}
          >
            {TABS[t]}
            {t === "discussion" && !solved ? " Locked" : ""}
          </Link>
        ))}
      </nav>

      <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className={`min-w-0 flex-1 ${tab === "discussion" ? "lg:self-stretch" : ""}`}>
          {tab === "overview" ? (
            <>
              <Description text={problem.description} />
              <AcceptanceChecks checks={problem.checks} />
              {!solved ? <DiscussionLocked className="mt-10" /> : null}
            </>
          ) : null}
          {tab === "repository" ? <Repository problem={problem} /> : null}
          {tab === "discussion" ? (
            solved ? (
              // ponytail: comments themselves come with slice O2.
              <p className="text-sm text-muted">{problem.commentCount} comments</p>
            ) : (
              <DiscussionEmpty count={problem.commentCount} />
            )
          ) : null}
        </div>

        <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:w-80 lg:overflow-y-auto xl:w-96">
          <StartCard problem={problem} />
        </aside>
      </div>
    </div>
  );
}

function AcceptanceChecks({ checks }: { checks: string[] }) {
  return (
    <section aria-labelledby="checks-heading" className="mt-10">
      <h2 id="checks-heading" className="text-xl font-semibold text-text">
        Acceptance checks <span className="text-sm font-normal text-muted">{checks.length}</span>
      </h2>
      <ul className="mt-4 grid gap-x-8 gap-y-3 text-sm text-muted sm:grid-cols-2">
        {checks.map((c) => (
          <li key={c} className="flex items-center gap-3">
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-action" />
            {c}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StartCard({ problem }: { problem: ProblemDetail }) {
  const solveHref = `/problems/${problem.slug}/solve`;
  const buttonClass =
    "mt-6 flex w-full items-center justify-center gap-2 rounded bg-action px-4 py-2.5 text-sm font-medium text-canvas hover:opacity-90 sm:w-fit sm:px-6 lg:w-full lg:justify-start lg:px-4";

  return (
    <section className="rounded border border-border bg-surface p-6 md:grid md:grid-cols-[minmax(0,1fr)_240px] md:gap-8 lg:block">
      <div>
        {problem.status === "solved" ? (
          <>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-text">
              <Icon name="check" className="h-5 w-5 text-passed" /> Solved
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Your result is final. Rate the problem and join the discussion.
            </p>
            <Link href={`/problems/${problem.slug}?tab=discussion`} className={buttonClass}>
              Open discussion <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-text">
              {problem.status === "in_progress" ? "Pick up where you left off" : "Ready to investigate?"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              A codebase, terminal and {problem.checks.length} checks are ready in your workspace.
            </p>
            <Link href={solveHref} className={buttonClass}>
              {problem.status === "in_progress" ? "Resume problem" : "Start problem"}{" "}
              <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
            <p className="mt-6 text-xs leading-relaxed text-muted">
              Your timer starts when you begin.
              <br />
              Your first successful result is final.
            </p>
          </>
        )}
      </div>
      <div className="mt-6 border-t border-border pt-6 md:mt-0 md:border-l md:border-t-0 md:pl-8 md:pt-0 lg:mt-6 lg:border-l-0 lg:border-t lg:pl-0 lg:pt-6">
        <p className="text-xs text-muted">Repository</p>
        <p className="mt-2 text-sm text-text">{problem.repository.name}</p>
        <p className="mt-2 text-xs text-muted">{problem.repository.stack.join(" · ")}</p>
      </div>
    </section>
  );
}

function Repository({ problem }: { problem: ProblemDetail }) {
  return (
    <section aria-labelledby="repo-heading">
      <h2 id="repo-heading" className="text-xl font-semibold text-text">
        {problem.repository.name}
      </h2>
      <p className="mt-2 text-sm text-muted">
        You get the full codebase when you start. File contents stay hidden until then.
      </p>
      <ul className="mt-6 rounded border border-border bg-surface p-5 font-mono text-[13px] leading-7 text-muted">
        {problem.repository.files.toSorted().map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </section>
  );
}

function DiscussionLocked({ className = "" }: { className?: string }) {
  return (
    <section
      aria-label="Discussion locked"
      className={`flex items-start gap-4 rounded border border-border bg-surface p-5 ${className}`}
    >
      <Icon name="lock" className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
      <div>
        <p className="text-sm text-text">
          <span className="font-semibold">Discussion is locked</span> — complete this problem to join the discussion and
          rate your experience.
        </p>
      </div>
    </section>
  );
}

// Locked state of the Discussion tab: fills the column, so a short tab leaves no gap next to the side panel.
function DiscussionEmpty({ count }: { count: number }) {
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
        Complete this problem to join the discussion and rate your experience.
      </p>
      <p className="mt-3 text-xs text-muted">{count} engineers have commented.</p>
    </section>
  );
}

type Block =
  { kind: "h"; text: string } | { kind: "p"; text: string } | { kind: "code"; title: string; lines: string[] };

// ponytail: a tiny subset of markdown (## headings, paragraphs, ``` blocks). Swap for a markdown lib if admins need more.
function parseDescription(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let code: Extract<Block, { kind: "code" }> | null = null;
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };

  for (const line of text.split("\n")) {
    if (code) {
      if (line.startsWith("```")) {
        blocks.push(code);
        code = null;
      } else code.lines.push(line);
    } else if (line.startsWith("```")) {
      flush();
      code = { kind: "code", title: line.slice(3).trim(), lines: [] };
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push({ kind: "h", text: line.slice(3) });
    } else if (!line.trim()) flush();
    else para.push(line.trim());
  }
  flush();
  if (code) blocks.push(code);
  return blocks;
}

function Description({ text }: { text: string }) {
  return (
    <div className="flex flex-col">
      {parseDescription(text).map((b, i) =>
        b.kind === "h" ? (
          <h2 key={i} className="mt-8 text-xl font-semibold text-text first:mt-0">
            {b.text}
          </h2>
        ) : b.kind === "p" ? (
          <p key={i} className="mt-4 leading-relaxed text-muted">
            {b.text}
          </p>
        ) : (
          <figure key={i} className="mt-8 rounded bg-surface px-5 py-4">
            {b.title ? <figcaption className="text-xs text-muted">{b.title}</figcaption> : null}
            <pre className="mt-3 overflow-x-auto text-[13px] leading-6 text-text">{b.lines.join("\n")}</pre>
          </figure>
        ),
      )}
    </div>
  );
}
