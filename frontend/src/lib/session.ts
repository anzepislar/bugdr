// ponytail: mock session = a plain cookie set by the mock login/signup. Slice F2 replaces it with
// the httpOnly JWT cookie under the same name, so the proxy and the layout keep working.
export const SESSION_COOKIE = "bugdr_session";

/** /login that returns to `path` afterwards. */
export const loginHref = (path: string) => `/login?next=${encodeURIComponent(path)}`;

/** Only same-site paths, so ?next= can't send the user to another site. */
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}
