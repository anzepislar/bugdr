"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChartCard, ColumnChart, DifficultyDonut, HorizontalBarChart, UserGrowthChart } from "@/components/admin/Chart";
import { DifficultyBadge } from "@/components/admin/problems/shared";
import { StatCard } from "@/components/admin/StatCard";
import { api } from "@/lib/api";
import { STATS_RANGES, type AdminOverview, type StatsRange } from "@/lib/types/adminStats";
import { CATEGORIES } from "@/lib/types/problem";

const roleName = (slug: string) => CATEGORIES.find((c) => c.slug === slug)?.name.replace(" Engineer", "") ?? slug;
const pct = (o: { started: number; solved: number }) => Math.round((1 - o.solved / o.started) * 100);

const th = "pb-2 text-left text-xs font-medium uppercase tracking-wide text-muted";
const td = "border-b border-border py-2.5";

/** Pill tabs; also used for the Signups / DAU toggle. */
function Pills<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Record<T, string>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1 rounded border border-border bg-surface p-1">
      {(Object.keys(options) as T[]).map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={key === value}
          onClick={() => onChange(key)}
          className={`rounded px-3 py-1 text-sm ${key === value ? "bg-canvas font-medium text-action" : "text-muted hover:text-text"}`}
        >
          {options[key]}
        </button>
      ))}
    </div>
  );
}

export default function AdminOverviewPage() {
  const [range, setRange] = useState<StatsRange>("7d");
  const [growth, setGrowth] = useState<"signups" | "dau">("signups");
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Ignore an answer for a range the admin has already left.
    let current = true;
    api<AdminOverview>(`/admin/stats?range=${range}`)
      .then((d) => {
        if (!current) return;
        setData(d);
        setError(false);
      })
      .catch(() => current && setError(true));
    return () => {
      current = false;
    };
  }, [range]);

  return (
    <div className="w-full px-6 py-8 wide:mx-auto wide:max-w-[1200px]">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-semibold text-text">Overview</h1>
          <p className="mt-1 text-sm text-muted">Platform health and activity</p>
        </div>
        <Pills options={STATS_RANGES} value={range} onChange={setRange} label="Date range" />
      </header>

      {error ? (
        <p className="mt-8 text-sm text-failed">Could not load the stats. Reload the page.</p>
      ) : !data ? (
        <p className="mt-8 text-sm text-muted">Loading…</p>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatCard label="Total Users" value={data.totalUsers} />
            <StatCard label="Active Users" value={data.activeUsers.value} trendPct={data.activeUsers.trendPct} />
            <StatCard label="Problems Published" value={data.problemsPublished} />
            <StatCard label="Solves" value={data.solves.value} trendPct={data.solves.trendPct} />
            <StatCard label="Active Contests" value={data.activeContests} href="/admin/contests" />
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="min-w-0 lg:col-span-3">
              <ChartCard
                title="User Growth"
                subtitle="Last 30 days"
                action={
                  <Pills options={{ signups: "Signups", dau: "DAU" }} value={growth} onChange={setGrowth} label="Metric" />
                }
              >
                <UserGrowthChart data={data.userGrowth} metric={growth} />
              </ChartCard>
            </div>
            <div className="min-w-0 lg:col-span-2">
              <ChartCard title="Solves Per Day" subtitle="Last 14 days">
                <ColumnChart data={data.solvesPerDay} xKey="date" yKey="solves" name="Solves" dateAxis />
              </ChartCard>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            <ChartCard title="Solve Distribution" subtitle="By difficulty, all time">
              <DifficultyDonut data={data.solvesByDifficulty} />
            </ChartCard>
            <ChartCard title="Solves by Role" subtitle="All time">
              <HorizontalBarChart
                name="Solves"
                data={[...data.solvesByRole]
                  .sort((a, b) => b.solves - a.solves)
                  .map((r) => ({ label: roleName(r.categorySlug), value: r.solves }))}
              />
            </ChartCard>
            <ChartCard title="User Streaks" subtitle="Users by current streak">
              <ColumnChart data={data.streaks} xKey="range" yKey="users" name="Users" />
            </ChartCard>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChartCard title="Top Problems" subtitle="Most solved, all time">
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr>
                    <th className={th}>Problem</th>
                    <th className={`${th} w-24`}>Difficulty</th>
                    <th className={`${th} w-20 text-right`}>Solves</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topProblems.slice(0, 8).map((p) => (
                    <tr key={p.slug}>
                      <td className={`${td} truncate pr-3`}>
                        <Link href={`/problems/${p.slug}`} className="text-text hover:text-action" title={p.title}>
                          {p.title}
                        </Link>
                      </td>
                      <td className={td}>
                        <DifficultyBadge difficulty={p.difficulty} />
                      </td>
                      <td className={`${td} text-right tabular-nums`}>{p.solves.toLocaleString("en-US")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.topProblems.length === 0 && <p className="pt-3 text-sm text-muted">No solves yet.</p>}
            </ChartCard>

            <ChartCard title="Needs Attention" subtitle="Started but not solved">
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr>
                    <th className={th}>Problem</th>
                    <th className={`${th} hidden w-20 text-right sm:table-cell`}>Started</th>
                    <th className={`${th} hidden w-20 text-right sm:table-cell`}>Solved</th>
                    <th className={`${th} w-20 text-right`}>Drop-off</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.dropOff]
                    .sort((a, b) => pct(b) - pct(a))
                    .slice(0, 8)
                    .map((p) => (
                      <tr key={p.slug}>
                        <td className={`${td} truncate pr-3`}>
                          <Link href={`/problems/${p.slug}`} className="text-text hover:text-action" title={p.title}>
                            {p.title}
                          </Link>
                        </td>
                        <td className={`${td} hidden text-right tabular-nums sm:table-cell`}>{p.started.toLocaleString("en-US")}</td>
                        <td className={`${td} hidden text-right tabular-nums sm:table-cell`}>{p.solved.toLocaleString("en-US")}</td>
                        <td className={`${td} text-right tabular-nums ${pct(p) > 70 ? "text-failed" : "text-text"}`}>
                          {pct(p)}%
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {data.dropOff.length === 0 && <p className="pt-3 text-sm text-muted">Nobody has started a problem yet.</p>}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
