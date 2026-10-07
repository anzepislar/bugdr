import { NextResponse, type NextRequest } from "next/server";
import { loginHref, SESSION_COOKIE } from "@/lib/session";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000"; // same default as next.config.ts

// Pages that need an account. Dashboard, problems and problem details stay public
// (account-only parts are blurred there); contests and profiles need login (D47).
// The session is checked with the backend, so an expired, foreign or banned session is sent to login
// and its cookie cleared. This guards pages only - the API enforces auth on every request (F3).
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const toLogin = () => {
    const res = NextResponse.redirect(new URL(loginHref(pathname + search), request.url));
    res.cookies.delete(SESSION_COOKIE);
    return res;
  };

  const cookie = request.cookies.get(SESSION_COOKIE);
  if (!cookie) return toLogin();

  let user: { isAdmin: boolean; onboardingCompleted: boolean } | undefined;
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/auth/me`, {
      headers: { Cookie: `${SESSION_COOKIE}=${cookie.value}` },
      cache: "no-store",
    });
    if (res.ok) user = (await res.json()).user;
  } catch {
    // Backend unreachable: fail closed.
  }
  if (!user) return toLogin();
  // Account pages wait until onboarding is done (F4); /onboarding itself stays reachable to change answers.
  if (!user.onboardingCompleted && pathname !== "/onboarding")
    return NextResponse.redirect(new URL("/onboarding", request.url));
  if (pathname.startsWith("/admin") && !user.isAdmin) return NextResponse.redirect(new URL("/dashboard", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/problems/:slug/solve",
    "/settings",
    "/onboarding",
    "/admin/:path*",
    "/contests/:path*",
    "/profile/:path*",
  ],
};
