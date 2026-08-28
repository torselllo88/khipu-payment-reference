import { NextRequest, NextResponse } from "next/server";
import { hmacHex, timingSafeEqual } from "@/lib/crypto";

const AUTH_COOKIE = "demo_auth";

function authSecret(): string {
  return process.env.AUTH_SECRET || "insecure-default-change-me";
}

export async function middleware(req: NextRequest) {
  if (process.env.DEMO_ACCESS_MODE !== "password") {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  const expected = await hmacHex(authSecret(), "authed");

  if (cookie && timingSafeEqual(cookie, expected)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("from", req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

// Webhook endpoints are intentionally excluded: they authenticate via HMAC
// signature (see lib/unlimit/webhook.ts), not the demo password cookie —
// exactly like a real Unlimit webhook would never carry our session cookie.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/auth/login|api/webhooks).*)"],
};
