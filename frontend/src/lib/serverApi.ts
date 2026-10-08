import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/session";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000"; // same default as next.config.ts

/** Server-component call to /api/v1 with the visitor's session cookie (the browser uses api() in lib/api.ts). */
export async function serverFetch(path: string): Promise<Response> {
  const session = (await cookies()).get(SESSION_COOKIE);
  return fetch(`${BACKEND_URL}/api/v1${path}`, {
    headers: session ? { Cookie: `${SESSION_COOKIE}=${session.value}` } : {},
    cache: "no-store",
  });
}
