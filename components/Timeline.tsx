import { dictionaries, translateEvent, type Lang } from "@/lib/i18n/dictionary";
import type { OrderActor, OrderEvent, OrderEventType } from "@/lib/store";

const ACTOR_COLOR: Record<OrderActor, string> = {
  merchant: "text-slate-300",
  unlimit: "text-unlimit",
  khipu: "text-khipu",
  bank: "text-amber-300",
};

// The idempotency-proof pair in the "Unlimit 5xx with retry" scenario is the
// whole point of that scenario — everything after it is just the ordinary
// happy path. Give it a distinct accent so it doesn't blend into the rest.
const IDEMPOTENCY_PROOF_EVENTS: ReadonlySet<OrderEventType> = new Set(["unlimit_request_failed", "unlimit_request_retried"]);

function formatTime(ts: number, lang: Lang) {
  return new Date(ts).toLocaleTimeString(lang === "ru" ? "ru-RU" : "en-US", { hour12: false });
}

export function Timeline({ events, lang }: { events: OrderEvent[]; lang: Lang }) {
  if (events.length === 0) return null;
  const actorLabels = dictionaries[lang].actors;
  return (
    <ol className="relative space-y-4 border-l border-white/10 pl-5">
      {events.map((event) => {
        const isProof = IDEMPOTENCY_PROOF_EVENTS.has(event.type);
        return (
          <li key={event.id} className="relative">
            <span
              className={`absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full ${isProof ? "bg-amber-400" : "bg-khipu"}`}
            />
            <div className="flex flex-wrap items-baseline gap-2 text-sm">
              <span className={`font-medium ${ACTOR_COLOR[event.actor]}`}>{actorLabels[event.actor]}</span>
              <span className="text-xs text-slate-500">{formatTime(event.timestamp, lang)}</span>
            </div>
            <p className={`text-sm ${isProof ? "font-medium text-amber-200" : "text-slate-300"}`}>
              {isProof && "🔒 "}
              {translateEvent(lang, event.messageKey, event.params)}
            </p>
            {event.payload !== undefined && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">payload</summary>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs text-slate-400">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </details>
            )}
          </li>
        );
      })}
    </ol>
  );
}
