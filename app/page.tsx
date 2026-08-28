"use client";

import { useState } from "react";
import { SCENARIOS, getScenario } from "@/lib/scenarios";
import { dictionaries } from "@/lib/i18n/dictionary";
import { useLang } from "@/lib/i18n/LanguageProvider";
import type { PublicOrder } from "@/lib/store";
import { ScenarioCard } from "@/components/ScenarioCard";
import { Timeline } from "@/components/Timeline";
import { StatusBadge } from "@/components/StatusBadge";
import { LanguageSwitch } from "@/components/LanguageSwitch";

type ActionLoading = "checkout" | "replay" | "reconcile" | "lateConfirmation" | null;

export default function Home() {
  const { lang } = useLang();
  const dict = dictionaries[lang];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [loading, setLoading] = useState<ActionLoading>(null);
  const [error, setError] = useState<string | null>(null);

  const scenario = selectedId ? getScenario(selectedId) : undefined;

  async function runScenario(id: string) {
    setSelectedId(id);
    setOrder(null);
    setError(null);
    setLoading("checkout");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || dict.scenarioPanel.startFailed);
      setOrder(data.order);
    } catch (e) {
      setError(e instanceof Error ? e.message : dict.scenarioPanel.unknownError);
    } finally {
      setLoading(null);
    }
  }

  async function callAction(path: string, kind: ActionLoading) {
    if (!order) return;
    setLoading(kind);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/${path}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || dict.scenarioPanel.actionFailed);
      setOrder(data.order);
    } catch (e) {
      setError(e instanceof Error ? e.message : dict.scenarioPanel.unknownError);
    } finally {
      setLoading(null);
    }
  }

  const hasWebhookFired = order?.events.some((e) => e.type === "webhook_sent") ?? false;

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            <span className="text-khipu">Khipu</span> <span className="text-slate-500">×</span>{" "}
            <span className="text-unlimit">Unlimit</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">{dict.header.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">
            {dict.header.sandboxBadge}
          </span>
          <LanguageSwitch />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SCENARIOS.map((s) => (
          <ScenarioCard
            key={s.id}
            scenario={s}
            lang={lang}
            selected={s.id === selectedId}
            disabled={loading === "checkout"}
            onSelect={() => runScenario(s.id)}
          />
        ))}
      </div>

      {selectedId && (
        <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-medium text-slate-100">{scenario && scenario.title[lang]}</h2>
            {order ? (
              <StatusBadge status={order.status} lang={lang} />
            ) : loading === "checkout" ? (
              <span className="text-sm text-slate-400">{dict.scenarioPanel.running}</span>
            ) : null}
          </div>

          {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

          {order && <Timeline events={order.events} lang={lang} />}

          {order &&
            (scenario?.allowManualWebhookReplay || scenario?.allowManualReconcile || scenario?.allowLateConfirmation) && (
              <div className="mt-6 flex flex-wrap gap-3 border-t border-white/10 pt-5">
                {scenario.allowManualWebhookReplay && hasWebhookFired && (
                  <button
                    type="button"
                    disabled={loading !== null}
                    onClick={() => callAction("replay-webhook", "replay")}
                    className="rounded-lg bg-unlimit px-4 py-2 text-sm font-medium text-white transition hover:bg-unlimit-dark disabled:opacity-50"
                  >
                    {loading === "replay" ? dict.scenarioPanel.retryWebhookLoading : dict.scenarioPanel.retryWebhook}
                  </button>
                )}
                {scenario.allowManualReconcile && order.status === "pending" && (
                  <button
                    type="button"
                    disabled={loading !== null}
                    onClick={() => callAction("reconcile", "reconcile")}
                    className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-600 disabled:opacity-50"
                  >
                    {loading === "reconcile" ? dict.scenarioPanel.checkStatusLoading : dict.scenarioPanel.checkStatus}
                  </button>
                )}
                {scenario.allowLateConfirmation && order.status === "expired" && (
                  <button
                    type="button"
                    disabled={loading !== null}
                    onClick={() => callAction("late-confirmation", "lateConfirmation")}
                    className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-500 disabled:opacity-50"
                  >
                    {loading === "lateConfirmation"
                      ? dict.scenarioPanel.simulateLateConfirmationLoading
                      : dict.scenarioPanel.simulateLateConfirmation}
                  </button>
                )}
              </div>
            )}
        </section>
      )}
    </main>
  );
}
