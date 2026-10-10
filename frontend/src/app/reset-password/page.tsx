"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ErrorMessage, FieldLabel, inputClass, primaryButton, Spinner } from "@/components/admin/problems/shared";
import { AuthHeader, authFieldClass } from "@/components/auth/AuthShell";
import { api, ApiError } from "@/lib/api";

const MIN_PASSWORD = 8; // D39, same as /signup

// X5: opened from the emailed link /reset-password?token=... The token is single use and expires after 1 hour.
export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("The passwords do not match.");
      setStatus("error");
      return;
    }
    setStatus("sending");
    try {
      const token = new URLSearchParams(window.location.search).get("token") ?? "";
      await api("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
      setStatus("done");
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "INVALID_TOKEN"
          ? "This link has expired or was already used. Request a new one."
          : "Could not set the password. Try again.",
      );
      setStatus("error");
    }
  }

  return (
    <div>
      <AuthHeader />

      <main className="mx-auto mt-16 w-full max-w-[468px] px-6 pb-8 sm:mt-40">
        <h1 className="text-3xl font-bold text-text">Set a new password</h1>
        {status === "done" ? (
          <>
            <p className="mt-4 text-sm text-muted">Your password is changed. Sign in with the new one.</p>
            <Link href="/login" className={`${primaryButton} mt-8 w-full py-2.5`}>
              Sign in
            </Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <div className="mt-8">
              <FieldLabel htmlFor="password">New password</FieldLabel>
              <input
                id="password"
                type="password"
                required
                minLength={MIN_PASSWORD}
                autoComplete="new-password"
                aria-describedby="password-hint"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} ${authFieldClass}`}
              />
              <p id="password-hint" className="mt-1.5 text-xs text-muted">
                At least {MIN_PASSWORD} characters
              </p>
            </div>
            <div className="mt-5">
              <FieldLabel htmlFor="confirm">Repeat the new password</FieldLabel>
              <input
                id="confirm"
                type="password"
                required
                minLength={MIN_PASSWORD}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={`${inputClass} ${authFieldClass}`}
              />
            </div>
            <button type="submit" disabled={status === "sending"} className={`${primaryButton} mt-8 w-full py-2.5`}>
              {status === "sending" && <Spinner />}
              Set password
            </button>
            {status === "error" && (
              <ErrorMessage>
                {error}{" "}
                {error.startsWith("This link") && (
                  <Link href="/forgot-password" className="underline">
                    Request a new link
                  </Link>
                )}
              </ErrorMessage>
            )}
          </form>
        )}
      </main>
    </div>
  );
}
