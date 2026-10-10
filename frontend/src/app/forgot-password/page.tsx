import Link from "next/link";
import { AuthHeader } from "@/components/auth/AuthShell";
import { Icon } from "@/components/Icon";

// Password reset needs email sending, which is deferred (X5) - no fake "link sent" until it exists.
export default function ForgotPasswordPage() {
  return (
    <div>
      <AuthHeader />

      <main className="mx-auto mt-16 w-full max-w-[468px] px-6 pb-8 sm:mt-40">
        <h1 className="text-3xl font-bold text-text">Reset your password</h1>
        <p className="mt-4 text-sm text-muted">
          Password reset by email is not available yet.
        </p>
        <Link href="/login" className="mt-6 inline-flex items-center gap-1 text-sm text-action hover:underline">
          <Icon name="arrowLeft" className="h-3.5 w-3.5" />
          Back to sign in
        </Link>
      </main>
    </div>
  );
}
