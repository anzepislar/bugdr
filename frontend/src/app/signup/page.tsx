"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ErrorMessage, FieldLabel, inputClass, primaryButton, Spinner } from "@/components/admin/problems/shared";
import { AuthHeader, authFieldClass, GitHubSignIn } from "@/components/auth/AuthShell";
import { api, ApiError } from "@/lib/api";

const MIN_PASSWORD = 8; // D39

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState("");
  const patch = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const body = { ...form, username: form.username.trim(), email: form.email.trim() };
      await api("/auth/signup", { method: "POST", body: JSON.stringify(body) });
      router.push("/onboarding");
      router.refresh();
    } catch (err) {
      // 409 (email/username taken) and 400 (field details) carry a message for the user.
      const details = err instanceof ApiError && err.details ? Object.values(err.details as Record<string, string>) : [];
      setError(
        details.length ? details.join(". ") : err instanceof ApiError && err.status === 409 ? err.message : "Could not create the account. Try again.",
      );
      setStatus("error");
    }
  }

  return (
    <div>
      <AuthHeader prompt="Already a member?" href="/login" label="Sign in" />

      <main className="mx-auto mt-12 w-full max-w-[468px] px-6 pb-8 sm:mt-24">
        <h1 className="text-3xl font-bold text-text">Create your account</h1>
        <p className="mt-3 text-muted">Build your skills on real production problems.</p>
        <GitHubSignIn />

        <form onSubmit={submit}>
          <FieldLabel htmlFor="username">Username</FieldLabel>
          <input
            id="username"
            required
            minLength={3}
            maxLength={50}
            pattern="[A-Za-z0-9_\-]+"
            title="Letters, numbers, - and _"
            autoComplete="username"
            placeholder="max_dev"
            aria-describedby="username-hint"
            value={form.username}
            onChange={(e) => patch({ username: e.target.value })}
            className={`${inputClass} ${authFieldClass}`}
          />
          <p id="username-hint" className="mt-1.5 text-xs text-muted">
            Your profile address: bugdr.app/profile/{form.username.trim() || "username"}
          </p>
          <div className="mt-5">
            <FieldLabel htmlFor="email">Email address</FieldLabel>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => patch({ email: e.target.value })}
              className={`${inputClass} ${authFieldClass}`}
            />
          </div>
          <div className="mt-5">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <input
              id="password"
              type="password"
              required
              minLength={MIN_PASSWORD}
              autoComplete="new-password"
              placeholder="Create a password"
              aria-describedby="password-hint"
              value={form.password}
              onChange={(e) => patch({ password: e.target.value })}
              className={`${inputClass} ${authFieldClass}`}
            />
            <p id="password-hint" className="mt-1.5 text-xs text-muted">
              At least {MIN_PASSWORD} characters
            </p>
          </div>
          <label className="mt-8 flex items-center gap-2 text-sm text-text">
            <input type="checkbox" required className="h-4 w-4 shrink-0 accent-action" />
            I agree to the Terms and Privacy Policy.
          </label>
          <button type="submit" disabled={status === "sending"} className={`${primaryButton} mt-8 w-full py-2.5`}>
            {status === "sending" && <Spinner />}
            Create account
          </button>
          {status === "error" && <ErrorMessage>{error}</ErrorMessage>}
        </form>
        <p className="mt-6 text-xs text-muted">Next: personalize your engineering path.</p>
      </main>
    </div>
  );
}
