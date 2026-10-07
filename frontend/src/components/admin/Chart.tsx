"use client";

import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DIFFICULTIES, DIFFICULTY_LABEL, type Difficulty } from "@/lib/types/problem";

// Graphite Signal tokens as hex - SVG attributes don't resolve Tailwind classes.
const C = {
  surface: "#202226",
  border: "#383c43",
  action: "#8bacff",
  text: "#f2f3f5",
  muted: "#acb2be",
};

const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  easy: "#22c55e",
  medium: "#f59e0b",
  hard: "#f97316",
  get_a_job: "#ef4444",
};

const HEIGHT = 240;
const fmt = (n: number) => n.toLocaleString("en-US");
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const axis = { stroke: C.border, tick: { fill: C.muted, fontSize: 12 }, tickLine: false } as const;
const tooltip = {
  contentStyle: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12 },
  labelStyle: { color: C.muted },
  itemStyle: { color: C.text },
  cursor: { fill: "rgba(139,172,255,0.08)", stroke: C.border },
} as const;

/** Heading above the chart (no titles inside charts) + a Surface card. */
export function ChartCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded border border-border bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-text">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function UserGrowthChart({
  data,
  metric,
}: {
  data: { date: string; signups: number; dau: number }[];
  metric: "signups" | "dau";
}) {
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={C.border} vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} {...axis} />
        <YAxis tickFormatter={fmt} axisLine={false} width={48} {...axis} />
        <Tooltip {...tooltip} labelFormatter={(d) => shortDate(String(d))} formatter={(v) => fmt(Number(v))} />
        <Line
          type="monotone"
          dataKey={metric}
          name={metric === "dau" ? "Daily active users" : "Signups"}
          stroke={C.action}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, stroke: C.surface, strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Single-series vertical bars. */
export function ColumnChart({
  data,
  xKey,
  yKey,
  name,
  dateAxis = false,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  yKey: string;
  name: string;
  dateAxis?: boolean;
}) {
  const xFormat = dateAxis ? (v: string) => shortDate(v) : undefined;
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={C.border} vertical={false} />
        <XAxis dataKey={xKey} tickFormatter={xFormat} minTickGap={8} {...axis} />
        <YAxis tickFormatter={fmt} axisLine={false} width={48} {...axis} />
        <Tooltip
          {...tooltip}
          labelFormatter={(l) => (xFormat ? xFormat(String(l)) : String(l))}
          formatter={(v) => fmt(Number(v))}
        />
        <Bar dataKey={yKey} name={name} fill={C.action} radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bars, sorted by the caller, count at the bar end. */
export function HorizontalBarChart({ data, name }: { data: { label: string; value: number }[]; name: string }) {
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" width={112} axisLine={false} {...axis} />
        <Tooltip {...tooltip} formatter={(v) => fmt(Number(v))} />
        <Bar dataKey="value" name={name} fill={C.action} radius={[0, 4, 4, 0]} maxBarSize={24}>
          <LabelList dataKey="value" position="right" formatter={(v) => fmt(Number(v))} fill={C.text} fontSize={12} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Donut with the total in the middle and a legend with % below. */
export function DifficultyDonut({ data }: { data: Record<Difficulty, number> }) {
  const rows = DIFFICULTIES.map((d) => ({ key: d, name: DIFFICULTY_LABEL[d], value: data[d] }));
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  return (
    <>
      <div className="relative h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip {...tooltip} formatter={(v) => fmt(Number(v))} />
            {/* 2px Surface stroke = gap between segments (difficulty hues are close under CVD). */}
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="90%" stroke={C.surface} strokeWidth={2}>
              {rows.map((r) => (
                <Cell key={r.key} fill={DIFFICULTY_COLOR[r.key]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold tabular-nums text-text">{fmt(total)}</span>
          <span className="text-xs text-muted">solves</span>
        </div>
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DIFFICULTY_COLOR[r.key] }} />
            <span className="truncate text-muted">{r.name}</span>
            <span className="ml-auto tabular-nums text-text">{Math.round((r.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </>
  );
}
