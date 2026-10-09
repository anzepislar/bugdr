// httpOnly JWT cookie set by the backend (/auth/login, /auth/signup). Pages only check that it exists;
// the API verifies it.
export const SESSION_COOKIE = "bugdr_session";
// Admin session (D48), separate from the user one; set by /admin/login, 8 hours.
export const ADMIN_COOKIE = "bugdr_admin";

/** /login that returns to `path` afterwards. */
export const loginHref = (path: string) => `/login?next=${encodeURIComponent(path)}`;

/** Only same-site paths, so ?next= can't send the user to another site. */
export function safeNext(next: string | null, fallback = "/dashboard"): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}
