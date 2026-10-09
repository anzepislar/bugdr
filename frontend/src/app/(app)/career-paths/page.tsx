import Link from "next/link";
import { DifficultyPill } from "@/components/DifficultyPill";
import { Icon } from "@/components/Icon";
import { serverFetch } from "@/lib/serverApi";
import type { CareerPath, StageMetric } from "@/lib/types/careerPath";
import { CATEGORIES, DIFFICULTIES, DIFFICULTY_LABEL } from "@/lib/types/problem";

const METRIC: Record<StageMetric["key"], { label: string; show: (v: number) => string }> = {
  efficiency: { label: "AI efficiency", show: (v) => v.toFixed(2) },
  prompts: { label: "Prompts per solve", show: (v) => String(Math.round(v * 10) / 10) },
  firstRun: { label: "Passed on first run", show: (v) => `${Math.round(v * 100)}%` },
  timeMultiplier: { label: "Time bonus", show: (v) => `×${v.toFixed(2)}` },
};

// K2 (D66): one page, the paths as an accordion (user, 10. 10. 2026). The goal role comes first and starts open.
export default async function CareerPathsPage() {
  const res = await serverFetch("/career-paths");
  if (!res.ok) throw new Error(`GET /career-paths failed: ${res.status}`);
  const { paths } = (await res.json()) as { paths: CareerPath[] };
  const openRole = (paths.find((p) => p.isGoalRole) ?? paths[0])?.role;

  return (
    <div className="w-full px-6 py-8 wide:mx-auto wide:max-w-[1200px]">
      <h1 className="text-3xl font-semibold text-text">Career paths</h1>
      <p className="mt-2 text-muted">
        Every path has its own problems, from Easy to Get a job. Hit the targets on your recent solves to unlock the next
        stage. Follow as many paths as you like.
      </p>

      <div className="mt-8 space-y-3">
        {paths.map((path) => (
          <PathRow key={path.role} path={path} open={path.role === openRole} />
        ))}
      </div>
    </div>
  );
}

function PathRow({ path, open }: { path: CareerPath; open: boolean }) {
  const name = CATEGORIES.find((c) => c.slug === path.role)?.name ?? path.role;
  const current = DIFFICULTIES.indexOf(path.stage);
  return (
    <details open={open} className="group rounded border border-border bg-surface">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <Icon name="chevronDown" className="h-4 w-4 shrink-0 -rotate-90 text-muted transition-transform group-open:rotate-0" />
          <span className="min-w-0 break-words text-lg font-semibold text-text">{name}</span>
          {path.isGoalRole && (
            <span className="shrink-0 rounded border border-border px-2 py-0.5 text-xs font-medium text-muted">Your role</span>
          )}
        </span>
        <span className="flex w-full items-center justify-between gap-3 pl-6 sm:w-auto sm:pl-0">
          <StageSteps current={current} />
          <span className="text-right text-sm text-muted sm:w-36">
            {path.started
              ? `${DIFFICULTY_LABEL[path.stage]} · ${path.solvesOnStage} ${path.solvesOnStage === 1 ? "solve" : "solves"}`
              : "Not started"}
          </span>
        </span>
      </summary>

      <div className="flex flex-col gap-8 border-t border-border p-4 sm:p-5 lg:flex-row lg:items-start">
        <ol className="min-w-0 flex-1 space-y-3">
          {DIFFICULTIES.map((stage, i) => (
            <li key={stage} className={`rounded border p-4 ${i === current ? "border-action/40" : "border-border"}`}>
              <p className="flex items-start gap-2 text-sm font-semibold text-text">
                {i < current ? (
                  <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-passed" />
                ) : i > current ? (
                  <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                ) : (
                  <span aria-hidden className="mx-[3px] mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full bg-action" />
                )}
                <span>
                  {DIFFICULTY_LABEL[stage]}{" "}
                  <span className="font-normal text-muted">
                    {i < current ? "· unlocked" : i > current ? `· unlocks after ${DIFFICULTY_LABEL[DIFFICULTIES[i - 1]]}` : "· current stage"}
                  </span>
                </span>
              </p>
              {i === current && <StageProgress path={path} />}
            </li>
          ))}
        </ol>

        <aside className="w-full shrink-0 lg:w-80 xl:w-96">
          <NextProblem path={path} />
        </aside>
      </div>
    </details>
  );
}

