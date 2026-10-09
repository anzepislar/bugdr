"use client";

import { useEffect, useState } from "react";
import { ErrorMessage, Spinner, cardClass, inputClass, primaryButton, saveErrorMessage } from "@/components/admin/problems/shared";
import { StatCard } from "@/components/admin/StatCard";
import { Icon } from "@/components/Icon";
import { api, ApiError } from "@/lib/api";
import type { AdminCareerPaths, LeavableStage, StageThreshold, Thresholds } from "@/lib/types/adminCareerPaths";
import { CATEGORIES, DIFFICULTIES, DIFFICULTY_LABEL } from "@/lib/types/problem";

const STAGES: LeavableStage[] = ["easy", "medium", "hard"];
const th = "pb-2 text-left text-xs font-medium uppercase tracking-wide text-muted";
const td = "border-b border-border py-2.5";
// Literal class names so Tailwind picks them up.
const SEGMENT = { easy: "bg-easy", medium: "bg-medium", hard: "bg-hard", get_a_job: "bg-get-a-job" } as const;
const BLOCKER = {
  solves: "Not enough solves",
  efficiency: "AI efficiency",
  prompts: "Prompts",
  firstRun: "First-run pass rate",
  timeMultiplier: "Time bonus",
} as const;

/** The form keeps strings so a field can be empty while typing; first run is edited in %. */
type Field = "solves" | "efficiency" | "prompts" | "firstRun" | "timeMultiplier";
type Form = Record<LeavableStage, Record<Field, string>>;
const FIELDS: { key: Field; label: string; step: string; hint: string }[] = [
  { key: "solves", label: "Min solves", step: "1", hint: "1-50" },
  { key: "efficiency", label: "Efficiency ≥", step: "0.05", hint: "0.5-2.0" },
  { key: "prompts", label: "Prompts ≤", step: "0.5", hint: "per solve" },
  { key: "firstRun", label: "First run ≥ %", step: "5", hint: "0-100" },
  { key: "timeMultiplier", label: "Time bonus ≥", step: "0.05", hint: "1.0-2.0, empty = none" },
];
const toForm = (t: Thresholds): Form =>
  Object.fromEntries(
    STAGES.map((s) => [
      s,
      {
        solves: String(t[s].solves),
        efficiency: String(t[s].efficiency),
        prompts: String(t[s].prompts),
        firstRun: String(Math.round(t[s].firstRun * 100)),
        timeMultiplier: t[s].timeMultiplier === null ? "" : String(t[s].timeMultiplier),
      },
    ]),
  ) as Form;
const fromForm = (f: Form): Thresholds =>
  Object.fromEntries(
    STAGES.map((s): [LeavableStage, StageThreshold] => [
      s,
      {
        solves: Number(f[s].solves),
        efficiency: Number(f[s].efficiency),
        prompts: Number(f[s].prompts),
        firstRun: Number(f[s].firstRun) / 100,
        timeMultiplier: f[s].timeMultiplier.trim() === "" ? null : Number(f[s].timeMultiplier),
      },
    ]),
  ) as Thresholds;

