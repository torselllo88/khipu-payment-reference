import { hmacHex, timingSafeEqual } from "@/lib/crypto";
import type { ProviderOutcomeStatus } from "@/lib/unlimit/client";
import type { WebhookRequestRecord } from "@/lib/store";

// No public reference for Unlimit's actual webhook JSON shape turned up
// (the v3 SDKs only document request/response bodies, not callbacks), so
// this schema is our own reasonable convention rather than a verified one.
// `payment_id` is Unlimit's own resource id — the canonical identifier, same
// as a real PSP webhook would lead with. `merchant_order_id` is the
// secondary correlation field (same id sent as `merchant_order.id` when the
// order was created — see app/api/checkout/route.ts): useful for the
// merchant, but not what identifies the resource at Unlimit's own layer.
export interface UnlimitWebhookEvent {
  event_id: string;
  payment_id: string;
  merchant_order_id: string;
  type: "PAYMENT_STATUS_CHANGED";
  status: ProviderOutcomeStatus;
  decline_reason?: string;
  failure_reason?: string;
  /** Only set when status is "exception" — why this payment conflicts with a terminal state the merchant already has. */
  exception_reason?: string;
  /** Only set when status is "exception" — what the merchant's policy should do about it (e.g. "refund"). */
  action_required?: string;
  payment_method: "khipu";
  created_at: string;
}

export const WEBHOOK_SIGNATURE_HEADER = "x-unlimit-signature";
// Demo-only, transport-level metadata — never part of the actual webhook
// payload. Lets an internal dispatch (checkout, late-confirmation) tell the
// receiving handler "continue the synthetic timeline from here" instead of
// the handler stamping real Date.now(), which would land far *earlier* than
// the artificially-advanced timestamps already logged for this burst (see
// lib/virtualClock.ts). A genuine external webhook call never sends this
// header, so the handler falls back to real time exactly as it should.
export const DEMO_TIMESTAMP_HINT_HEADER = "x-demo-event-timestamp";

function webhookSecret(): string {
  // Falls back to a fixed demo value so the flow works out of the box
  // without any env setup; override via UNLIMIT_WEBHOOK_SECRET for real use.
  return process.env.UNLIMIT_WEBHOOK_SECRET || "demo-webhook-secret";
}

export async function signWebhookBody(body: string): Promise<string> {
  return hmacHex(webhookSecret(), body);
}

export async function verifyWebhookSignature(
  body: string,
  signature: string | null
): Promise<boolean> {
  if (!signature) return false;
  const expected = await signWebhookBody(body);
  return timingSafeEqual(expected, signature);
}

/**
 * Signs and delivers a webhook event to our own receiver — real HTTP, same
 * as a genuine Unlimit delivery. `timestampHint` rides only on this specific
 * dispatch, never on the stored `record` — a later replay of that record
 * (see replay-webhook route) happens at a genuinely later real time and
 * should be timestamped as such, not inherit this dispatch's synthetic value.
 */
export async function dispatchWebhookRequest(
  origin: string,
  event: UnlimitWebhookEvent,
  timestampHint?: number
): Promise<{ record: WebhookRequestRecord; response: Response }> {
  const body = JSON.stringify(event);
  const signature = await signWebhookBody(body);
  const url = new URL("/api/webhooks/unlimit", origin).toString();
  const headers = { "content-type": "application/json", [WEBHOOK_SIGNATURE_HEADER]: signature };
  const record: WebhookRequestRecord = { url, method: "POST", headers, body };
  const dispatchHeaders =
    timestampHint !== undefined ? { ...headers, [DEMO_TIMESTAMP_HINT_HEADER]: String(timestampHint) } : headers;
  const response = await fetch(url, { method: "POST", headers: dispatchHeaders, body });
  return { record, response };
}
