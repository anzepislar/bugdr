"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ErrorMessage, FieldLabel, inputClass, primaryButton, Spinner } from "@/components/admin/problems/shared";
import { AuthHeader, authFieldClass } from "@/components/auth/AuthShell";
import { api, ApiError } from "@/lib/api";
import { safeNext } from "@/lib/session";

// Admin login (D48): not a user account, credentials live in backend/.env.
export default function AdminLoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      await api("/admin/login", { method: "POST", body: JSON.stringify({ ...form, email: form.email.trim() }) });
      router.push(safeNext(new URLSearchParams(window.location.search).get("next"), "/admin"));
      router.refresh();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      setError(
        code === "INVALID_CREDENTIALS"
          ? "Incorrect email or password."
          : code === "TOO_MANY_ATTEMPTS"
            ? "Too many failed attempts. Try again in 15 minutes."
            : code === "ADMIN_DISABLED"
              ? "Admin login is not set up on this server."
              : "Could not sign in. Try again.",
      );
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <AuthHeader />

      <main className="mx-auto mt-16 w-full max-w-[468px] px-6 pb-8 sm:mt-32">
        <h1 className="text-3xl font-bold text-text">Admin sign in</h1>
        <p className="mt-3 text-muted">For the Bugdr team. Engineers sign in on the main login page.</p>

        <form onSubmit={submit} className="mt-8">
          <FieldLabel htmlFor="email">Email address</FieldLabel>
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
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
          <button type="submit" disabled={status === "sending"} className={`${primaryButton} mt-8 w-full py-2.5`}>
            {status === "sending" && <Spinner />}
            Sign in
          </button>
          {status === "error" && <ErrorMessage>{error}</ErrorMessage>}
        </form>
      </main>

      <footer className="mt-auto px-6 py-6 text-xs text-muted sm:px-12">© 2026 Bugdr</footer>
    </div>
  );
}
