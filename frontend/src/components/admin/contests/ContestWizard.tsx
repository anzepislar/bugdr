"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ErrorMessage,
  FieldLabel,
  Spinner,
  StepIndicator,
  cardClass,
  inputClass,
  primaryButton,
  saveErrorMessage,
  secondaryButton,
} from "@/components/admin/problems/shared";
import { DifficultyPill } from "@/components/DifficultyPill";
import { Icon, type IconName } from "@/components/Icon";
import { formatUtcDateTime } from "@/lib/format";
import { getContestDates } from "@/lib/getContestDates";
import { api } from "@/lib/api";
import {
  REWARD_TYPES,
  type AdminContest,
  type AdminContestDraft,
  type ContestProblemOption,
  type RewardType,
} from "@/lib/types/contest";
import type { ContestType } from "@/lib/types/dashboard";
import { CATEGORIES } from "@/lib/types/problem";

const STEPS = ["Basic info", "Problems", "Reward", "Review"];

const TYPES: Record<ContestType, { label: string; hint: string; icon: IconName }> = {
  daily: { label: "Daily", hint: "Runs for 24 hours", icon: "clock" },
  weekly: { label: "Weekly", hint: "Runs for 7 days", icon: "calendar" },
  monthly: { label: "Monthly", hint: "Runs for a full calendar month", icon: "trophy" },
};

const categoryName = (p: ContestProblemOption) => CATEGORIES.find((c) => c.slug === p.categorySlug)?.name ?? "";

// <input type="datetime-local"> values ("2026-10-07T00:00") are read and written as UTC.
const toIso = (value: string) => (value ? new Date(`${value}:00Z`).toISOString() : null);
const toInput = (iso: string) => iso.slice(0, 16);

interface Props {
  /** Edit an existing draft or scheduled contest; omitted on /admin/contests/new. */
  initial?: AdminContest;
  /** Starts a new empty contest after saving (create only). */
  onReset?: () => void;
}

