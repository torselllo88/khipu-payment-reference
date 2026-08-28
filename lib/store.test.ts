import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetStoreForTests,
  appendEvent,
  createOrder,
  markWebhookProcessed,
  setLastWebhookRequest,
  toPublicOrder,
} from "@/lib/store";

beforeEach(() => {
  __resetStoreForTests();
});

function makeOrder() {
  return createOrder({
    scenarioId: "success",
    amount: 19990,
    currency: "CLP",
    unlimitPaymentId: "unlimit_test",
    khipuPaymentId: "khipu_test",
    redirectUrl: "https://khipu.com/payment/simplified/test",
  });
}

describe("markWebhookProcessed", () => {
  it("treats the first delivery of an event id as new", () => {
    const order = makeOrder();
    expect(markWebhookProcessed(order.id, "evt_1")).toBe(true);
  });

  it("treats a repeated delivery of the same event id as a duplicate", () => {
    const order = makeOrder();
    markWebhookProcessed(order.id, "evt_1");
    expect(markWebhookProcessed(order.id, "evt_1")).toBe(false);
  });

  it("does not confuse duplicate detection across different orders", () => {
    const orderA = makeOrder();
    const orderB = makeOrder();
    markWebhookProcessed(orderA.id, "evt_1");
    expect(markWebhookProcessed(orderB.id, "evt_1")).toBe(true);
  });

  it("treats a different event id on the same order as new", () => {
    const order = makeOrder();
    markWebhookProcessed(order.id, "evt_1");
    expect(markWebhookProcessed(order.id, "evt_2")).toBe(true);
  });
});

describe("appendEvent", () => {
  it("appends events in order and bumps updatedAt", () => {
    const order = makeOrder();
    appendEvent(order.id, { type: "payment_created", actor: "unlimit", messageKey: "paymentCreated" });
    appendEvent(order.id, { type: "bank_confirmation", actor: "bank", messageKey: "bankAuthorized" });
    expect(order.events.map((e) => e.type)).toEqual(["payment_created", "bank_confirmation"]);
  });
});

describe("toPublicOrder", () => {
  it("strips internal-only bookkeeping before exposing an order", () => {
    const order = makeOrder();
    setLastWebhookRequest(order.id, { url: "http://x", method: "POST", headers: {}, body: "{}" });
    markWebhookProcessed(order.id, "evt_1");

    const publicOrder = toPublicOrder(order) as unknown as Record<string, unknown>;
    expect(publicOrder.lastWebhookRequest).toBeUndefined();
    expect(publicOrder.processedWebhookEventIds).toBeUndefined();
    expect(publicOrder.id).toBe(order.id);
  });
});
