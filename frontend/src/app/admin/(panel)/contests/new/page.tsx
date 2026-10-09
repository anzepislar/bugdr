"use client";

import Link from "next/link";
import { useState } from "react";
import { ContestWizard } from "@/components/admin/contests/ContestWizard";
import { Icon } from "@/components/Icon";

export default function NewContestPage() {
  const [resetKey, setResetKey] = useState(0);
  return (
    <div className="w-full px-6 py-8 wide:mx-auto wide:max-w-[1200px]">
      <Link href="/admin/contests" className="inline-flex items-center gap-1.5 text-sm text-action hover:underline">
        <Icon name="arrowLeft" className="h-3.5 w-3.5" /> Contest management
      </Link>
      <h1 className="mt-3 text-3xl font-semibold text-text">Create a contest</h1>
      <ContestWizard key={resetKey} onReset={() => setResetKey((k) => k + 1)} />
    </div>
  );
}
