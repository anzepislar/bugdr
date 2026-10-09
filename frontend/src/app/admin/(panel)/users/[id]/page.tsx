"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BanBadge } from "@/components/admin/BanBadge";
import { cardClass, DifficultyBadge, primaryButton, secondaryButton } from "@/components/admin/problems/shared";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { duration, formatDate, formatUtcDateTime } from "@/lib/format";
import type { AdminUserDetail, AttemptStatus } from "@/lib/types/adminUser";
import { EXPERIENCE_LABEL } from "@/lib/types/dashboard";
import { CATEGORIES } from "@/lib/types/problem";

const STATUS: Record<AttemptStatus, { label: string; className: string }> = {
  solved: { label: "Solved", className: "text-passed" },
  in_progress: { label: "In progress", className: "text-pending" },
  abandoned: { label: "Gave up", className: "text-muted" },
};
const GOAL = {
  get_hired: "Get hired",
  improve_skills: "Improve skills",
  both: "Both",
} as const;

// A8 (04 "User detail"): profile, stats, every attempt with its tries, ban / unban.
export default function AdminUserPage() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<AdminUserDetail | null | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      api<{ user: AdminUserDetail }>(`/admin/users/${id}`)
        .then((r) => setUser(r.user))
        .catch(() => setUser(null)), // 404 → "does not exist"
    [id],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function toggleBan() {
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/users/${user.id}/${user.isBanned ? "unban" : "ban"}`, {
        method: "POST",
      });
      setConfirming(false);
      await load();
    } catch {
      setError("That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full px-6 py-8 wide:mx-auto wide:max-w-[1200px]">
      <Link href="/admin/users" className="inline-flex items-center gap-1.5 text-sm text-action hover:underline">
        <Icon name="arrowLeft" className="h-3.5 w-3.5" /> Users
      </Link>

      {user === undefined ? (
        <p className="mt-8 text-sm text-muted">Loading user…</p>
      ) : user === null ? (
        <p className="mt-8 rounded border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          This user does not exist.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 break-words text-3xl font-semibold text-text">{user.username}</h1>
            <BanBadge banned={user.isBanned} />
          </div>
          <p className="mt-2 break-words text-muted">{user.email}</p>

          <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {[
                  ["Points", user.stats.totalPoints.toLocaleString("en-US")],
                  ["Level", user.stats.level.name],
                  ["Solved", user.stats.problemsSolved],
                  ["Streak", `${user.stats.currentStreak} (best ${user.stats.longestStreak})`],
                ].map(([label, value]) => (
                  <div key={label} className={`${cardClass} min-w-0`}>
                    <p className="text-xs text-muted">{label}</p>
                    <p className="mt-1 truncate text-lg font-semibold text-text">{value}</p>
                  </div>
                ))}
              </div>

              <h2 className="mt-8 text-lg font-semibold text-text">Attempts</h2>
              {user.attempts.length === 0 ? (
                <p className="mt-4 rounded border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
                  No attempts yet.
                </p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {user.attempts.map((a) => (
                    <li key={a.problemSlug} className={`${cardClass} min-w-0`}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <Link
                          href={`/problems/${a.problemSlug}`}
                          className="min-w-0 break-words font-medium text-text hover:text-action"
                        >
                          {a.title}
                        </Link>
                        <DifficultyBadge difficulty={a.difficulty} />
                        <span className={`text-sm font-medium ${STATUS[a.status].className}`}>
                          {STATUS[a.status].label}
                        </span>
                      </div>
                      {a.status === "solved" && (
                        <p className="mt-2 text-sm text-muted">
                          {a.pointsEarned} pts · {a.timeTakenSeconds !== null ? duration(a.timeTakenSeconds) : "—"} ·
                          solved {a.solvedAt ? formatUtcDateTime(a.solvedAt) : "—"} (UTC)
                        </p>
                      )}
                      <ol className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs text-muted">
                        {a.tries.map((t) => (
                          <li key={t.tryNumber} className="flex flex-wrap gap-x-2">
                            <span className="text-text">Try {t.tryNumber}</span>
                            <span>
                              {formatUtcDateTime(t.startedAt)} – {t.endedAt ? formatUtcDateTime(t.endedAt) : "open"}
                            </span>
                            <span className={STATUS[t.outcome].className}>{STATUS[t.outcome].label}</span>
                            {t.durationSeconds !== null && <span>{duration(t.durationSeconds)}</span>}
                          </li>
                        ))}
                      </ol>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <aside className="shrink-0 lg:sticky lg:top-6 lg:w-80 xl:w-96">
              <div className={cardClass}>
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className={`${user.isBanned ? primaryButton : `${secondaryButton} text-failed hover:border-failed hover:text-failed`} w-full sm:w-fit lg:w-full`}
                >
                  {user.isBanned ? "Unban user" : "Ban user"}
                </button>
                <dl className="mt-5 space-y-3 text-sm">
                  {[
                    ["Display name", user.profile.displayName ?? "—"],
                    ["Headline", user.profile.headline || "—"],
                    ["GitHub", user.profile.githubUsername ?? "—"],
                    [
                      "Goal role",
                      user.profile.onboardingCompleted
                        ? (CATEGORIES.find((c) => c.slug === user.profile.goalRole)?.name ?? "Exploring")
                        : "Onboarding not done",
                    ],
                    ["Experience", user.profile.experienceLevel ? EXPERIENCE_LABEL[user.profile.experienceLevel] : "—"],
                    ["Platform goal", user.profile.platformGoal ? GOAL[user.profile.platformGoal] : "—"],
                    ["Languages", user.profile.languages.join(", ") || "—"],
                    ["Profile", user.profile.isPublic ? "Public" : "Private"],
                    ["Joined", formatDate(user.joinedAt)],
                    ["Last active", user.lastActiveAt ? formatDate(user.lastActiveAt) : "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4">
                      <dt className="shrink-0 text-muted">{label}</dt>
                      <dd className="min-w-0 break-words text-right text-text">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </aside>
          </div>

          <ConfirmDialog
            open={confirming}
            title={user.isBanned ? `Unban ${user.username}?` : `Ban ${user.username}?`}
            message={
              user.isBanned
                ? "They can log in again and their profile becomes visible."
                : "They are logged out on their next request, cannot log in, and their profile is hidden."
            }
            confirmLabel={user.isBanned ? "Unban" : "Ban"}
            busy={busy}
            error={error}
            onConfirm={toggleBan}
            onCancel={() => setConfirming(false)}
          />
        </>
      )}
    </div>
  );
}
