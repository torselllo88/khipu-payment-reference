import { NextRequest, NextResponse } from "next/server";
import { getScenario, type ScenarioDefinition } from "@/lib/scenarios";
import {
  createUnlimitOrder,
  resolveUnlimitOrder,
  UnlimitTransientError,
  type ProviderResolution,
  type UnlimitOrder,
} from "@/lib/unlimit/client";
import { dispatchWebhookRequest, type UnlimitWebhookEvent } from "@/lib/unlimit/webhook";
import { appendEvent, createOrder, getOrder, setLastWebhookRequest, toPublicOrder, type OrderEvent } from "@/lib/store";
import { createVirtualClock } from "@/lib/virtualClock";
import type { EventMessageKey } from "@/lib/i18n/dictionary";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const scenarioId = body?.scenarioId;
  const scenario = getScenario(scenarioId);
  if (!scenario) {
    return NextResponse.json({ error: `Unknown scenarioId "${scenarioId}"` }, { status: 400 });
  }

  // Generated once, upfront: this becomes our own order id, Unlimit's
  // merchant_order.id, AND the Idempotency-Key for the create-order call —
  // the same id reused everywhere a retry needs to recognize itself.
  const merchantOrderId = crypto.randomUUID();
  const { unlimitOrder, preOrderEvents } = await createUnlimitOrderWithRetry(scenario, merchantOrderId);

  const order = createOrder({
    id: merchantOrderId,
    scenarioId: scenario.id,
    amount: scenario.amount,
    currency: scenario.currency,
    unlimitPaymentId: unlimitOrder.payment_id,
    khipuPaymentId: unlimitOrder.khipu_payment_id,
    redirectUrl: unlimitOrder.redirect_url,
  });

  // Synthetic, not real elapsed time — everything above runs in milliseconds.
  // Spacing events out is purely so the timeline visually reads as the
  // asynchronous lifecycle it represents (see lib/virtualClock.ts).
  const clock = createVirtualClock();

  for (const event of preOrderEvents) appendEvent(order.id, { ...event, timestamp: clock.tick(500) });

  appendEvent(order.id, {
    type: preOrderEvents.length > 0 ? "payment_returned_from_retry" : "payment_created",
    actor: "unlimit",
    messageKey: preOrderEvents.length > 0 ? "paymentReturnedFromRetry" : "paymentCreated",
    payload: unlimitOrder,
    timestamp: clock.tick(2000),
  });

  appendEvent(order.id, {
    type: "redirected_to_khipu",
    actor: "khipu",
    messageKey: "redirectedToKhipu",
    payload: { redirect_url: unlimitOrder.redirect_url },
    timestamp: clock.tick(2000),
  });

  const resolution = await resolveUnlimitOrder(scenario.bankOutcome);
  const webhookMessageKey = describeProviderResolution(order.id, unlimitOrder, resolution, clock);

  if (scenario.webhookDelivery === "normal") {
    await sendWebhook(req, order.id, unlimitOrder, resolution, webhookMessageKey, clock);
  } else {
    appendEvent(order.id, {
      type: "webhook_delivery_skipped",
      actor: "unlimit",
      messageKey: "webhookDeliverySkipped",
      timestamp: clock.tick(2000),
    });
  }

  const finalOrder = getOrder(order.id)!;
  return NextResponse.json({ order: toPublicOrder(finalOrder) });
}

async function createUnlimitOrderWithRetry(
  scenario: ScenarioDefinition,
  merchantOrderId: string
): Promise<{ unlimitOrder: UnlimitOrder; preOrderEvents: Array<Omit<OrderEvent, "id" | "timestamp">> }> {
  const input = {
    merchantOrder: { id: merchantOrderId, description: scenario.title.en },
    paymentData: { amount: scenario.amount, currency: scenario.currency },
    idempotencyKey: merchantOrderId,
    simulateTransientFailureOnce: scenario.simulateOrderCreationFailureOnce ?? false,
  };
  try {
    return { unlimitOrder: await createUnlimitOrder(input), preOrderEvents: [] };
  } catch (e) {
    if (!(e instanceof UnlimitTransientError)) throw e;
    const preOrderEvents: Array<Omit<OrderEvent, "id" | "timestamp">> = [
      { type: "unlimit_request_failed", actor: "unlimit", messageKey: "unlimitRequestFailed" },
    ];
    // Same Idempotency-Key: Unlimit recognizes the retry and returns the
    // payment it already created, instead of creating a second one — same
    // Khipu payment reference too, proving the upstream charge wasn't duplicated.
    const unlimitOrder = await createUnlimitOrder(input);
    preOrderEvents.push({
      type: "unlimit_request_retried",
      actor: "unlimit",
      messageKey: "unlimitRequestRetried",
      params: { paymentId: unlimitOrder.payment_id, khipuPaymentId: unlimitOrder.khipu_payment_id },
    });
    return { unlimitOrder, preOrderEvents };
  }
}

