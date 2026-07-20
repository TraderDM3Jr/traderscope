import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Simple single-user password gate.
// The session cookie holds SHA-256(password + PEPPER). Middleware (Edge runtime)
// recomputes the same hash with Web Crypto and compares — no external store needed.
const PEPPER = process.env.APP_PEPPER ?? "traderscope-static-pepper";

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(password + PEPPER);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublicApi =
    pathname === "/api/login" ||
    pathname === "/api/logout" ||
    pathname === "/api/health";

  // Paths that never require login
  if (
    pathname === "/login" ||
    isPublicApi ||
    pathname.startsWith("/api/ingest") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/downloads") ||
    pathname === "/favicon.ico"
  ) {
    // Already logged in and hitting /login? Send to dashboard.
    if (pathname === "/login" && process.env.APP_PASSWORD) {
      const cookie = req.cookies.get("ts_session")?.value;
      const expected = await sessionToken(process.env.APP_PASSWORD);
      if (cookie === expected) {
        const url = req.nextUrl.clone();
        url.pathname = "/";
        return NextResponse.redirect(url);
      }
    }
    return NextResponse.next();
  }

  // Everything else requires a valid session
  const cookie = req.cookies.get("ts_session")?.value;
  const expected = await sessionToken(process.env.APP_PASSWORD ?? "");
  if (!process.env.APP_PASSWORD || cookie !== expected) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
