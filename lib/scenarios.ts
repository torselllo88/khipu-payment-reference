import type { KhipuOutcome } from "@/lib/khipu/client";
import type { Lang } from "@/lib/i18n/dictionary";

export type ScenarioBadge = "success" | "decline" | "info";

export interface LocalizedText {
  en: string;
  ru: string;
}

export interface ScenarioDefinition {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  icon: string;
  badge: ScenarioBadge;
  amount: number;
  currency: string;
  /** What the simulated bank/Khipu confirmation resolves to. */
  bankOutcome: KhipuOutcome;
  /**
   * "normal": Unlimit fires the webhook right after the bank resolves it.
   * "delayed_missing": the webhook never arrives on its own — the UI has to
   * fall back to polling GET status (reconciliation).
   */
  webhookDelivery: "normal" | "delayed_missing";
  /** Show a "resend webhook" action so the viewer can trigger a real duplicate delivery themselves. */
  allowManualWebhookReplay?: boolean;
  /** Show a "run reconciliation" action (the recovery path when a webhook never arrives). */
  allowManualReconcile?: boolean;
  /** Show a "simulate late bank confirmation" action once the order reaches `expired`. */
  allowLateConfirmation?: boolean;
  /** Simulate one transient 5xx from Unlimit's order-creation call, recovered via idempotent retry. */
  simulateOrderCreationFailureOnce?: boolean;
  /**
   * Per-scenario escape hatch for once real credentials exist: force a step
   * to stay emulated even when the provider is globally switched to `live`,
   * for conditions the real sandbox can't deterministically reproduce.
   */
  stubOverrides?: Partial<{ khipu: boolean; unlimit: boolean }>;
}

export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: "success",
    title: { en: "Successful payment", ru: "Успешный платёж" },
    description: {
      en: "An order is created, the payer confirms the transfer in Khipu, and Unlimit delivers a webhook — the full happy path.",
      ru: "Заказ создаётся, покупатель подтверждает перевод в Khipu, Unlimit присылает webhook — happy path целиком.",
    },
    icon: "✅",
    badge: "success",
    amount: 19990,
    currency: "CLP",
    bankOutcome: "approve",
    webhookDelivery: "normal",
  },
  {
    id: "insufficient_funds",
    title: { en: "Insufficient funds", ru: "Недостаточно средств" },
    description: {
      en: "The bank declines the transfer for lack of funds — Unlimit delivers a webhook with a decline status and reason.",
      ru: "Банк отклоняет перевод из-за нехватки средств — Unlimit присылает webhook со статусом decline и причиной отказа.",
    },
    icon: "❌",
    badge: "decline",
    amount: 19990,
    currency: "CLP",
    bankOutcome: "decline",
    webhookDelivery: "normal",
    stubOverrides: { khipu: true },
  },
  {
    id: "webhook_idempotency",
    title: { en: "Duplicate webhook", ru: "Дублирующийся webhook" },
    description: {
      en: "The payment succeeds, then the same webhook is delivered again — the handler must be idempotent.",
      ru: "Платёж проходит успешно, а затем тот же webhook доставляется повторно — обработчик обязан быть идемпотентным.",
    },
    icon: "🔁",
    badge: "success",
    amount: 19990,
    currency: "CLP",
    bankOutcome: "approve",
    webhookDelivery: "normal",
    allowManualWebhookReplay: true,
  },
  {
    id: "webhook_delay",
    title: { en: "Merchant webhook never arrives", ru: "Webhook мерчанту не пришёл" },
    description: {
      en: "The bank confirms the payment, but Unlimit's webhook delivery to the merchant fails — the status is recovered through a direct status lookup.",
      ru: "Банк подтверждает платёж, но доставка webhook от Unlimit мерчанту не удаётся — статус восстанавливается через прямой status-запрос.",
    },
    icon: "⏱",
    badge: "info",
    amount: 19990,
    currency: "CLP",
    bankOutcome: "approve",
    webhookDelivery: "delayed_missing",
    allowManualReconcile: true,
  },
  {
    id: "expired_late_confirmation",
    title: { en: "Expired order, payment confirmed late", ru: "Истёкший заказ, платёж подтверждён с опозданием" },
    description: {
      en: "The payment window closes and Khipu marks it expired — then Khipu confirms the transfer anyway, after the fact, triggering a refund-policy exception instead of a silent success. Payment state and merchant order state are not the same thing.",
      ru: "Платёжное окно закрывается, Khipu помечает платёж как expired — а затем всё же подтверждает перевод постфактум, что запускает исключение по политике возврата вместо тихого успеха. Payment state и merchant order state — не одно и то же.",
    },
    icon: "⌛",
    badge: "info",
    amount: 19990,
    currency: "CLP",
    bankOutcome: "expire",
    webhookDelivery: "normal",
    allowLateConfirmation: true,
  },
  {
    id: "provider_failure",
    title: { en: "Bank unavailable", ru: "Банк недоступен" },
    description: {
      en: "Khipu can't reach the bank at all — a controllable, operational failure that has to be reported and handled differently from a legitimate customer decline like insufficient funds.",
      ru: "Khipu вообще не может связаться с банком — контролируемый, операционный сбой, который нужно фиксировать и обрабатывать иначе, чем легитимный отказ клиента вроде insufficient funds.",
    },
    icon: "🔌",
    badge: "info",
    amount: 19990,
    currency: "CLP",
    bankOutcome: "provider_failure",
    webhookDelivery: "normal",
  },
  {
    id: "unlimit_5xx_retry",
    title: { en: "Unlimit 5xx with retry", ru: "5xx у Unlimit с ретраем" },
    description: {
      en: "The order-creation call to Unlimit fails with a transient 5xx; retrying with the same Idempotency-Key proves the retry can't create a duplicate order or payment.",
      ru: "Запрос на создание заказа к Unlimit падает с временным 5xx; повтор с тем же Idempotency-Key доказывает, что ретрай не может создать дублирующий заказ или платёж.",
    },
    icon: "♻️",
    badge: "success",
    amount: 19990,
    currency: "CLP",
    bankOutcome: "approve",
    webhookDelivery: "normal",
    simulateOrderCreationFailureOnce: true,
  },
];

export function getScenario(id: string): ScenarioDefinition | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function localize(text: LocalizedText, lang: Lang): string {
  return text[lang];
}