/**
 * Emits the "what happened at the bank/Khipu layer" events for this
 * resolution and returns which webhookSent-family messageKey fits the
 * outcome. `approve`/`decline` get a two-step causal chain (something
 * happened, then Khipu verified/reported it) because a real confirmation or
 * rejection genuinely involves the bank; `expired`/`failed` are single-step
 * because nothing ever reached the bank in the first place.
 */
function describeProviderResolution(
  orderId: string,
  unlimitOrder: UnlimitOrder,
  resolution: ProviderResolution,
  clock: ReturnType<typeof createVirtualClock>
): EventMessageKey {
  switch (resolution.status) {
    case "success":
      appendEvent(orderId, {
        type: "bank_confirmation",
        actor: "bank",
        messageKey: "bankAuthorized",
        payload: { status: "authorized" },
        timestamp: clock.tick(15000),
      });
      appendEvent(orderId, {
        type: "khipu_confirmation",
        actor: "khipu",
        messageKey: "khipuConfirmedPayment",
        payload: { khipu_payment_id: unlimitOrder.khipu_payment_id, status: resolution.khipu_status },
        timestamp: clock.tick(17000),
      });
      return "webhookSentAfterSuccess";
    case "decline":
      appendEvent(orderId, {
        type: "bank_confirmation",
        actor: "bank",
        messageKey: "bankDeclined",
        params: { reason: resolution.decline_reason! },
        payload: { status: "declined", decline_reason: resolution.decline_reason },
        timestamp: clock.tick(15000),
      });
      appendEvent(orderId, {
        type: "khipu_confirmation",
        actor: "khipu",
        messageKey: "khipuReportedFailedTransfer",
        payload: {
          khipu_payment_id: unlimitOrder.khipu_payment_id,
          status: resolution.khipu_status,
          decline_reason: resolution.decline_reason,
        },
        timestamp: clock.tick(17000),
      });
      return "webhookSentAfterDecline";
    case "expired":
      appendEvent(orderId, {
        type: "bank_confirmation",
        actor: "khipu",
        messageKey: "paymentExpired",
        payload: { status: "expired" },
        timestamp: clock.tick(15000),
      });
      return "webhookSent";
    case "failed":
      appendEvent(orderId, {
        type: "bank_confirmation",
        actor: "khipu",
        messageKey: "bankUnavailable",
        params: { reason: resolution.failure_reason! },
        payload: { status: "failed", failure_reason: resolution.failure_reason },
        timestamp: clock.tick(15000),
      });
      return "webhookSent";
    case "exception":
      // Not reachable from the initial checkout resolution — "exception" is
      // only ever produced by the late-confirmation route.
      return "webhookSent";
  }
}

async function sendWebhook(
  req: NextRequest,
  orderId: string,
  unlimitOrder: UnlimitOrder,
  resolution: ProviderResolution,
  messageKey: EventMessageKey,
  clock: ReturnType<typeof createVirtualClock>
) {
  const event: UnlimitWebhookEvent = {
    event_id: crypto.randomUUID(),
    payment_id: unlimitOrder.payment_id,
    merchant_order_id: orderId,
    type: "PAYMENT_STATUS_CHANGED",
    status: resolution.status,
    decline_reason: resolution.decline_reason,
    failure_reason: resolution.failure_reason,
    payment_method: "khipu",
    created_at: new Date().toISOString(),
  };

  appendEvent(orderId, {
    type: "webhook_sent",
    actor: "unlimit",
    messageKey,
    payload: event,
    timestamp: clock.tick(2000),
  });

  const { record } = await dispatchWebhookRequest(new URL(req.url).origin, event, clock.tick(1000));
  setLastWebhookRequest(orderId, record);
}
