"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ContestWizard } from "@/components/admin/contests/ContestWizard";
import { Icon } from "@/components/Icon";
import { getContestStatus } from "@/lib/getContestStatus";
import { mockGetAdminContest } from "@/lib/mock/adminContests";
import type { AdminContest } from "@/lib/types/contest";

const toDate = (iso: string | null) => (iso ? new Date(iso) : null);

export default function EditContestPage() {
  const { id } = useParams<{ id: string }>();
  const [contest, setContest] = useState<AdminContest | null | undefined>(undefined);

  useEffect(() => {
    mockGetAdminContest(id).then(setContest);
  }, [id]);

  const status = contest && getContestStatus({ starts_at: toDate(contest.startsAt), ends_at: toDate(contest.endsAt) });

  return (
    <div className="w-full px-6 py-8 wide:mx-auto wide:max-w-[1200px]">
      <Link href="/admin/contests" className="inline-flex items-center gap-1.5 text-sm text-action hover:underline">
        <Icon name="arrowLeft" className="h-3.5 w-3.5" /> Contest management
      </Link>
      <h1 className="mt-3 text-3xl font-semibold text-text">Edit contest</h1>

      {contest === undefined ? (
        <p className="mt-8 text-sm text-muted">Loading contest…</p>
      ) : contest === null ? (
        <p className="mt-8 rounded border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          This contest does not exist.
        </p>
      ) : status === "draft" || status === "scheduled" ? (
        <ContestWizard initial={contest} />
      ) : (
        <p className="mt-8 flex items-center gap-3 rounded border border-border bg-surface px-4 py-4 text-sm text-text">
          <Icon name="lock" className="h-5 w-5 shrink-0 text-muted" />
          This contest has already started, so it can no longer be edited.
        </p>
      )}
    </div>
  );
}
