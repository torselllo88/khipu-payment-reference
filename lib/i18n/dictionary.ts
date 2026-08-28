export type Lang = "en" | "ru";

export type EventMessageKey =
  | "paymentCreated"
  | "paymentReturnedFromRetry"
  | "redirectedToKhipu"
  | "bankAuthorized"
  | "bankDeclined"
  | "paymentExpired"
  | "bankUnavailable"
  | "khipuConfirmedPayment"
  | "khipuReportedFailedTransfer"
  | "webhookSent"
  | "webhookSentAfterSuccess"
  | "webhookSentAfterDecline"
  | "webhookReceivedFirst"
  | "webhookDuplicateIgnored"
  | "webhookRedelivered"
  | "webhookDeliverySkipped"
  | "latePaymentConfirmationDetected"
  | "latePaymentRoutedToException"
  | "statusRecoveredViaLookup"
  | "unlimitRequestFailed"
  | "unlimitRequestRetried";

export type DeclineReasonCode = "insufficient_funds";
export type FailureReasonCode = "bank_unavailable";

interface Dictionary {
  header: { subtitle: string; sandboxBadge: string };
  scenarioPanel: {
    running: string;
    retryWebhook: string;
    retryWebhookLoading: string;
    checkStatus: string;
    checkStatusLoading: string;
    simulateLateConfirmation: string;
    simulateLateConfirmationLoading: string;
    startFailed: string;
    actionFailed: string;
    unknownError: string;
  };
  status: Record<"pending" | "processing" | "success" | "declined" | "expired" | "failed" | "refund_required", string>;
  actors: Record<"merchant" | "unlimit" | "khipu" | "bank", string>;
  login: {
    subtitle: string;
    placeholder: string;
    submit: string;
    submitLoading: string;
    errors: { invalid_password: string; generic: string };
  };
  events: Record<EventMessageKey, string>;
  declineReasons: Record<DeclineReasonCode, string>;
  failureReasons: Record<FailureReasonCode, string>;
}

