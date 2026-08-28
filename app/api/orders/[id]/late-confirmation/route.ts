import { NextRequest, NextResponse } from "next/server";
import { dispatchWebhookRequest, type UnlimitWebhookEvent } from "@/lib/unlimit/webhook";
import { appendEvent, getOrder, setLastWebhookRequest, toPublicOrder } from "@/lib/store";
import { createVirtualClock, continueFrom } from "@/lib/virtualClock";

// A2A-specific edge case: Khipu confirms a transfer that genuinely completed
// on time, but the confirmation itself is processed after the payment
// window Unlimit already closed as expired — interbank confirmation latency
// is asynchronous and outside Unlimit/Khipu's control, unlike a synchronous
// card auth. Because we already know here that the order is `expired`, we
// (playing Unlimit) proactively flag this as `status: "exception"` rather
// than sending a bare "success" — the merchant should never have to infer a
// terminal-state conflict from a naively "successful" webhook.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = getOrder(id);
  if (!order) return NextResponse.json({ error: `Unknown order ${id}` }, { status: 404 });
  if (order.status !== "expired") {
    return NextResponse.json({ error: "Order is not in an expired state" }, { status: 409 });
  }

  // Continue from wherever the order's timeline last left off (checkout's
  // own virtual clock may have already run well ahead of real time) rather
  // than starting fresh at Date.now() — otherwise, if this is clicked soon
  // after checkout in real time, phase two's timestamps would land *before*
  // phase one's, which reads as time running backward.
  const clock = createVirtualClock(continueFrom(order.updatedAt, 0));

  appendEvent(id, {
    type: "late_payment_confirmation_detected",
    actor: "khipu",
    messageKey: "latePaymentConfirmationDetected",
    timestamp: clock.tick(0),
  });

  const event: UnlimitWebhookEvent = {
    event_id: crypto.randomUUID(),
    payment_id: order.unlimitPaymentId,
    merchant_order_id: id,
    type: "PAYMENT_STATUS_CHANGED",
    status: "exception",
    exception_reason: "late_payment_after_expiry",
    action_required: "refund",
    payment_method: "khipu",
    created_at: new Date().toISOString(),
  };

  appendEvent(id, {
    type: "webhook_sent",
    actor: "unlimit",
    messageKey: "webhookSent",
    payload: event,
    timestamp: clock.tick(2000),
  });

  const { record } = await dispatchWebhookRequest(new URL(req.url).origin, event, clock.tick(1000));
  setLastWebhookRequest(id, record);

  return NextResponse.json({ order: toPublicOrder(getOrder(id)!) });
}
