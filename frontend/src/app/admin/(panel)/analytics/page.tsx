"use client";

import { Fragment, useEffect, useState } from "react";
import { ChartCard, ColumnChart, HorizontalBarChart } from "@/components/admin/Chart";
import { DifficultyBadge } from "@/components/admin/problems/shared";
import { StatCard } from "@/components/admin/StatCard";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import type { AdminAnalytics, ModelUsage, ProblemAnalyticsDetail } from "@/lib/types/adminAnalytics";
import { DIFFICULTY_LABEL } from "@/lib/types/problem";

const th = "pb-2 text-left text-xs font-medium uppercase tracking-wide text-muted";
const td = "border-b border-border py-2.5";
const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;
const dash = (n: number | null, show: (n: number) => string) => (n === null ? "-" : show(n));
const modelLabel = (m: ModelUsage) => `${m.model}${m.keySource === "user" ? " (own key)" : ""}`;

/** Models + the benchmark a problem is scored against now, loaded when its row is opened. */
function ProblemDetail({ id }: { id: string }) {
  const [detail, setDetail] = useState<ProblemAnalyticsDetail | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    api<ProblemAnalyticsDetail>(`/admin/analytics/problems/${id}`).then(setDetail, () => setError(true));
  }, [id]);
  if (error) return <p className="text-sm text-failed">Could not load this problem.</p>;
  if (!detail) return <p className="text-sm text-muted">Loading…</p>;
  const b = detail.benchmark;
  return (
    <div className="grid gap-4 text-sm sm:grid-cols-2">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Models used</p>
        {detail.models.length ? (
          <ul className="mt-2 space-y-1">
            {detail.models.map((m) => (
              <li key={`${m.model}-${m.keySource}`} className="flex justify-between gap-3">
                <span className="truncate text-text">{modelLabel(m)}</span>
                <span className="shrink-0 tabular-nums text-muted">{m.prompts.toLocaleString("en-US")} prompts</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-muted">No prompts yet.</p>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Scored against</p>
        <p className="mt-2 text-text">
          {round(b.prompts)} prompts · {Math.round(b.tokens).toLocaleString("en-US")} tokens · {round(b.iterations)} iterations
        </p>
        <p className="mt-1 text-muted">
          {b.source === "problem" ? "This problem's own averages" : "The difficulty's defaults (under 5 scored solves)"}
        </p>
      </div>
    </div>
  );
}

// S5: AI session analytics (04 "AI Session Analytics"), all time.
export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api<AdminAnalytics>("/admin/analytics").then(setData, () => setError(true));
  }, []);

  const t = data?.totals;
  return (
    <div className="w-full px-6 py-8 wide:mx-auto wide:max-w-[1200px]">
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold text-text">Analytics</h1>
        <p className="mt-1 text-sm text-muted">How engineers use AI, all time. Only solves with an efficiency score count.</p>
      </header>

      {error ? (
        <p className="mt-8 text-sm text-failed">Could not load the analytics. Reload the page.</p>
      ) : !data || !t ? (
        <p className="mt-8 text-sm text-muted">Loading…</p>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatCard label="Scored solves" value={t.scoredSolves} />
            <StatCard label="Avg prompts per solve" value={dash(t.avgPrompts, (n) => String(round(n)))} />
            <StatCard label="Avg tokens per solve" value={dash(t.avgTokens, (n) => Math.round(n).toLocaleString("en-US"))} />
            <StatCard label="Avg efficiency" value={dash(t.avgEfficiency, (n) => `${n.toFixed(2)}x`)} />
            <StatCard label="First-run pass rate" value={dash(t.firstRunPassRate, (n) => `${n}%`)} />
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChartCard title="Prompts by Difficulty" subtitle="Average per scored solve">
              <ColumnChart
                // A difficulty without solves has no bar (not a 0).
                data={data.promptsByDifficulty.map((d) => ({
                  difficulty: DIFFICULTY_LABEL[d.difficulty],
                  ...(d.avgPrompts === null ? {} : { prompts: round(d.avgPrompts) }),
                }))}
                xKey="difficulty"
                yKey="prompts"
                name="Avg prompts"
              />
            </ChartCard>
            <ChartCard title="Efficiency Distribution" subtitle="Scored solves by efficiency score">
              <ColumnChart data={data.efficiencyDistribution} xKey="range" yKey="solves" name="Solves" />
            </ChartCard>
            <ChartCard title="Models Used" subtitle="Prompts per model, all problems">
              {data.models.length ? (
                <HorizontalBarChart name="Prompts" data={data.models.map((m) => ({ label: modelLabel(m), value: m.prompts }))} />
              ) : (
                <p className="py-10 text-center text-sm text-muted">No prompts yet.</p>
              )}
            </ChartCard>
            <ChartCard title="Efficiency by Week" subtitle="Average score of the week's solves, last 12 weeks">
              <ColumnChart
                data={data.efficiencyByWeek.map((w) => ({
                  week: w.week,
                  ...(w.avgEfficiency === null ? {} : { efficiency: round(w.avgEfficiency, 2) }),
                }))}
                xKey="week"
                yKey="efficiency"
                name="Avg efficiency"
                dateAxis
              />
            </ChartCard>
          </div>

          <section aria-labelledby="per-problem-heading" className="mt-10">
            <h2 id="per-problem-heading" className="text-lg font-semibold text-text">
              Per problem
            </h2>
            <p className="mt-1 text-sm text-muted">
              Averages of the problem&apos;s scored solves. From 5 solves they replace the difficulty&apos;s defaults when
              scoring new solves.
            </p>
            {data.problems.length === 0 ? (
              <p className="mt-6 text-sm text-muted">No published problems.</p>
            ) : (
              <table className="mt-6 w-full table-fixed text-sm">
                <thead>
                  <tr>
                    <th className={th}>Problem</th>
                    <th className={`${th} hidden w-28 md:table-cell`}>Difficulty</th>
                    <th className={`${th} w-16 text-right`}>Solves</th>
                    <th className={`${th} hidden w-20 text-right sm:table-cell`}>Prompts</th>
                    <th className={`${th} hidden w-24 text-right lg:table-cell`}>Tokens</th>
                    <th className={`${th} w-16 text-right`}>Score</th>
                    <th className={`${th} hidden w-20 text-right lg:table-cell`}>1st run</th>
                    <th className={`${th} hidden w-28 pl-4 lg:table-cell`}>Benchmark</th>
                    <th className={`${th} w-10`}>
                      <span className="sr-only">Details</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.problems.map((p) => (
                    <Fragment key={p.id}>
                      <tr>
                        <td className={`${td} truncate pr-3 text-text`}>{p.title}</td>
                        <td className={`${td} hidden md:table-cell`}>
                          <DifficultyBadge difficulty={p.difficulty} />
                        </td>
                        <td className={`${td} text-right tabular-nums`}>{p.solves.toLocaleString("en-US")}</td>
                        <td className={`${td} hidden text-right tabular-nums sm:table-cell`}>
                          {dash(p.avgPrompts, (n) => String(round(n)))}
                        </td>
                        <td className={`${td} hidden text-right tabular-nums lg:table-cell`}>
                          {dash(p.avgTokens, (n) => Math.round(n).toLocaleString("en-US"))}
                        </td>
                        <td className={`${td} text-right tabular-nums`}>{dash(p.avgEfficiency, (n) => `${n.toFixed(2)}x`)}</td>
                        <td className={`${td} hidden text-right tabular-nums lg:table-cell`}>
                          {dash(p.firstRunPassRate, (n) => `${n}%`)}
                        </td>
                        <td className={`${td} hidden pl-4 text-muted lg:table-cell`}>
                          {p.benchmarkSource === "problem" ? "Own" : "Difficulty"}
                        </td>
                        <td className={`${td} text-right`}>
                          <button
                            type="button"
                            onClick={() => setOpen(open === p.id ? null : p.id)}
                            aria-expanded={open === p.id}
                            aria-label={`Details for ${p.title}`}
                            className="rounded p-1 text-muted hover:text-action"
                          >
                            <Icon name="chevronDown" className={`h-4 w-4 transition-transform ${open === p.id ? "rotate-180" : ""}`} />
                          </button>
                        </td>
                      </tr>
                      {open === p.id ? (
                        <tr>
                          <td colSpan={9} className="border-b border-border bg-surface px-4 py-4">
                            <ProblemDetail id={p.id} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