function StageSteps({ current }: { current: number }) {
  return (
    <span className="flex items-center" aria-label={`Stage ${current + 1} of ${DIFFICULTIES.length}`}>
      {DIFFICULTIES.map((stage, i) => (
        <span key={stage} className="flex items-center">
          {i > 0 && <span className={`h-px w-3 ${i <= current ? "bg-action" : "bg-border"}`} />}
          <span className={`h-2.5 w-2.5 rounded-full ${i <= current ? "bg-action" : "border border-border"}`} />
        </span>
      ))}
    </span>
  );
}

function StageProgress({ path }: { path: CareerPath }) {
  const p = path.progress;
  if (!p)
    return (
      <p className="mt-3 text-sm text-muted">This is the top stage. Keep solving to stay sharp.</p>
    );
  return (
    <div className="mt-4 space-y-3">
      <Bar
        label="Solves on this stage"
        value={`${p.solves} / ${p.required}`}
        fill={Math.min(p.solves / p.required, 1)}
        met={p.solves >= p.required}
      />
      {p.metrics.map((m) => (
        <Bar
          key={m.key}
          label={METRIC[m.key].label}
          value={`${m.value === null ? "–" : METRIC[m.key].show(m.value)} ${m.direction === "min" ? "≥" : "≤"} ${METRIC[m.key].show(m.target)}`}
          // Prompts: full while at or under the target, shrinking above it.
          fill={m.value === null ? 0 : m.direction === "min" ? Math.min(m.value / m.target, 1) : Math.min(m.target / Math.max(m.value, 0.01), 1)}
          met={m.met}
        />
      ))}
      <p className="text-xs text-muted">
        Averages of your last {p.required} solves on this stage. Meet every target to unlock {DIFFICULTY_LABEL[p.nextStage]}.
      </p>
    </div>
  );
}

function Bar({ label, value, fill, met }: { label: string; value: string; fill: number; met: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 text-muted">{label}</span>
        <span className={`flex shrink-0 items-center gap-1.5 tabular-nums ${met ? "text-passed" : "text-text"}`}>
          {met && <Icon name="check" className="h-3.5 w-3.5" />}
          {value}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas">
        <div className={`h-full rounded-full ${met ? "bg-passed" : "bg-muted"}`} style={{ width: `${fill * 100}%` }} />
      </div>
    </div>
  );
}

function NextProblem({ path }: { path: CareerPath }) {
  const next = path.nextProblem;
  if (!next)
    return (
      <section className="rounded border border-border bg-canvas p-5">
        <h2 className="text-lg font-semibold text-text">Next problem</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          No {DIFFICULTY_LABEL[path.stage]} problem left on this path right now. New problems are coming - check back soon.
        </p>
      </section>
    );
  return (
    <section className="rounded border border-border bg-canvas p-5">
      <h2 className="text-lg font-semibold text-text">{next.inProgress ? "Pick up where you left off" : "Next problem"}</h2>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted">
        <DifficultyPill difficulty={next.difficulty} />
        <span className="flex items-center gap-1">
          <Icon name="clock" className="h-3.5 w-3.5" /> {next.timeLimitMinutes} min
        </span>
      </div>
      <p className="mt-3 break-words font-semibold text-text">{next.title}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">{next.shortDescription}</p>
      <Link
        href={`/problems/${next.slug}/solve?path=${path.role}`}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded bg-action px-4 py-2.5 text-sm font-medium text-canvas hover:opacity-90 sm:w-fit sm:px-6 lg:w-full"
      >
        {next.inProgress ? "Resume problem" : "Start problem"} <Icon name="arrowRight" className="h-4 w-4" />
      </Link>
    </section>
  );
}
