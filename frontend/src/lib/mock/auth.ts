// Mock of the /auth endpoints. Login/signup are replaced by slice F2; forgot password has no slice
// yet - sending email is deferred (X5). See md_files/06_backend_slices.md, "Register mockov".
import { SESSION_COOKIE } from "@/lib/session";
import type { OnboardingAnswers } from "@/lib/types/dashboard";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Resolves for every address so the page never reveals which emails have an account.
export async function mockRequestPasswordReset(email: string): Promise<void> {
  void email;
  await delay(400);
}

// F2 sets this cookie on the server (httpOnly JWT). "Remember me" = 30 days, otherwise a browser-session cookie (D40).
function startSession(remember: boolean) {
  document.cookie = `${SESSION_COOKIE}=mock; path=/; SameSite=Lax${remember ? `; max-age=${30 * 86400}` : ""}`;
}

// Mock of POST /auth/login and POST /auth/signup (slice F2). Always succeed.
export async function mockLogin(credentials: { email: string; password: string; remember: boolean }): Promise<void> {
  await delay(400);
  startSession(credentials.remember);
}

export async function mockSignup(account: { fullName: string; email: string; password: string }): Promise<void> {
  void account;
  await delay(400);
  startSession(false);
}

// Mock of POST /auth/logout (F2).
export function mockLogout() {
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
}

// Mock of PUT /me/onboarding (slice F4). Languages are not in the F4 payload yet (D34).
export async function mockSaveOnboarding(answers: OnboardingAnswers): Promise<void> {
  void answers;
  await delay(400);
}
