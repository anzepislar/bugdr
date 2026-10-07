"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ErrorMessage, FieldLabel, inputClass, primaryButton, Spinner } from "@/components/admin/problems/shared";
import { AuthHeader, authFieldClass, GitHubSignIn } from "@/components/auth/AuthShell";
import { api, ApiError } from "@/lib/api";
import { safeNext } from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "", remember: false });
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const { user } = await api<{ user: { onboardingCompleted: boolean } }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ ...form, email: form.email.trim() }),
      });
      // Until onboarding is done, every login continues there (F4).
      router.push(user.onboardingCompleted ? safeNext(new URLSearchParams(window.location.search).get("next")) : "/onboarding");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Incorrect email or password."
          : err instanceof ApiError && err.code === "BANNED"
            ? "This account has been suspended."
            : "Could not sign in. Try again.",
      );
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <AuthHeader prompt="New to Bugdr?" href="/signup" label="Sign up" />

      <main className="mx-auto mt-16 w-full max-w-[468px] px-6 pb-8 sm:mt-32">
        <h1 className="text-3xl font-bold text-text">Welcome back</h1>
        <p className="mt-3 text-muted">Your next production challenge is waiting.</p>
        <GitHubSignIn />

        <form onSubmit={submit}>
          <FieldLabel htmlFor="email">Email address</FieldLabel>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={`${inputClass} ${authFieldClass}`}
          />
          <div className="mt-5">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className={`${inputClass} ${authFieldClass}`}
            />
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
            <label className="flex items-center gap-2 text-text">
              <input
                type="checkbox"
                checked={form.remember}
                onChange={(e) => setForm({ ...form, remember: e.target.checked })}
                className="h-4 w-4 accent-action"
              />
              Remember me
            </label>
            <Link href="/forgot-password" className="text-action hover:underline">
              Forgot password?
            </Link>
          </div>
          <button type="submit" disabled={status === "sending"} className={`${primaryButton} mt-8 w-full py-2.5`}>
            {status === "sending" && <Spinner />}
            Sign in
          </button>
          {status === "error" && <ErrorMessage>{error}</ErrorMessage>}
        </form>
        <p className="mt-8 text-xs text-muted">By continuing, you agree to the Terms and Privacy Policy.</p>
      </main>

      <footer className="mt-auto px-6 py-6 text-xs text-muted sm:px-12">© 2026 Bugdr</footer>
    </div>
  );
}
