import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Explicitly allow Bunny webhook and cron routes through without any
 * session / CSRF / login redirects. Auth for those routes is handled
 * inside the route handlers (HMAC / CRON_SECRET).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === "/api/bunny/webhook" ||
    pathname.startsWith("/api/cron/")
  ) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/bunny/webhook", "/api/cron/:path*"],
};
