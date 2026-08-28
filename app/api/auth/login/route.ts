import { NextRequest, NextResponse } from "next/server";
import { hmacHex, timingSafeEqual } from "@/lib/crypto";

const AUTH_COOKIE = "demo_auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  const expectedPassword = process.env.DEMO_PASSWORD || "";

  if (!expectedPassword || !timingSafeEqual(password, expectedPassword)) {
    return NextResponse.json({ error: "invalid_password" }, { status: 401 });
  }

  const secret = process.env.AUTH_SECRET || "insecure-default-change-me";
  const token = await hmacHex(secret, "authed");

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
