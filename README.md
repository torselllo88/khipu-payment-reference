# Khipu × Unlimit — Reference Payment Integration

> This is an independent reference implementation created for product and technical evaluation purposes. It is not an official Khipu or Unlimit integration.

Reference implementation of a Khipu Instant Payments integration for Chile, orchestrated through Unlimit, focused on payment lifecycle, canonical state mapping, webhooks, idempotency, reconciliation, and failure handling.

## Architecture

**Unlimit orchestrates Khipu.** The merchant (this backend) integrates only with Unlimit; Unlimit itself talks to Khipu as one of its payment methods and sends the merchant a normalized webhook. This is reflected in how the clients are split:

- `lib/unlimit/client.ts` — the only provider surface our backend actually calls (`createUnlimitOrder`, `resolveUnlimitOrder`, `getUnlimitOrderStatus`).
- `lib/khipu/client.ts` — the internal adapter that, in reality, Unlimit's side owns; it's called from `lib/unlimit/client.ts` here so that internal hop stays visible and swappable.

No real sandbox credentials exist for either provider, so both clients default to a `stub` mode — emulating responses that follow the shape of the public APIs, without real HTTP calls:

- **Khipu**: redirect flow, statuses `pending/verifying/done/expired` (Instant Payments API). Credentials here are genuinely obtainable through self-service signup — see below.
- **Unlimit**: self-service sandbox access is unlikely (closed merchant onboarding), so this mock is likely to stay a permanent part of the system rather than a temporary placeholder. Its shape is checked against what's publicly verifiable without an account — the real v3 SDKs (`github.com/cardpay/python-sdk-v3`, `java-sdk-v3`): a nested request (`merchant_order{id, description}` / `payment_data{amount, currency}` / `payment_method`), a response with `payment_id` + `redirect_url`, OAuth client-credentials instead of a flat API key (`terminal_code` + `password` → bearer token). No official field-by-field reference was reachable, so this is a best-effort match, not a verified contract. Unlimit also publishes a *different* public protocol — the legacy XML "CardPay Gateway" (v1: Base64 `orderXML` + SHA-512 digest, `wallet_id`) — deliberately not mimicked here, since it's a previous-generation, card-only protocol, not how a modern orchestrator exposes an LPM like Khipu.

### Flow

1. `POST /api/checkout` — creates the order, calls `createUnlimitOrder` (→ `createKhipuPayment` internally), then runs a causally ordered chain of events rather than one flat step: for `approve`/`decline` outcomes that's **payer authorizes → Khipu verifies/reconciles → Unlimit maps to its own canonical state → webhook**, not "bank confirmed = webhook sent" in a single jump. For `expired`/`failed` the chain is shorter — there was no bank interaction to confirm (the session simply timed out, or Khipu never reached the bank at all).
2. `POST /api/webhooks/unlimit` — the one endpoint a real integration would actually expose publicly. Verifies the HMAC signature and deduplicates by `event_id`: a repeated delivery of the same event never mutates order state twice.
3. `POST /api/orders/:id/replay-webhook` — manually re-fires the **exact same** HTTP request (same `event_id`, same signature) at step 2, so idempotency is proven by a genuine duplicate request rather than faked in the UI.
4. `POST /api/orders/:id/reconcile` — the fallback channel: a direct status lookup against Unlimit for one specific payment, instead of waiting on a webhook (the "merchant webhook never arrives" scenario). This is not batch reconciliation in the strict sense — just a GET on a single payment — so both the event text and the naming avoid the word "reconciled".
5. `POST /api/orders/:id/late-confirmation` — an A2A-specific edge case: Khipu confirms a transfer after Unlimit has already closed the payment out as `expired`. Instead of a silent `status: "success"` in the webhook — which would mislead the merchant — Unlimit explicitly sends `status: "exception"` with `exception_reason`/`action_required`. Payment state and merchant order state are deliberately kept distinct here (see the "Expired order, payment confirmed late" scenario).

**Webhook schema** (`lib/unlimit/webhook.ts`, our own convention — no official reference for Unlimit's real webhook payload was found): the canonical identifier is `payment_id` (Unlimit's own resource), with `merchant_order_id` as the secondary correlation field, not the other way around. `status` is one of `success | decline | expired | failed | exception`.

**Synthetic timing.** The entire checkout runs synchronously in milliseconds, so every event's real timestamp would land within the same second — which visually reads as a faked "asynchronous" flow. Each event instead gets an explicit, spaced-out timestamp (`lib/virtualClock.ts`) rather than real `Date.now()`: fast steps (redirect, sending the webhook) get seconds, the "Khipu verifies/reconciles the transfer" step gets close to 20 seconds — in spirit, not as a claim about how long Khipu actually takes. Actions triggered later by a real click (replay/reconcile/late-confirmation) continue that same synthetic timeline instead of restarting from `Date.now()` — otherwise a fast click would make time in the timeline visually run backward.

## Scenarios — an extensible registry

`lib/scenarios.ts` is not hardcoded branching — it's an array of descriptions (`title`, `description`, `bankOutcome`, `webhookDelivery`, flags `allowManualWebhookReplay` / `allowManualReconcile` / `allowLateConfirmation` / `simulateOrderCreationFailureOnce`). The UI renders cards and the timeline by simply mapping over this array. **Adding a new scenario means adding one object to `SCENARIOS`** — no component or API route changes required.

