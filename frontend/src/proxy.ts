import { NextResponse, type NextRequest } from "next/server";
import { loginHref, SESSION_COOKIE } from "@/lib/session";

// Pages that need an account. Dashboard, problems and problem details stay public
// (account-only parts are blurred there). Optimistic check only - the API enforces auth (F3).
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  return NextResponse.redirect(new URL(loginHref(pathname + search), request.url));
}

export const config = {
  matcher: ["/problems/:slug/solve", "/settings", "/onboarding", "/admin/:path*"],
};
