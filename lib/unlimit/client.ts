// Mock of Unlimit's gateway API: single order/webhook contract on top of
// cards + local payment methods. This is the only provider surface our
// backend talks to — Unlimit is the one that owns the Khipu relationship
// underneath (see lib/khipu/client.ts).
//
// Field/auth shapes below are matched against what's publicly verifiable
// without a merchant account: Unlimit's modern v3 SDKs (github.com/cardpay/
// python-sdk-v3, java-sdk-v3) show a `merchant_order{id, description}` /
// `customer` / `payment_method` / `payment_data{currency, amount}` request
// shape and a `payment_id` + `redirect_url` response — that's what this
// mock follows. (Their *other* public reference, at integration.unlimit.com,
// is the legacy XML-based "CardPay Gateway" v1 — Base64 orderXML + SHA-512
// digest, wallet_id fields — a different, card-only protocol; deliberately
// not mimicked here since it isn't how a modern LPM orchestration surface
// works.) No official field-by-field docs were reachable, so treat this as
// a best-effort match, not a verified spec.
//
// UNLIMIT_MODE=live would issue real HTTP calls; today it always falls back
// to `stub` because no sandbox credentials exist yet.

import { createKhipuPayment, resolveKhipuPayment, KhipuUnavailableError, type KhipuOutcome, type KhipuStatus } from "@/lib/khipu/client";

export type UnlimitOrderStatus = "created" | "in_progress" | "success" | "decline" | "expired" | "failed";

/**
 * The set of terminal outcomes a webhook (or a direct status poll) can
 * report. `exception` is distinct from a normal `success`: it's how Unlimit
 * flags a payment that resolved successfully at the provider layer but
 * conflicts with a terminal state the merchant was already given (e.g. a
 * late confirmation arriving after the order was reported `expired`) — the
 * payment and the merchant's order state are not the same thing, and this
 * status makes that explicit at the protocol level instead of leaving the
 * merchant to infer it from a bare "success".
 */
export type ProviderOutcomeStatus = "success" | "decline" | "expired" | "failed" | "exception";

export interface UnlimitOrder {
  payment_id: string;
  status: UnlimitOrderStatus;
  merchant_order: { id: string; description: string };
  payment_data: { amount: number; currency: string };
  payment_method: "khipu";
  redirect_url: string;
  khipu_payment_id: string;
}

/** A transient failure on Unlimit's side — the write may or may not have gone through upstream. */
export class UnlimitTransientError extends Error {}

/**
 * Real Unlimit v3 auth is OAuth client-credentials, not a static API key:
 * POST grant_type=client_credentials + terminal_code + password → a bearer
 * token, refreshed on expiry, sent as `Authorization: Bearer <token>` on
 * every call after that. This mock never makes a real HTTP call, so there's
 * nothing to actually exchange — but `live` mode would need a small token
 * cache (fetch once, reuse until near-expiry, refresh) sitting in front of
 * whatever calls this module makes.
 */
function mode(): "live" | "stub" {
  return process.env.UNLIMIT_MODE === "live" && process.env.UNLIMIT_TERMINAL_CODE ? "live" : "stub";
}

// Keyed by Idempotency-Key, same as a real idempotent POST endpoint (Stripe/
// Unlimit-style): a retry that reuses the key gets back the SAME order
// instead of creating a duplicate. globalThis-backed for the same reason as
// lib/store.ts — Next.js gives each route its own module instance.
declare global {
  // eslint-disable-next-line no-var
  var __khipuUnlimitIdempotency: Map<string, UnlimitOrder> | undefined;
  // eslint-disable-next-line no-var
  var __khipuUnlimitSimulatedFailures: Set<string> | undefined;
}
const idempotencyCache = globalThis.__khipuUnlimitIdempotency ?? new Map<string, UnlimitOrder>();
globalThis.__khipuUnlimitIdempotency = idempotencyCache;
const simulatedFailures = globalThis.__khipuUnlimitSimulatedFailures ?? new Set<string>();
globalThis.__khipuUnlimitSimulatedFailures = simulatedFailures;

export async function createUnlimitOrder(input: {
  merchantOrder: { id: string; description: string };
  paymentData: { amount: number; currency: string };
  /** In this demo, the merchant's own order id doubles as the Idempotency-Key — a common, valid choice in practice. */
  idempotencyKey: string;
  /** For the "5xx + retry" scenario: simulate one transient failure the first time this key is used. */
  simulateTransientFailureOnce?: boolean;
}): Promise<UnlimitOrder> {
  if (mode() === "live") {
    throw new Error(
      "UNLIMIT_MODE=live but no real API integration is wired up yet — add the OAuth token exchange and the fetch call here."
    );
  }

  const cached = idempotencyCache.get(input.idempotencyKey);
  if (cached) return cached;

  const khipuPayment = await createKhipuPayment({
    amount: input.paymentData.amount,
    currency: input.paymentData.currency,
    subject: input.merchantOrder.description,
  });
  const order: UnlimitOrder = {
    payment_id: crypto.randomUUID(),
    status: "created",
    merchant_order: input.merchantOrder,
    payment_data: input.paymentData,
    payment_method: "khipu",
    redirect_url: khipuPayment.simplified_transfer_url,
    khipu_payment_id: khipuPayment.payment_id,
  };
  // Cached before the simulated failure below: the write really did land on
  // Unlimit's side even though (from our point of view) the response never
  // arrived — the exact ambiguous-outcome case an Idempotency-Key exists for.
  idempotencyCache.set(input.idempotencyKey, order);

  if (input.simulateTransientFailureOnce && !simulatedFailures.has(input.idempotencyKey)) {
    simulatedFailures.add(input.idempotencyKey);
    throw new UnlimitTransientError("Unlimit responded 503 (simulated) — response lost in transit");
  }

  return order;
}

/**
 * What Unlimit itself would know once the payer resolves the Khipu redirect
 * — this is the "ground truth" that either arrives via webhook, or can be
 * fetched later via `getUnlimitOrderStatus` if the webhook never shows up.
 */
export interface ProviderResolution {
  status: ProviderOutcomeStatus;
  decline_reason?: string;
  failure_reason?: string;
  /** Khipu's own raw status behind this outcome (e.g. "done", "expired") — undefined when Khipu was never reached at all. */
  khipu_status?: KhipuStatus;
}

export async function resolveUnlimitOrder(outcome: KhipuOutcome): Promise<ProviderResolution> {
  try {
    const khipuResult = await resolveKhipuPayment(outcome);
    if (outcome === "approve") return { status: "success", khipu_status: khipuResult.status };
    if (outcome === "expire") return { status: "expired", khipu_status: khipuResult.status };
    return { status: "decline", decline_reason: khipuResult.declineReason, khipu_status: khipuResult.status };
  } catch (e) {
    if (e instanceof KhipuUnavailableError) {
      // Unlimit shields the merchant from the raw provider error and
      // normalizes it into its own "failed" status instead of propagating it.
      return { status: "failed", failure_reason: "bank_unavailable" };
    }
    throw e;
  }
}

/**
 * Direct status lookup against Unlimit — what a merchant would call when a
 * webhook is late or missing, instead of trusting push delivery alone.
 */
export async function getUnlimitOrderStatus(outcome: KhipuOutcome): Promise<ProviderResolution> {
  return resolveUnlimitOrder(outcome);
}