Implemented scenarios:

| Scenario | What it demonstrates |
|---|---|
| ✅ Successful payment | The full happy path: authorize → Khipu confirms → Unlimit maps to canonical success → webhook |
| ❌ Insufficient funds | A legitimate bank decline. Adapter/canonical-state model in action: at Khipu's layer this is `status: "expired"` (its real status — Khipu has no decline concept of its own), which Unlimit normalizes into its own canonical `declined` — different vocabularies at different layers, the same `decline_reason` carried through both |
| 🔁 Duplicate webhook | Idempotent handling of a repeated event delivery — including an explicit "Unlimit re-delivering" event, not just a result appearing out of nowhere |
| ⏱ Merchant webhook never arrives | Webhook delivery *to the merchant* fails (not between Khipu and Unlimit) — status is recovered through a direct status lookup, not "reconciliation" in the strict sense |
| ⌛ Expired order, payment confirmed late | The order is `EXPIRED`, then Khipu confirms the transfer after the fact anyway — not a silent success, but an explicit `status: "exception"` in the webhook itself (not a naive success that only the merchant happens to reclassify). Payment state and merchant order state are not the same thing |
| 🔌 Bank unavailable | A controllable, operational failure (Khipu can't reach the bank at all) — status `failed`, deliberately distinct from `declined`/`expired`, so an infrastructure failure never gets confused with a legitimate customer decline |
| ♻️ Unlimit 5xx with retry | A transient 5xx on payment creation; retrying with the same Idempotency-Key proves the retry returns the same `payment_id` **and** the same `khipu_payment_id` — not just that our own order wasn't duplicated, but that the upstream charge wasn't either |

On "Merchant webhook never arrives": the action is labeled **Look up payment status**, not "reconciliation" — it's a single GET on one payment, not batch reconciliation. That this is a manual button rather than a background job is purely for demonstration — in production it would be the same lookup, run on a schedule.

Backlog candidates (not implemented, but the registry is ready to take them): a 3DS/OTP challenge decline, invalid payment details, a fraud/risk decline — none add a new architectural idea beyond insufficient funds for this purpose, but they're worth having for coverage.

## Interface language

English is the primary, default experience; Russian is available as an alternative via the EN/RU toggle in the top-right corner (persisted in the browser's `localStorage`). Everything is localized: scenario cards, status badges, action buttons, and the event timeline itself — events are stored as a translation key plus parameters (`lib/i18n/dictionary.ts`), not a pre-rendered string, so the same order renders correctly in either language without another round trip to the backend.

## Live/stub mode

Both clients are controlled via env vars and default to `stub`:

- `KHIPU_MODE` / `UNLIMIT_MODE` = `live` | `stub`. Auto-falls back to `stub` if the relevant credentials are missing (`KHIPU_API_KEY` for Khipu, `UNLIMIT_TERMINAL_CODE` for Unlimit).
- Each scenario in the registry has `stubOverrides` — a way to force a specific step to stay emulated even when a provider is globally switched to `live`, for conditions a sandbox can't reliably reproduce (e.g. insufficient funds).

To wire up real Khipu credentials: set `KHIPU_MODE=live`, `KHIPU_API_KEY`/`KHIPU_SECRET`, and implement a real `fetch` inside `createKhipuPayment`/`resolveKhipuPayment` — no other signatures or call sites need to change. For Unlimit, the `live` branch will additionally need an OAuth token exchange (`UNLIMIT_TERMINAL_CODE`+`UNLIMIT_PASSWORD` → bearer token, with caching/refresh) ahead of the actual call — see the comment in `lib/unlimit/client.ts`.

## Access control

Controlled through env vars, no rebuild required:

| Variable | Values | Purpose |
|---|---|---|
| `DEMO_ACCESS_MODE` | `password` \| `open` | access mode for the deployed instance |
| `DEMO_PASSWORD` | string | password, when the mode is `password` |
| `AUTH_SECRET` | string | secret used to sign the session cookie |
| `UNLIMIT_WEBHOOK_SECRET` | string | secret used to sign webhooks (has a safe default for local development) |
| `KHIPU_MODE`, `UNLIMIT_MODE` | `live` \| `stub` | provider client mode |
| `KHIPU_API_KEY`, `KHIPU_SECRET` | string | real Khipu credentials (only for `live`) |
| `UNLIMIT_TERMINAL_CODE`, `UNLIMIT_PASSWORD` | string | real Unlimit OAuth credentials (only for `live`) |

In `password` mode, everything except `/login`, `/api/auth/login`, and `/api/webhooks/*` requires a cookie issued at login. The webhook endpoint is deliberately not behind the password — it authenticates via HMAC signature, like a real Unlimit webhook would, and gating it would break the internal self-call from `/api/checkout`.

## Local development

```bash
npm install
cp .env.example .env.local   # optional: configure password/secrets
npm run dev
npm test                     # unit tests for the idempotent dedup logic
```

Orders are held in an in-memory store (`lib/store.ts`), scoped to a single Node process — fine for local development or a single-instance run, but it won't survive a process restart or work across multiple instances. A real deployment would back this with an actual database.
