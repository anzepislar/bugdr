"use client";

import { useEffect, useState, type FormEvent } from "react";
import { GlassButton, Input, ModalShell } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AVATARS = [
  { letter: "A", color: "bg-[#3b5bdb]" },
  { letter: "J", color: "bg-[#2f9e44]" },
  { letter: "M", color: "bg-[#c2255c]" },
  { letter: "K", color: "bg-[#e67700]" },
];

export default function WaitlistModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [state, setState] = useState<"form" | "loading" | "success">("form");
  const [email, setEmail] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  // Real signups only; the social proof line stays hidden until someone has joined.
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    api<{ count: number }>("/waitlist").then(
      (r) => setCount(r.count),
      () => {},
    );
  }, [isOpen]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!EMAIL.test(email.trim())) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }
    setErrorMsg("");
    setState("loading");
    try {
      await api("/waitlist", { method: "POST", body: JSON.stringify({ email: email.trim() }) });
      setState("success");
    } catch (err) {
      setState("form");
      setErrorMsg(err instanceof ApiError && err.status < 500 ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} maxWidth="max-w-[420px]" accent>
      <div className="p-8 pb-9">
        {state === "success" ? (
          <div className="animate-fade-up flex flex-col items-center py-2 text-center">
            <div className="mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-full border border-passed/25 bg-passed/[0.08] text-[22px] text-passed shadow-[0_0_24px_rgba(34,197,94,0.15)]">
              ✓
            </div>
            <h3 className="mb-1.5 font-display text-[1.3rem] font-extrabold tracking-[-0.02em] text-text">
              You&apos;re on the list.
            </h3>
            <p className="mb-5 text-[0.85rem] leading-[1.6] text-muted">
              We&apos;ll email <span className="break-all text-action not-italic">{email.trim()}</span> when access
              opens.
              <br />
              Don&apos;t let your title speak for you.
            </p>
            <GlassButton variant="ghost" onClick={onClose}>
              Got it
            </GlassButton>
          </div>
        ) : (
          <>
            <div className="mb-2.5 inline-flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.13em] text-action">
              <span className="animate-pulse-dot h-[5px] w-[5px] rounded-full bg-passed shadow-[0_0_6px_var(--color-passed)]" />
              Early Access
            </div>
            <h2 className="mb-3 text-balance font-display text-[1.75rem] font-extrabold leading-[1.25] tracking-[-0.02em] text-text">
              Get in before the crash.
            </h2>
            <p className="mb-7 text-[0.925rem] leading-[1.75] text-muted">
              Join developers already on the list. We&apos;ll email you when your debugging environment is ready.
            </p>

            <form onSubmit={submit} noValidate className="flex flex-col gap-3">
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errorMsg}
                disabled={state === "loading"}
                icon={
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <rect x="1" y="2.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M1 4.5l6 4 6-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                }
              />
              <GlassButton variant="action" fullWidth size="lg" type="submit" loading={state === "loading"} className="group gap-2">
                {state === "loading" ? (
                  "Joining…"
                ) : (
                  <>
                    Get early access
                    <span aria-hidden="true" className="transition-transform group-hover:translate-x-[3px]">
                      →
                    </span>
                  </>
                )}
              </GlassButton>
            </form>

            {count > 0 && (
              <>
                <div className="my-6 h-px bg-white/[0.06]" />
                <div className="flex items-center gap-2.5">
                  <div className="flex" aria-hidden="true">
                    {AVATARS.map((a, i) => (
                      <div
                        key={a.letter}
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-surface text-[11px] font-semibold text-text ${a.color} ${
                          i < AVATARS.length - 1 ? "-mr-[7px]" : ""
                        }`}
                      >
                        {a.letter}
                      </div>
                    ))}
                  </div>
                  <p className="pl-[7px] text-[0.76rem] leading-[1.4] text-muted">
                    <strong className="font-semibold text-text">
                      {count.toLocaleString("en-US")} {count === 1 ? "developer" : "developers"}
                    </strong>{" "}
                    already on the list.
                    <br />
                    Spots are limited for the first cohort.
                  </p>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </ModalShell>
  );
}