export const dictionaries: Record<Lang, Dictionary> = {
  en: {
    header: {
      subtitle: "Payment demo integration: a happy path and standard negative scenarios.",
      sandboxBadge: "Sandbox demo — simulated responses",
    },
    scenarioPanel: {
      running: "Running…",
      retryWebhook: "🔁 Resend webhook delivery",
      retryWebhookLoading: "Sending…",
      checkStatus: "🔍 Look up payment status",
      checkStatusLoading: "Looking up…",
      simulateLateConfirmation: "⌛ Simulate late bank confirmation",
      simulateLateConfirmationLoading: "Confirming…",
      startFailed: "Failed to start the scenario",
      actionFailed: "Action failed",
      unknownError: "Unknown error",
    },
    status: {
      pending: "Pending",
      processing: "Processing",
      success: "Success",
      declined: "Declined",
      expired: "Expired",
      failed: "Failed",
      refund_required: "Refund required",
    },
    actors: {
      merchant: "Merchant",
      unlimit: "Unlimit",
      khipu: "Khipu",
      bank: "Bank",
    },
    login: {
      subtitle: "This demo is password protected.",
      placeholder: "Password",
      submit: "Sign in",
      submitLoading: "Checking…",
      errors: { invalid_password: "Wrong password", generic: "Sign-in failed" },
    },
    events: {
      paymentCreated: "Unlimit created the payment and requested a Khipu payment session.",
      paymentReturnedFromRetry: "Unlimit returned the previously created payment and the existing Khipu payment reference.",
      redirectedToKhipu: "The payer was redirected to Khipu's payment flow.",
      bankAuthorized: "The payer authorized the bank transfer.",
      bankDeclined: "The bank rejected the transfer: {reason}",
      paymentExpired: "The payment window closed without the transfer being completed — Khipu marked it expired.",
      bankUnavailable: "Khipu could not reach the bank: {reason}",
      khipuConfirmedPayment: "Khipu verified and reconciled the transfer and confirmed the payment.",
      khipuReportedFailedTransfer: "Khipu received the failed transfer result and marked the payment as unsuccessful.",
      webhookSent: "Unlimit is sending a webhook with the payment status.",
      webhookSentAfterSuccess:
        "Unlimit mapped the confirmed Khipu payment to its canonical success state and is sending the merchant webhook.",
      webhookSentAfterDecline:
        "Unlimit mapped Khipu's expired-payment result to its own canonical declined state and is sending the merchant webhook.",
      webhookReceivedFirst: "Webhook processed for the first time (event_id={eventId}); order status updated.",
      webhookDuplicateIgnored: "Duplicate event ignored (event_id={eventId}, already processed); order state unchanged.",
      webhookRedelivered: "Unlimit is re-delivering the same payment-status webhook.",
      webhookDeliverySkipped:
        "Unlimit attempted to deliver the webhook, but delivery failed — the merchant endpoint was unavailable or timed out (simulated).",
      latePaymentConfirmationDetected: "Khipu confirmed the payment after the merchant order had already expired.",
      latePaymentRoutedToException:
        "The payment was routed to the late-payment exception flow; the order was not automatically reopened. (event_id={eventId})",
      statusRecoveredViaLookup: "The merchant recovered the payment state through a direct status lookup after the webhook delivery failed.",
      unlimitRequestFailed:
        "The client did not receive a definitive response; the order may already have been created. Retrying with the same Idempotency-Key.",
      unlimitRequestRetried:
        "Retry succeeded — Unlimit returned the same payment (payment_id={paymentId}) and the same Khipu payment (khipu_payment_id={khipuPaymentId}) instead of creating a duplicate.",
    },
    declineReasons: { insufficient_funds: "insufficient funds" },
    failureReasons: { bank_unavailable: "bank gateway unavailable" },
  },
  ru: {
    header: {
      subtitle: "Демо-интеграция платежей: happy path и стандартные негативные сценарии.",
      sandboxBadge: "Sandbox demo — симулированные ответы",
    },
    scenarioPanel: {
      running: "Выполняется…",
      retryWebhook: "🔁 Повторить доставку webhook",
      retryWebhookLoading: "Отправка…",
      checkStatus: "🔍 Проверить статус платежа",
      checkStatusLoading: "Проверка…",
      simulateLateConfirmation: "⌛ Симулировать позднее подтверждение банка",
      simulateLateConfirmationLoading: "Подтверждение…",
      startFailed: "Не удалось запустить сценарий",
      actionFailed: "Действие не выполнено",
      unknownError: "Неизвестная ошибка",
    },
    status: {
      pending: "Ожидание",
      processing: "В обработке",
      success: "Успешно",
      declined: "Отклонено",
      expired: "Истёк",
      failed: "Сбой",
      refund_required: "Требуется возврат",
    },
    actors: {
      merchant: "Мерчант",
      unlimit: "Unlimit",
      khipu: "Khipu",
      bank: "Банк",
    },
    login: {
      subtitle: "Демо защищено паролем.",
      placeholder: "Пароль",
      submit: "Войти",
      submitLoading: "Проверка…",
      errors: { invalid_password: "Неверный пароль", generic: "Ошибка входа" },
    },
    events: {
      paymentCreated: "Unlimit создал платёж и запросил сессию оплаты у Khipu.",
      paymentReturnedFromRetry: "Unlimit вернул ранее созданный платёж и существующую ссылку на платёж Khipu.",
      redirectedToKhipu: "Покупатель перенаправлен в платёжный флоу Khipu.",
      bankAuthorized: "Плательщик авторизовал банковский перевод.",
      bankDeclined: "Банк отклонил перевод: {reason}",
      paymentExpired: "Платёжное окно закрылось, перевод не был завершён — Khipu пометил платёж как expired.",
      bankUnavailable: "Khipu не смог связаться с банком: {reason}",
      khipuConfirmedPayment: "Khipu проверил и сверил перевод и подтвердил платёж.",
      khipuReportedFailedTransfer: "Khipu получил результат неудачного перевода и пометил платёж как unsuccessful.",
      webhookSent: "Unlimit отправляет webhook о статусе платежа.",
      webhookSentAfterSuccess:
        "Unlimit сопоставил подтверждённый Khipu-платёж со своим canonical-статусом success и отправляет webhook мерчанту.",
      webhookSentAfterDecline:
        "Unlimit сопоставил результат Khipu (expired) со своим canonical-статусом declined и отправляет webhook мерчанту.",
      webhookReceivedFirst: "Webhook обработан впервые (event_id={eventId}), статус заказа обновлён.",
      webhookDuplicateIgnored: "Дублирующееся событие проигнорировано (event_id={eventId}, уже обработан); статус заказа не изменился.",
      webhookRedelivered: "Unlimit повторно доставляет тот же webhook о статусе платежа.",
      webhookDeliverySkipped:
        "Unlimit попытался доставить webhook, но доставка не удалась — endpoint мерчанта был недоступен, либо произошёл таймаут (симуляция).",
      latePaymentConfirmationDetected: "Khipu подтвердил платёж уже после того, как заказ мерчанта истёк (expired).",
      latePaymentRoutedToException:
        "Платёж направлен в exception-флоу по позднему подтверждению; заказ не был автоматически переоткрыт. (event_id={eventId})",
      statusRecoveredViaLookup: "Мерчант восстановил статус платежа через прямой status-запрос после неудачной доставки webhook.",
      unlimitRequestFailed:
        "Клиент не получил определённого ответа; заказ, возможно, уже был создан. Повтор с тем же Idempotency-Key.",
      unlimitRequestRetried:
        "Повтор прошёл успешно — Unlimit вернул тот же платёж (payment_id={paymentId}) и тот же платёж Khipu (khipu_payment_id={khipuPaymentId}), а не создал дубликат.",
    },
    declineReasons: { insufficient_funds: "недостаточно средств" },
    failureReasons: { bank_unavailable: "шлюз банка недоступен" },
  },
};

export function interpolate(template: string, params?: Record<string, string>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? `{${key}}`);
}

const REASON_LOOKUP_BY_EVENT: Partial<Record<EventMessageKey, "declineReasons" | "failureReasons">> = {
  bankDeclined: "declineReasons",
  bankUnavailable: "failureReasons",
};

export function translateEvent(lang: Lang, key: EventMessageKey, params?: Record<string, string>): string {
  const dict = dictionaries[lang];
  let resolvedParams = params;
  const tableKey = REASON_LOOKUP_BY_EVENT[key];
  if (params?.reason && tableKey) {
    const table = dict[tableKey] as Record<string, string>;
    resolvedParams = { ...params, reason: table[params.reason] ?? params.reason };
  }
  return interpolate(dict.events[key], resolvedParams);
}
