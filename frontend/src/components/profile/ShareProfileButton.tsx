"use client";

import { useState } from "react";
import { primaryButton } from "@/components/admin/problems/shared";

export function ShareProfileButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    await navigator.clipboard.writeText(new URL(path, window.location.origin).href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" onClick={share} className={`${primaryButton} px-6 py-2.5`}>
      <span aria-live="polite">{copied ? "Link copied" : "Share profile"}</span>
    </button>
  );
}
