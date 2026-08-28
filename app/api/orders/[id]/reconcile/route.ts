import { NextRequest, NextResponse } from "next/server";
import { getScenario } from "@/lib/scenarios";
import { getUnlimitOrderStatus } from "@/lib/unlimit/client";
import { appendEvent, getOrder, setStatus, toPublicOrder } from "@/lib/store";
import { resolveNextOrderStatus } from "@/lib/orderStatus";
import { continueFrom } from "@/lib/virtualClock";

// The recovery path a merchant's own status-lookup job would take when a
// webhook never shows up: ask the gateway directly for this one payment
// instead of waiting indefinitely for a push notification that may never
// come. This is a single on-demand GET, not batch reconciliation in the
// strict sense — triggered manually here to demo it, but it's the same
// lookup an automated job would run on a schedule.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = getOrder(id);
  if (!order) return NextResponse.json({ error: `Unknown order ${id}` }, { status: 404 });

  const scenario = getScenario(order.scenarioId);
  if (!scenario) return NextResponse.json({ error: `Unknown scenario ${order.scenarioId}` }, { status: 500 });

  // Captured before setStatus, which stamps order.updatedAt with real
  // Date.now() as a side effect — reading it after would clobber the
  // synthetic continuity this timestamp is meant to preserve.
  const timestamp = continueFrom(order.updatedAt);

  const result = await getUnlimitOrderStatus(scenario.bankOutcome);
  const nextStatus = resolveNextOrderStatus(result.status, order.status);
  setStatus(id, nextStatus, result.decline_reason ?? result.failure_reason);
  appendEvent(id, {
    type: "status_recovered_via_lookup",
    actor: "merchant",
    messageKey: "statusRecoveredViaLookup",
    payload: { payment_id: order.unlimitPaymentId, status: result.status },
    timestamp,
  });

  return NextResponse.json({ order: toPublicOrder(getOrder(id)!) });
}
