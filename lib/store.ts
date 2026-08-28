import type { EventMessageKey } from "@/lib/i18n/dictionary";

export type OrderStatus =
  | "pending"
  | "processing"
  | "success"
  | "declined"
  | "expired"
  | "failed"
  | "refund_required";

export type OrderEventType =
  | "payment_created"
  | "payment_returned_from_retry"
  | "redirected_to_khipu"
  | "bank_confirmation"
  | "khipu_confirmation"
  | "webhook_sent"
  | "webhook_received"
  | "webhook_duplicate_ignored"
  | "webhook_redelivered"
  | "webhook_delivery_skipped"
  | "webhook_exception_routed"
  | "status_recovered_via_lookup"
  | "unlimit_request_failed"
  | "unlimit_request_retried"
  | "late_payment_confirmation_detected";

export type OrderActor = "merchant" | "unlimit" | "khipu" | "bank";

export interface OrderEvent {
  id: string;
  type: OrderEventType;
  actor: OrderActor;
  /** Translation key — the client resolves this (plus `params`) to display text in the selected language. */
  messageKey: EventMessageKey;
  params?: Record<string, string>;
  payload?: unknown;
  timestamp: number;
}

export interface WebhookRequestRecord {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
}

export interface StoredOrder {
  id: string;
  scenarioId: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  /** Populated for "declined" (decline reason) and "failed" (technical failure reason). */
  reason?: string;
  /** Unlimit's own resource id — kept alongside our order id so a later direct status lookup (GET /payment/{id}) is possible. */
  unlimitPaymentId: string;
  khipuPaymentId: string;
  redirectUrl: string;
  events: OrderEvent[];
  processedWebhookEventIds: Set<string>;
  lastWebhookRequest?: WebhookRequestRecord;
  createdAt: number;
  updatedAt: number;
}

// Single-process in-memory store. Fine for a one-instance demo deploy;
// a real deployment would back this with a database (see README).
//
// Next.js compiles each route handler as its own module graph, so a plain
// `const orders = new Map()` here ends up as a *separate* Map per route —
// an order created in /api/checkout would be invisible from
// /api/webhooks/unlimit. Anchoring it on globalThis keeps one shared Map
// per Node process, the same trick used for singleton DB clients in Next.js.
declare global {
  // eslint-disable-next-line no-var
  var __khipuUnlimitOrders: Map<string, StoredOrder> | undefined;
}

const orders = globalThis.__khipuUnlimitOrders ?? new Map<string, StoredOrder>();
globalThis.__khipuUnlimitOrders = orders;

export function createOrder(input: {
  /** Pass the id already sent to Unlimit as `merchant_order.id`, so the two line up — see the checkout route. */
  id?: string;
  scenarioId: string;
  amount: number;
  currency: string;
  unlimitPaymentId: string;
  khipuPaymentId: string;
  redirectUrl: string;
}): StoredOrder {
  const now = Date.now();
  const order: StoredOrder = {
    id: input.id ?? crypto.randomUUID(),
    scenarioId: input.scenarioId,
    amount: input.amount,
    currency: input.currency,
    status: "pending",
    unlimitPaymentId: input.unlimitPaymentId,
    khipuPaymentId: input.khipuPaymentId,
    redirectUrl: input.redirectUrl,
    events: [],
    processedWebhookEventIds: new Set(),
    createdAt: now,
    updatedAt: now,
  };
  orders.set(order.id, order);
  return order;
}

export function getOrder(id: string): StoredOrder | undefined {
  return orders.get(id);
}

export function appendEvent(
  id: string,
  /** `timestamp` is optional — pass an explicit one (e.g. from lib/virtualClock.ts) to space out a burst of events; omit it for a genuinely time-separated action (a later button click) where real time is the honest value. */
  event: Omit<OrderEvent, "id" | "timestamp"> & { timestamp?: number }
): OrderEvent {
  const order = orders.get(id);
  if (!order) throw new Error(`Unknown order ${id}`);
  const { timestamp, ...rest } = event;
  const full: OrderEvent = {
    ...rest,
    id: crypto.randomUUID(),
    timestamp: timestamp ?? Date.now(),
  };
  order.events.push(full);
  order.updatedAt = full.timestamp;
  return full;
}

export function setStatus(id: string, status: OrderStatus, reason?: string) {
  const order = orders.get(id);
  if (!order) throw new Error(`Unknown order ${id}`);
  order.status = status;
  order.reason = reason;
  order.updatedAt = Date.now();
}

export function setLastWebhookRequest(id: string, record: WebhookRequestRecord) {
  const order = orders.get(id);
  if (!order) throw new Error(`Unknown order ${id}`);
  order.lastWebhookRequest = record;
}

/** Returns true if this is the first time this event id has been seen for the order. */
export function markWebhookProcessed(id: string, eventId: string): boolean {
  const order = orders.get(id);
  if (!order) throw new Error(`Unknown order ${id}`);
  if (order.processedWebhookEventIds.has(eventId)) return false;
  order.processedWebhookEventIds.add(eventId);
  return true;
}

export interface PublicOrder {
  id: string;
  scenarioId: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  reason?: string;
  unlimitPaymentId: string;
  khipuPaymentId: string;
  redirectUrl: string;
  events: OrderEvent[];
  createdAt: number;
  updatedAt: number;
}

/** Strips internal-only bookkeeping (idempotency set, raw webhook request) before sending an order to the client. */
export function toPublicOrder(order: StoredOrder): PublicOrder {
  const { processedWebhookEventIds, lastWebhookRequest, ...rest } = order;
  return rest;
}

/** Test-only escape hatch to reset module state between test cases. */
export function __resetStoreForTests() {
  orders.clear();
}
