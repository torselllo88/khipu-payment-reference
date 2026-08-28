import { NextRequest, NextResponse } from "next/server";
import { appendEvent, getOrder, toPublicOrder } from "@/lib/store";
import { continueFrom } from "@/lib/virtualClock";
import { DEMO_TIMESTAMP_HINT_HEADER } from "@/lib/unlimit/webhook";

// Re-fires the *exact same* HTTP request Unlimit sent the first time
// (same event_id, same signature) at our own webhook endpoint, so the
// idempotency guarantee is proven over real HTTP, not faked in the UI.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = getOrder(id);
  if (!order) return NextResponse.json({ error: `Unknown order ${id}` }, { status: 404 });
  if (!order.lastWebhookRequest) {
    return NextResponse.json({ error: "No webhook has been delivered for this order yet" }, { status: 409 });
  }

  const { url, method, headers, body } = order.lastWebhookRequest;
  const timestamp = continueFrom(order.updatedAt);

  appendEvent(id, {
    type: "webhook_redelivered",
    actor: "unlimit",
    messageKey: "webhookRedelivered",
    payload: JSON.parse(body),
    timestamp,
  });

  // Same continuity hint as a first-time dispatch (see webhook.ts) — this
  // click is a genuinely later real action, but the order's own timeline
  // may already be synthetically ahead of real time.
  const response = await fetch(url, {
    method,
    headers: { ...headers, [DEMO_TIMESTAMP_HINT_HEADER]: String(continueFrom(timestamp)) },
    body,
  });
  const result = await response.json();

  return NextResponse.json({ replay: result, order: toPublicOrder(getOrder(id)!) });
}
