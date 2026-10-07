"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ErrorMessage, FieldLabel, inputClass, primaryButton, Spinner } from "@/components/admin/problems/shared";
import { AuthHeader } from "@/components/auth/AuthShell";
import { Icon } from "@/components/Icon";
import { mockRequestPasswordReset } from "@/lib/mock/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      await mockRequestPasswordReset(email.trim());
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div>
      <AuthHeader />

      <main className="mx-auto mt-16 w-full max-w-[468px] px-6 pb-8 sm:mt-40">
        <h1 className="text-3xl font-bold text-text">Reset your password</h1>
        {status === "sent" ? (
          <p role="status" className="mt-4 text-sm text-muted">
            If an account exists for <span className="break-all text-text">{email.trim()}</span>, we sent a reset link
            to it. Check your inbox.
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm text-muted">Enter your email and we will send you a reset link.</p>
            <form onSubmit={submit} className="mt-12">
              <FieldLabel htmlFor="email">Email address</FieldLabel>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setStatus("idle");
                }}
                className={`${inputClass} py-3`}
              />
              <button type="submit" disabled={status === "sending"} className={`${primaryButton} mt-10 w-full py-2.5`}>
                {status === "sending" && <Spinner />}
                Send reset link
              </button>
              {status === "error" && <ErrorMessage>Could not send the link. Try again.</ErrorMessage>}
            </form>
          </>
        )}
        <Link href="/login" className="mt-6 inline-flex items-center gap-1 text-sm text-action hover:underline">
          <Icon name="arrowLeft" className="h-3.5 w-3.5" />
          Back to sign in
        </Link>
      </main>
    </div>
  );
}
