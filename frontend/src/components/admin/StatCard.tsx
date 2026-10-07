import Link from "next/link";

interface Props {
  label: string;
  value: number;
  /** Change vs. the previous period, in %. Omit for no trend. */
  trendPct?: number | null;
  href?: string;
}

export function StatCard({ label, value, trendPct, href }: Props) {
  const body = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-text">{value.toLocaleString("en-US")}</p>
      {trendPct != null && (
        <p className={`mt-1 text-xs font-medium ${trendPct >= 0 ? "text-passed" : "text-failed"}`}>
          {trendPct >= 0 ? "▲ +" : "▼ "}
          {trendPct}% <span className="font-normal text-muted">vs previous</span>
        </p>
      )}
    </>
  );
  const className = "block min-w-0 rounded border border-border bg-surface p-5";
  return href ? (
    <Link href={href} className={`${className} hover:border-action`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
