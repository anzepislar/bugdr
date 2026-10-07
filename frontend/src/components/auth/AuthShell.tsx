"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ErrorMessage, secondaryButton } from "@/components/admin/problems/shared";

export const authFieldClass = "py-3";

// Logo on the left, optional "Already a member? [Sign in]" (or `children`) on the right.
export function AuthHeader({
  prompt,
  href,
  label,
  children,
}: {
  prompt?: string;
  href?: string;
  label?: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-4 px-6 py-5 sm:px-12">
      <Link href="/" className="shrink-0">
        <Image src="/logo/bugdr-logo.png" alt="Bugdr" width={447} height={126} priority className="h-10 w-auto sm:h-12" />
      </Link>
      {href && (
        <div className="flex items-center gap-6">
          <span className="hidden text-sm text-muted sm:inline">{prompt}</span>
          <Link href={href} className={secondaryButton}>
            {label}
          </Link>
        </div>
      )}
      {children}
    </header>
  );
}

// "Continue with GitHub" + "or" divider. GitHub sign-in is not planned yet (D37).
export function GitHubSignIn() {
  const [clicked, setClicked] = useState(false);
  return (
    <div className="mt-8">
      <button type="button" onClick={() => setClicked(true)} className={`${secondaryButton} w-full py-2.5`}>
        Continue with GitHub
      </button>
      {clicked && <ErrorMessage>GitHub sign-in is not available yet. Use your email instead.</ErrorMessage>}
      <div className="my-6 flex items-center gap-4 text-sm text-muted">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