// K3: career path metrics (04 "Career path metrics") + the unlock thresholds, the same for every path.
export default function AdminCareerPathsPage() {
  const [data, setData] = useState<AdminCareerPaths | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api<AdminCareerPaths>("/admin/career-paths").then(setData, () => setError(true));
  }, []);

  return (
    <div className="w-full px-6 py-8 wide:mx-auto wide:max-w-[1200px]">
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold text-text">Career paths</h1>
        <p className="mt-1 text-sm text-muted">
          Where engineers are on their paths, and the targets that unlock each stage. Counts are per engineer and path.
        </p>
      </header>

      {error ? (
        <p className="mt-8 text-sm text-failed">Could not load the career paths. Reload the page.</p>
      ) : !data ? (
        <p className="mt-8 text-sm text-muted">Loading…</p>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Engineers on a path" value={data.totals.engineers} />
            <StatCard label="Reached Get a job" value={data.totals.reachedGetAJob} />
            <StatCard label={`Stuck (no solve in ${data.stuckDays} days)`} value={data.totals.stuck} />
          </div>

          <section aria-labelledby="distribution-heading" className={`${cardClass} mt-10`}>
            <h2 id="distribution-heading" className="text-lg font-semibold text-text">
              Stage distribution
            </h2>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {DIFFICULTIES.map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <span aria-hidden className={`h-2.5 w-2.5 rounded-sm ${SEGMENT[s]}`} /> {DIFFICULTY_LABEL[s]}
                </li>
              ))}
            </ul>
            <ul className="mt-5 space-y-4">
              {data.paths.map((p) => (
                <li key={p.role}>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="min-w-0 text-text">{CATEGORIES.find((c) => c.slug === p.role)?.name ?? p.role}</span>
                    <span className="shrink-0 tabular-nums text-muted">
                      {p.engineers} {p.engineers === 1 ? "engineer" : "engineers"}
                    </span>
                  </div>
                  <div
                    className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-canvas"
                    title={DIFFICULTIES.map((s) => `${DIFFICULTY_LABEL[s]}: ${p.stages[s]}`).join(" · ")}
                  >
                    {p.engineers > 0 &&
                      DIFFICULTIES.map((s) => (
                        <div key={s} className={SEGMENT[s]} style={{ width: `${(p.stages[s] / p.engineers) * 100}%` }} />
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="stages-heading" className="mt-10">
            <h2 id="stages-heading" className="text-lg font-semibold text-text">
              Pass rate and drop-off
            </h2>
            <p className="mt-1 text-sm text-muted">
              Pass rate = engineers past the stage out of those who reached it. Stuck = no solve on the path in{" "}
              {data.stuckDays} days; blockers = targets they still miss.
            </p>
            <table className="mt-6 w-full table-fixed text-sm">
              <thead>
                <tr>
                  <th className={`${th} w-24`}>Stage</th>
                  <th className={`${th} hidden w-20 text-right sm:table-cell`}>Reached</th>
                  <th className={`${th} hidden w-20 text-right sm:table-cell`}>Passed</th>
                  <th className={`${th} w-20 text-right`}>Pass rate</th>
                  <th className={`${th} w-16 text-right`}>Stuck</th>
                  <th className={`${th} hidden pl-6 md:table-cell`}>Blockers</th>
                </tr>
              </thead>
              <tbody>
                {data.stages.map((s) => (
                  <tr key={s.stage} className="align-top">
                    <td className={`${td} text-text`}>
                      {DIFFICULTY_LABEL[s.stage]}
                      {/* The blockers column is hidden on small screens. */}
                      <p className="mt-1 text-xs text-muted md:hidden">{blockerText(s.blockers)}</p>
                    </td>
                    <td className={`${td} hidden text-right tabular-nums text-muted sm:table-cell`}>{s.reached}</td>
                    <td className={`${td} hidden text-right tabular-nums text-muted sm:table-cell`}>{s.passed}</td>
                    <td className={`${td} text-right tabular-nums text-text`}>
                      {s.passRate === null ? "-" : `${Math.round(s.passRate * 100)}%`}
                    </td>
                    <td className={`${td} text-right tabular-nums text-text`}>{s.stuck}</td>
                    <td className={`${td} hidden pl-6 text-muted md:table-cell`}>{blockerText(s.blockers)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <ThresholdsForm initial={data.thresholds} />
        </>
      )}
    </div>
  );
}

const blockerText = (blockers: AdminCareerPaths["stages"][number]["blockers"]) =>
  blockers.length ? blockers.map((b) => `${BLOCKER[b.key]} (${b.count})`).join(" · ") : "Nobody stuck";

function ThresholdsForm({ initial }: { initial: Thresholds }) {
  const [form, setForm] = useState(() => toForm(initial));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [invalid, setInvalid] = useState<Record<string, string>>({});

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    setInvalid({});
    try {
      const { thresholds } = await api<{ thresholds: Thresholds }>("/admin/career-paths/thresholds", {
        method: "PUT",
        body: JSON.stringify(fromForm(form)),
      });
      setForm(toForm(thresholds));
      setStatus({ ok: true, message: "Thresholds saved. They apply from each engineer's next solve on a path." });
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        setInvalid(err.details as Record<string, string>);
        setStatus({ ok: false, message: "Check the highlighted fields." });
      } else setStatus({ ok: false, message: saveErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} aria-labelledby="thresholds-heading" className={`${cardClass} mt-10`}>
      <h2 id="thresholds-heading" className="text-lg font-semibold text-text">
        Unlock thresholds
      </h2>
      <p className="mt-1 text-sm text-muted">
        The same for every path. To leave a stage an engineer needs the minimum number of solves on it, and the averages
        of that many latest solves must meet every target.
      </p>
      <div className="mt-6 space-y-6">
        {STAGES.map((stage, i) => (
          <fieldset key={stage}>
            <legend className="text-sm font-semibold text-text">
              {DIFFICULTY_LABEL[stage]} → {DIFFICULTY_LABEL[DIFFICULTIES[i + 1]]}
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {FIELDS.map((f) => {
                const id = `${stage}-${f.key}`;
                // The server checks first run as a share (0-1); here it is edited in %.
                const error = invalid[`${stage}.${f.key}`] && (f.key === "firstRun" ? "0-100" : invalid[`${stage}.${f.key}`]);
                return (
                  <div key={f.key} className="min-w-0">
                    <label htmlFor={id} className="block text-xs text-muted">
                      {f.label}
                    </label>
                    <input
                      id={id}
                      type="number"
                      inputMode="decimal"
                      step={f.step}
                      value={form[stage][f.key]}
                      onChange={(e) => setForm({ ...form, [stage]: { ...form[stage], [f.key]: e.target.value } })}
                      aria-invalid={error ? true : undefined}
                      className={`${inputClass} mt-1 tabular-nums ${error ? "border-failed" : ""}`}
                    />
                    <p className={`mt-1 text-xs ${error ? "text-failed" : "text-muted"}`}>{error ?? f.hint}</p>
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      {status &&
        (status.ok ? (
          <p role="status" className="mt-6 flex items-center gap-2 text-sm text-passed">
            <Icon name="check" className="h-4 w-4" /> {status.message}
          </p>
        ) : (
          <ErrorMessage>{status.message}</ErrorMessage>
        ))}
      <button type="submit" disabled={saving} className={`${primaryButton} mt-6 w-full sm:w-fit`}>
        {saving && <Spinner />} Save thresholds
      </button>
    </form>
  );
}
