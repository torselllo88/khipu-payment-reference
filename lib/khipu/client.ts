// Mock of Khipu's Instant Payments API (docs.khipu.com — v3, redirect flow).
// In the real architecture the merchant never talks to this client directly:
// Unlimit owns the relationship with Khipu and normalizes it for us
// (see lib/unlimit/client.ts). This file only exists to make that internal
// hop visible and swappable.
//
// KHIPU_MODE=live would issue real HTTP calls with KHIPU_API_KEY; today it
// always falls back to `stub` because no sandbox credentials exist yet.

export type KhipuStatus = "pending" | "verifying" | "done" | "expired";

export interface KhipuPayment {
  payment_id: string;
  status: KhipuStatus;
  amount: number;
  currency: string;
  subject: string;
  simplified_transfer_url: string;
}

/**
 * `approve`/`decline` are the payer resolving the transfer at the bank.
 * `expire` is the payer never resolving it — Khipu times out the session.
 * `provider_failure` is Khipu itself failing to reach the bank at all: a
 * controllable, operational failure, not a bank/customer decision — see
 * `KhipuUnavailableError` below.
 */
export type KhipuOutcome = "approve" | "decline" | "expire" | "provider_failure";

/** Khipu (or the bank behind it) could not be reached — distinct from any real payment status. */
export class KhipuUnavailableError extends Error {}

function mode(): "live" | "stub" {
  return process.env.KHIPU_MODE === "live" && process.env.KHIPU_API_KEY ? "live" : "stub";
}

export async function createKhipuPayment(input: {
  amount: number;
  currency: string;
  subject: string;
}): Promise<KhipuPayment> {
  if (mode() === "live") {
    throw new Error(
      "KHIPU_MODE=live but no real API integration is wired up yet — add the fetch call here."
    );
  }
  const payment_id = crypto.randomUUID();
  return {
    payment_id,
    status: "pending",
    amount: input.amount,
    currency: input.currency,
    subject: input.subject,
    simplified_transfer_url: `https://khipu.com/payment/simplified/${payment_id}`,
  };
}

/**
 * Simulates what happens after the payer lands on Khipu's hosted page.
 * `insufficient_funds` approximates a real-world bank rejection of the
 * transfer; Khipu's sandbox may not expose a deterministic way to trigger
 * this, which is exactly why this stays a stub even in `live` mode
 * per-scenario (see lib/scenarios.ts `stubOverrides`).
 */
export async function resolveKhipuPayment(
  outcome: KhipuOutcome
): Promise<{ status: KhipuStatus; declineReason?: string }> {
  if (mode() === "live") {
    throw new Error(
      "KHIPU_MODE=live but no real API integration is wired up yet — add the fetch call here."
    );
  }
  switch (outcome) {
    case "approve":
      return { status: "done" };
    case "decline":
      return { status: "expired", declineReason: "insufficient_funds" };
    case "expire":
      return { status: "expired" };
    case "provider_failure":
      throw new KhipuUnavailableError("Khipu bank gateway timed out (simulated)");
  }
}
