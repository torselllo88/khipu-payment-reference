import type { OrderStatus } from "@/lib/store";
import type { ProviderOutcomeStatus } from "@/lib/unlimit/client";

/**
 * Maps a provider-reported outcome onto our own order status, given the
 * order's current status.
 *
 * The primary path for the "late confirmation after expiry" case is
 * explicit: the late-confirmation route itself already knows the order was
 * `expired` and sends `status: "exception"` rather than a bare `success` —
 * see app/api/orders/[id]/late-confirmation/route.ts. The `success &&
 * currentStatus === "expired"` branch below is a defensive backstop, not the
 * primary mechanism: if anything ever *did* send a naive success for an
 * order we already closed out as expired (a bug, or a real Unlimit that
 * doesn't have our invented "exception" status), the merchant side still
 * refuses to silently reopen the order as paid. Never trust a single layer
 * to get a terminal-state conflict right — the same principle the whole
 * idempotency/reconciliation set of scenarios is built around.
 */
export function resolveNextOrderStatus(
  providerStatus: ProviderOutcomeStatus,
  currentStatus: OrderStatus
): OrderStatus {
  if (providerStatus === "success" && currentStatus === "expired") return "refund_required";
  switch (providerStatus) {
    case "success":
      return "success";
    case "decline":
      return "declined";
    case "expired":
      return "expired";
    case "failed":
      return "failed";
    case "exception":
      return "refund_required";
  }
}
