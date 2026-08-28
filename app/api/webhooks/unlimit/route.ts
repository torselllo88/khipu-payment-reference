import { NextRequest, NextResponse } from "next/server";
import {
  verifyWebhookSignature,
  WEBHOOK_SIGNATURE_HEADER,
  DEMO_TIMESTAMP_HINT_HEADER,
  type UnlimitWebhookEvent,
} from "@/lib/unlimit/webhook";
import { appendEvent, getOrder, markWebhookProcessed, setStatus, toPublicOrder } from "@/lib/store";
import { resolveNextOrderStatus } from "@/lib/orderStatus";

// This is the one endpoint a real Unlimit integration would actually expose
// to the internet. Everything else in this demo (checkout, replay, reconcile,
// late-confirmation) is the merchant side driving *this* handler, exactly
// like production would.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get(WEBHOOK_SIGNATURE_HEADER);

  if (!(await verifyWebhookSignature(raw, signature))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: UnlimitWebhookEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const order = getOrder(event.merchant_order_id);
  if (!order) {
    return NextResponse.json({ error: `Unknown order ${event.merchant_order_id}` }, { status: 404 });
  }

  // Demo-only: continues the sending route's synthetic timeline instead of
  // stamping real Date.now(), which would land far earlier than the
  // artificially-advanced timestamps already logged for this burst. Absent
  // for a genuine external call (or a replayed request — see webhook.ts).
  const timestampHint = req.headers.get(DEMO_TIMESTAMP_HINT_HEADER);
  const timestamp = timestampHint ? Number(timestampHint) : undefined;

  const isFirstDelivery = markWebhookProcessed(order.id, event.event_id);

  if (!isFirstDelivery) {
    appendEvent(order.id, {
      type: "webhook_duplicate_ignored",
      actor: "merchant",
      messageKey: "webhookDuplicateIgnored",
      params: { eventId: event.event_id },
      payload: event,
      timestamp,
    });
    return NextResponse.json({ idempotent: true, order: toPublicOrder(getOrder(order.id)!) });
  }

  const nextStatus = resolveNextOrderStatus(event.status, order.status);
  setStatus(order.id, nextStatus, event.decline_reason ?? event.failure_reason ?? event.exception_reason);

  if (nextStatus === "refund_required") {
    appendEvent(order.id, {
      type: "webhook_exception_routed",
      actor: "merchant",
      messageKey: "latePaymentRoutedToException",
      params: { eventId: event.event_id },
      payload: event,
      timestamp,
    });
  } else {
    appendEvent(order.id, {
      type: "webhook_received",
      actor: "merchant",
      messageKey: "webhookReceivedFirst",
      params: { eventId: event.event_id },
      payload: event,
      timestamp,
    });
  }

  return NextResponse.json({ idempotent: false, order: toPublicOrder(getOrder(order.id)!) });
}
