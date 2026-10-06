import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DifficultyPill } from "@/components/DifficultyPill";
import { Icon } from "@/components/Icon";
import { countdown } from "@/lib/format";
import { mockGetContest } from "@/lib/mock/contests";
import type { ContestDetail } from "@/lib/types/contest";

const RULES = [
  "Start before the contest closes.",
  "The timer starts when you enter the workspace.",
  "All scenario checks must pass for a completed submission.",
  "Your first successful submission is final.",
  "Discussion unlocks after you solve the incident.",
];

const utc = (iso: string) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${date} at ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
};

// Rendered per request, so the countdown is as of this load.
async function load(id: string) {
  return { contest: await mockGetContest(id), now: Date.now() };
}

export default async function ContestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { contest: c, now } = await load(id);
  if (!c) notFound();

  return (
    <div className="w-full px-6 py-8 wide:mx-auto wide:max-w-[1200px]">
      <Link href="/contests" className="inline-flex items-center gap-1.5 text-sm text-action hover:underline">
        <Icon name="arrowLeft" className="h-4 w-4" /> All contests
      </Link>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <span className="rounded bg-action/15 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-action">
          {c.type} contest
        </span>
        {c.difficulty ? <DifficultyPill difficulty={c.difficulty} /> : null}
      </div>
      <h1 className="mt-3 text-3xl font-semibold text-text">{c.title}</h1>
      <p className="mt-3 text-muted">
        {c.problem ? [c.problem.repositoryName, ...c.tags].join(" · ") : c.description}
      </p>

      <div className="mt-8 flex flex-col gap-8 border-t border-border pt-8 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {c.problem ? (
            <section aria-labelledby="incident-heading">
              <h2 id="incident-heading" className="text-xl font-semibold text-text">
                The incident
              </h2>
              <p className="mt-4 whitespace-pre-line leading-relaxed text-muted">{c.problem.incident}</p>
              {c.thumbnailUrl ? (
                <Image
                  src={c.thumbnailUrl}
                  alt=""
                  width={240}
                  height={112}
                  unoptimized
                  className="mt-8 aspect-[15/7] w-full max-w-md rounded bg-surface object-cover"
                />
              ) : null}
            </section>
          ) : (
            <section
              aria-label="Incident locked"
              className="flex items-start gap-4 rounded border border-border bg-surface p-5"
            >
              <Icon name="lock" className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
              <p className="text-sm text-text">
                <span className="font-semibold">The incident is hidden</span> — it is revealed when the contest starts.
              </p>
            </section>
          )}

          <section aria-labelledby="rules-heading" className="mt-8">
            <h2 id="rules-heading" className="text-xl font-semibold text-text">
              Contest rules
            </h2>
            <ul className="mt-4 flex flex-col gap-3 text-muted">
              {RULES.map((r) => (
                <li key={r} className="flex items-start gap-3">
                  <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-action" />
                  {r}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-8 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:w-80 lg:overflow-y-auto xl:w-96">
          <EntryCard contest={c} now={now} />
          <Participation contest={c} />
        </aside>
      </div>
    </div>
  );
}

function EntryCard({ contest: c, now }: { contest: ContestDetail; now: number }) {
  const timing = {
    live: { label: "Closes in", value: countdown(Date.parse(c.endsAt) - now), note: `Closes ${utc(c.endsAt)}` },
    upcoming: { label: "Starts in", value: countdown(Date.parse(c.startsAt) - now), note: `Starts ${utc(c.startsAt)}` },
    past: { label: "Ended", value: utc(c.endsAt).split(" at ")[0], note: "Its problem is now open to everyone." },
  }[c.status];

  const p = c.problem;
  const action =
    !p || c.status === "upcoming"
      ? null
      : c.status === "past" || c.participation?.solved
        ? { href: `/problems/${p.slug}`, label: "View problem" }
        : { href: `/problems/${p.slug}/solve`, label: c.participation ? "Resume contest" : "Enter contest" };

  return (
    <section className="rounded border border-border bg-surface p-6 md:grid md:grid-cols-[minmax(0,1fr)_240px] md:gap-8 lg:block">
      <div>
        <p className="text-xs text-muted">{timing.label}</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums text-text">{timing.value}</p>
        {c.status === "upcoming" ? null : (
          <p className="mt-3 text-sm text-muted">
            {c.participantCount.toLocaleString("en-US")} engineers {c.status === "past" ? "took part" : "participating"}
          </p>
        )}
        {action ? (
          <Link
            href={action.href}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded bg-action px-4 py-2.5 text-sm font-medium text-canvas hover:opacity-90 sm:w-fit sm:px-6 lg:w-full lg:justify-start lg:px-4"
          >
            {action.label} <Icon name="arrowRight" className="h-4 w-4" />
          </Link>
        ) : null}
        <p className="mt-4 text-xs text-muted">{timing.note}</p>
      </div>

      {p && c.difficulty ? (
        <dl className="mt-6 flex flex-col gap-4 border-t border-border pt-6 text-sm md:mt-0 md:border-l md:border-t-0 md:pl-8 md:pt-0 lg:mt-6 lg:border-l-0 lg:border-t lg:pl-0 lg:pt-6">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted">Difficulty</dt>
            <dd>
              <DifficultyPill difficulty={c.difficulty} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted">Validation</dt>
            <dd className="text-text">{p.checkCount} checks</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}

function Participation({ contest: c }: { contest: ContestDetail }) {
  const entry = c.participation;
  const status = !entry
    ? c.status === "past"
      ? "You did not take part."
      : "Not started"
    : `${entry.solved ? "Completed" : c.status === "past" ? "Not completed" : "In progress"} · ${entry.checksPassed}/${entry.checksTotal} checks passed`;

  return (
    <section aria-labelledby="participation-heading" className="lg:px-6">
      <h2 id="participation-heading" className="text-lg font-semibold text-text">
        Your participation
      </h2>
      <p className={`mt-3 text-sm ${entry?.solved ? "text-passed" : "text-muted"}`}>{status}</p>
      <p className="mt-6 text-sm leading-relaxed text-muted">
        {c.rewardDescription ? `Reward: ${c.rewardDescription}.` : "No reward has been announced for this contest."}
      </p>
    </section>
  );
}
