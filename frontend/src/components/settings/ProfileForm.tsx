"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ErrorMessage, FieldLabel, inputClass, primaryButton, Spinner } from "@/components/admin/problems/shared";
import { Icon } from "@/components/Icon";
import { mockSaveSettings } from "@/lib/mock/profile";
import { EXPERIENCE_LABEL, EXPERIENCE_LEVELS, type ExperienceLevel } from "@/lib/types/dashboard";
import { CATEGORIES, type CategorySlug } from "@/lib/types/problem";
import { LANGUAGES, type ProfileSettings } from "@/lib/types/profile";

const fieldClass = `${inputClass} py-2.5`;

export function ProfileForm({ initial, profileHref }: { initial: ProfileSettings; profileHref: string }) {
  const [form, setForm] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const patch = (p: Partial<ProfileSettings>) => {
    setForm((f) => ({ ...f, ...p }));
    setStatus("idle");
  };

  function toggleLanguage(lang: string) {
    patch({
      languages: form.languages.includes(lang) ? form.languages.filter((l) => l !== lang) : [...form.languages, lang],
    });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setStatus("saving");
    try {
      await mockSaveSettings({ ...form, displayName: form.displayName.trim(), headline: form.headline.trim() });
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={save} className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 lg:max-w-xl">
        <section aria-labelledby="details-heading">
          <h2 id="details-heading" className="text-xl font-semibold text-text">
            Profile details
          </h2>
          <div className="mt-6 flex flex-col gap-6">
            <div>
              <FieldLabel htmlFor="displayName">Display name</FieldLabel>
              <input
                id="displayName"
                required
                maxLength={50}
                value={form.displayName}
                onChange={(e) => patch({ displayName: e.target.value })}
                className={fieldClass}
              />
            </div>
            <div>
              <FieldLabel htmlFor="headline">Profile headline</FieldLabel>
              <input
                id="headline"
                maxLength={80}
                placeholder="e.g. Backend engineer"
                value={form.headline}
                onChange={(e) => patch({ headline: e.target.value })}
                className={fieldClass}
              />
            </div>
            <div>
              <FieldLabel htmlFor="github">GitHub username</FieldLabel>
              <input
                id="github"
                maxLength={39}
                // GitHub's rule: letters, digits and single hyphens, not at the start.
                pattern="[A-Za-z0-9](?:-?[A-Za-z0-9])*"
                title="Letters, numbers and single hyphens, not at the start or end."
                autoComplete="off"
                value={form.githubUsername}
                onChange={(e) => patch({ githubUsername: e.target.value })}
                className={fieldClass}
              />
            </div>
          </div>
        </section>

        <section aria-labelledby="path-heading" className="mt-8">
          <h2 id="path-heading" className="text-xl font-semibold text-text">
            Your engineering path
          </h2>
          <div className="mt-6 flex flex-col gap-6">
            <div>
              <FieldLabel htmlFor="goalRole">Role</FieldLabel>
              <select
                id="goalRole"
                value={form.goalRole}
                onChange={(e) => patch({ goalRole: e.target.value as CategorySlug })}
                className={fieldClass}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="experience">Production experience</FieldLabel>
              <select
                id="experience"
                value={form.experienceLevel}
                onChange={(e) => patch({ experienceLevel: e.target.value as ExperienceLevel })}
                className={fieldClass}
              >
                {EXPERIENCE_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {EXPERIENCE_LABEL[l]}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-muted">Sets the starting difficulty of your recommendations.</p>
            </div>
            <fieldset>
              <legend className="mb-2.5 text-sm font-medium text-text">Languages</legend>
              <div className="flex flex-wrap gap-3">
                {LANGUAGES.map((lang) => {
                  const on = form.languages.includes(lang);
                  return (
                    <button
                      key={lang}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleLanguage(lang)}
                      className={`rounded border px-3 py-1.5 text-xs font-semibold ${
                        on
                          ? "border-action/30 bg-action/15 text-action"
                          : "border-border text-muted hover:border-action hover:text-text"
                      }`}
                    >
                      {lang}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>
        </section>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={status === "saving"}
            className={`${primaryButton} w-full px-6 py-2.5 sm:w-fit sm:min-w-44`}
          >
            {status === "saving" ? <Spinner /> : null} Save changes
          </button>
          <p role="status" className="flex items-center gap-1.5 text-sm text-action">
            {status === "saved" ? (
              <>
                <Icon name="check" className="h-4 w-4" /> Changes saved
              </>
            ) : null}
          </p>
        </div>
        {status === "error" ? <ErrorMessage>Your changes could not be saved. Try again.</ErrorMessage> : null}
      </div>

      <aside className="w-full shrink-0 rounded border border-border bg-surface p-6 lg:ml-auto lg:w-80 xl:w-96">
        <h2 className="text-lg font-semibold text-text">Public profile</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Show your completed problems and activity on your shareable profile.
        </p>
        <label className="mt-6 flex cursor-pointer items-center gap-3 text-sm text-text">
          <input
            type="checkbox"
            role="switch"
            checked={form.isPublic}
            onChange={(e) => patch({ isPublic: e.target.checked })}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className="relative h-5 w-9 shrink-0 rounded-full bg-border transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-text after:transition-transform peer-checked:bg-action peer-checked:after:translate-x-4 peer-checked:after:bg-canvas peer-focus-visible:ring-2 peer-focus-visible:ring-action peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface"
          />
          Public profile {form.isPublic ? "enabled" : "disabled"}
        </label>
        <Link href={profileHref} className="mt-5 inline-flex items-center gap-1.5 text-sm text-action hover:underline">
          View public profile <Icon name="arrowRight" className="h-4 w-4" />
        </Link>
      </aside>
    </form>
  );
}