export function ContestWizard({ initial, onReset }: Props) {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [type, setType] = useState<ContestType | null>(initial?.type ?? null);
  // A scheduled contest keeps its own dates when edited.
  const [custom, setCustom] = useState(Boolean(initial?.startsAt));
  const [customStart, setCustomStart] = useState(initial?.startsAt ? toInput(initial.startsAt) : "");
  const [customEnd, setCustomEnd] = useState(initial?.endsAt ? toInput(initial.endsAt) : "");
  const [problems, setProblems] = useState<ContestProblemOption[]>(initial?.problems ?? []);
  const [rewardType, setRewardType] = useState<RewardType | null>(initial?.rewardType ?? null);
  const [rewardDescription, setRewardDescription] = useState(initial?.rewardDescription ?? "");
  const [saving, setSaving] = useState<"draft" | "schedule" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<"draft" | "schedule" | null>(null);

  // Only computed once a type is chosen, so the prerendered page never contains a build-time date.
  const auto = type ? getContestDates(type) : null;
  const startsAt = custom ? toIso(customStart) : (auto?.starts_at.toISOString() ?? null);
  const endsAt = custom ? toIso(customEnd) : (auto?.ends_at.toISOString() ?? null);
  const datesError =
    !startsAt || !endsAt
      ? "Set both the start and the close time."
      : endsAt <= startsAt
        ? "The close time must be after the start time."
        : startsAt <= new Date().toISOString()
          ? "The start time must be in the future."
          : null;

  const stepValid = [
    title.trim() !== "" && description.trim() !== "" && type !== null && (!custom || datesError === null),
    problems.length >= 1,
    rewardType === null || rewardDescription.trim() !== "",
    true,
  ];

  function toggleCustom(on: boolean) {
    if (on && auto && !customStart) {
      setCustomStart(toInput(auto.starts_at.toISOString()));
      setCustomEnd(toInput(auto.ends_at.toISOString()));
    }
    setCustom(on);
  }

  async function save(schedule: boolean) {
    if (!type) return;
    setSaving(schedule ? "schedule" : "draft");
    setError(null);
    try {
      const draft: AdminContestDraft = {
          title: title.trim(),
          type,
          description: description.trim(),
          startsAt: schedule ? startsAt : null,
          endsAt: schedule ? endsAt : null,
          problemSlugs: problems.map((p) => p.slug),
          rewardType,
          rewardDescription: rewardType ? rewardDescription.trim() : null,
      };
      // POST creates, PUT replaces an existing draft or scheduled contest (A6).
      await api(initial ? `/admin/contests/${initial.id}` : "/admin/contests", {
        method: initial ? "PUT" : "POST",
        body: JSON.stringify(draft),
      });
      setSaved(schedule ? "schedule" : "draft");
    } catch (e) {
      setError(saveErrorMessage(e));
    } finally {
      setSaving(null);
    }
  }

  if (saved) {
    return (
      <section className={`${cardClass} mt-8`}>
        <h2 className="text-lg font-semibold">{saved === "schedule" ? "Contest scheduled" : "Draft saved"}</h2>
        <p className="mt-1 text-sm text-muted">
          {saved === "schedule"
            ? `"${title.trim()}" goes live automatically on ${formatUtcDateTime(startsAt!)} UTC.`
            : `"${title.trim()}" is saved as a draft. Users don't see it until it is scheduled.`}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/admin/contests" className={primaryButton}>
            Back to contest management
          </Link>
          {onReset && (
            <button type="button" onClick={onReset} className={secondaryButton}>
              Create another contest
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <>
      <StepIndicator steps={STEPS} current={step} />

      <div className="mt-8 space-y-8">
        {step === 1 && (
          <>
            <div>
              <FieldLabel htmlFor="contest-title">Title</FieldLabel>
              <input
                id="contest-title"
                value={title}
                maxLength={255}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="A queue without a consumer"
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel htmlFor="contest-description">Description</FieldLabel>
              <textarea
                id="contest-description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is broken, and what should the engineer restore?"
                className={`${inputClass} resize-y leading-relaxed`}
              />
            </div>

            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-text">Contest type</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {(Object.keys(TYPES) as ContestType[]).map((t) => (
                  <label key={t} className="cursor-pointer">
                    <input
                      type="radio"
                      name="contest-type"
                      className="peer sr-only"
                      checked={type === t}
                      onChange={() => setType(t)}
                    />
                    <span className="flex h-full items-center gap-4 rounded border border-border bg-surface p-4 hover:border-muted peer-checked:border-action peer-focus-visible:ring-2 peer-focus-visible:ring-action sm:block sm:p-5">
                      <Icon name={TYPES[t].icon} className={`h-6 w-6 shrink-0 ${type === t ? "text-action" : "text-muted"}`} />
                      <span className="block">
                        <span className="block font-semibold text-text sm:mt-3">{TYPES[t].label}</span>
                        <span className="mt-1 block text-sm text-muted">{TYPES[t].hint}</span>
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              {type && (
                <p
                  className={`mt-4 flex items-start gap-3 rounded border bg-surface px-4 py-3 text-sm ${
                    custom && datesError ? "border-failed/40 text-failed" : "border-border text-text"
                  }`}
                >
                  <Icon name="calendar" className="mt-0.5 h-4 w-4 shrink-0" />
                  {custom && datesError
                    ? datesError
                    : `This contest will run from ${formatUtcDateTime(startsAt!)} to ${formatUtcDateTime(endsAt!)} (UTC).`}
                </p>
              )}
            </fieldset>

            <div>
              <label className="inline-flex cursor-pointer items-center gap-3 text-sm text-text">
                <input
                  type="checkbox"
                  role="switch"
                  checked={custom}
                  disabled={!type}
                  onChange={(e) => toggleCustom(e.target.checked)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className="relative h-5 w-9 rounded-full border border-border bg-canvas transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-3.5 after:w-3.5 after:rounded-full after:bg-muted after:transition-transform peer-checked:border-action peer-checked:bg-action/20 peer-checked:after:translate-x-4 peer-checked:after:bg-action peer-focus-visible:ring-2 peer-focus-visible:ring-action peer-disabled:opacity-40 motion-reduce:transition-none motion-reduce:after:transition-none"
                />
                Custom dates
              </label>
              {!type && <p className="mt-1.5 text-xs text-muted">Choose a contest type first.</p>}

              {custom && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="starts-at">Starts at (UTC)</FieldLabel>
                    <input
                      id="starts-at"
                      type="datetime-local"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className={`${inputClass} [color-scheme:dark]`}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="ends-at">Ends at (UTC)</FieldLabel>
                    <input
                      id="ends-at"
                      type="datetime-local"
                      value={customEnd}
                      min={customStart}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className={`${inputClass} [color-scheme:dark]`}
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {step === 2 && <ProblemPicker problems={problems} onChange={setProblems} />}

        {step === 3 && (
          <>
            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-text">Reward type</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {([null, ...(Object.keys(REWARD_TYPES) as RewardType[])] as const).map((r) => (
                  <label key={r ?? "none"} className="cursor-pointer">
                    <input
                      type="radio"
                      name="reward-type"
                      className="peer sr-only"
                      checked={rewardType === r}
                      onChange={() => setRewardType(r)}
                    />
                    <span className="block rounded border border-border bg-surface px-4 py-3 text-sm text-muted hover:text-text peer-checked:border-action peer-checked:text-action peer-focus-visible:ring-2 peer-focus-visible:ring-action">
                      {r ? REWARD_TYPES[r] : "No reward"}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {rewardType && (
              <div>
                <FieldLabel htmlFor="reward-description">Reward description</FieldLabel>
                <input
                  id="reward-description"
                  value={rewardDescription}
                  maxLength={255}
                  onChange={(e) => setRewardDescription(e.target.value)}
                  placeholder={rewardType === "merch" ? "Bugdr hoodie" : "1 year free subscription"}
                  className={inputClass}
                />
              </div>
            )}
          </>
        )}

        {step === 4 && type && (
          <section className={cardClass}>
            <h2 className="text-lg font-semibold">Review</h2>
            <dl className="mt-4 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-muted">Title</dt>
              <dd className="break-words text-text">{title.trim()}</dd>
              <dt className="text-muted">Description</dt>
              <dd className="whitespace-pre-line break-words text-text">{description.trim()}</dd>
              <dt className="text-muted">Type</dt>
              <dd className="text-text">{TYPES[type].label}</dd>
              <dt className="text-muted">Dates</dt>
              <dd className="text-text">
                {formatUtcDateTime(startsAt!)} – {formatUtcDateTime(endsAt!)} UTC
                {custom && <span className="text-muted"> · custom</span>}
              </dd>
              <dt className="text-muted">Problems ({problems.length})</dt>
              <dd>
                <ul className="space-y-2">
                  {problems.map((p) => (
                    <li key={p.slug} className="flex flex-wrap items-center gap-2 text-text">
                      <DifficultyPill difficulty={p.difficulty} /> {p.title}
                    </li>
                  ))}
                </ul>
              </dd>
              <dt className="text-muted">Reward</dt>
              <dd className="break-words text-text">
                {rewardType ? `${REWARD_TYPES[rewardType]} · ${rewardDescription.trim()}` : "No reward"}
              </dd>
            </dl>
            <p className="mt-6 border-t border-border pt-4 text-xs text-muted">
              A draft has no dates and is not visible to users. A scheduled contest goes live automatically at its start time.
            </p>
            {error && <ErrorMessage>{error}</ErrorMessage>}
          </section>
        )}
      </div>

      <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-border pt-6">
        <button
          type="button"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 1 || saving !== null}
          className={secondaryButton}
        >
          Back
        </button>
        {step < 4 ? (
          <button type="button" onClick={() => setStep((s) => s + 1)} disabled={!stepValid[step - 1]} className={primaryButton}>
            Continue
          </button>
        ) : (
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => save(false)} disabled={saving !== null} className={secondaryButton}>
              {saving === "draft" && <Spinner />} Save as Draft
            </button>
            <button
              type="button"
              onClick={() => save(true)}
              disabled={saving !== null || datesError !== null}
              className={primaryButton}
            >
              {saving === "schedule" && <Spinner />} Schedule Contest
            </button>
          </div>
        )}
      </div>
      {step === 4 && datesError && <p className="mt-3 text-right text-xs text-failed">{datesError} Go back to Basic info.</p>}
    </>
  );
}

function ProblemPicker({
  problems,
  onChange,
}: {
  problems: ContestProblemOption[];
  onChange: (next: ContestProblemOption[]) => void;
}) {
  const [options, setOptions] = useState<ContestProblemOption[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    api<{ problems: ContestProblemOption[] }>("/admin/contests/problem-options")
      .then((r) => setOptions(r.problems))
      .catch(() => setOptions([]));
  }, []);

  const query = q.trim().toLowerCase();
  const results = (options ?? []).filter(
    (p) =>
      !problems.some((added) => added.slug === p.slug) &&
      (!query || [p.title, categoryName(p)].some((s) => s.toLowerCase().includes(query))),
  );

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-text">
        Problems <span className="font-normal text-muted">· at least 1</span>
      </p>
      {problems.length > 0 ? (
        <ul aria-label="Added problems" className="mb-3 flex flex-wrap gap-2">
          {problems.map((p) => (
            <li
              key={p.slug}
              className="flex min-w-0 max-w-full items-center gap-2 rounded border border-border bg-surface py-1 pl-3 pr-1 text-sm text-text"
            >
              <span className="truncate">{p.title}</span>
              <button
                type="button"
                aria-label={`Remove ${p.title}`}
                onClick={() => onChange(problems.filter((x) => x.slug !== p.slug))}
                className="shrink-0 rounded p-1 text-muted hover:text-failed"
              >
                <Icon name="x" className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-muted">No problems added yet.</p>
      )}

      <div role="search" className="relative">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search published problems..."
          aria-label="Search published problems"
          className={`${inputClass} pl-9`}
        />
      </div>

      {/* ponytail: all mock problems count as published; A2 returns only is_published = TRUE. */}
      {options === null ? (
        <p className="mt-3 text-sm text-muted">Loading problems…</p>
      ) : (
        <ul aria-label="Search results" className="mt-3 divide-y divide-border rounded border border-border">
          {results.length === 0 && <li className="px-4 py-3 text-sm text-muted">No published problem matches.</li>}
          {results.map((p) => (
            <li key={p.slug}>
              <button
                type="button"
                onClick={() => onChange([...problems, p])}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left text-sm hover:bg-surface"
              >
                <span className="min-w-0 flex-1 basis-48 break-words text-text">{p.title}</span>
                <DifficultyPill difficulty={p.difficulty} />
                <span className="w-36 text-xs text-muted">{categoryName(p)}</span>
                <span className="text-xs text-action">Add</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
