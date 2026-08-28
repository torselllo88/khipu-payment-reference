import type { NextRequest } from "next/server";

/**
 * The webhook dispatch is a self-call: our own backend delivering a
 * simulated webhook to our own receiver. Deriving that URL from the
 * request's public origin (`new URL(req.url).origin`) works fine locally,
 * where that origin already resolves to localhost — but on a platform like
 * Railway the request arrives via the public edge/proxy, so the "origin"
 * is the public HTTPS hostname. Routing a self-call back out through that
 * public hostname is a well-known failure mode (DNS, proxy loop handling,
 * or platform request timeouts) and is exactly what produced an unhandled
 * 500 with an empty body in production.
 *
 * PORT is set by essentially every container platform (Railway, Render,
 * Fly, Heroku) to the port the app must actually listen on, and Next's
 * `next start` binds to it automatically — so hitting 127.0.0.1 on that
 * port reaches this same process directly, bypassing the public network
 * entirely. Plain local dev (no PORT env set) falls back to the request's
 * own origin, which already points at localhost.
 */
export function internalOrigin(req: NextRequest): string {
  if (process.env.PORT) return `http://127.0.0.1:${process.env.PORT}`;
  return new URL(req.url).origin;
}
