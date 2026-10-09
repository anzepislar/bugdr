// Account status on the admin user pages (A8).
export function BanBadge({ banned }: { banned: boolean }) {
  return (
    <span
      className={`inline-block rounded px-2 py-1 text-xs font-semibold ${
        banned ? "bg-failed/10 text-failed" : "border border-border text-muted"
      }`}
    >
      {banned ? "Banned" : "Active"}
    </span>
  );
}
