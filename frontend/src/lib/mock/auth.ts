// Mock of the /auth endpoints still without a backend: forgot password has no slice yet - sending
// email is deferred (X5). See md_files/06_backend_slices.md, "Register mockov".
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Resolves for every address so the page never reveals which emails have an account.
export async function mockRequestPasswordReset(email: string): Promise<void> {
  void email;
  await delay(400);
}
