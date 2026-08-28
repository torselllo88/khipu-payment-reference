import { localize, type ScenarioDefinition } from "@/lib/scenarios";
import type { Lang } from "@/lib/i18n/dictionary";

const BADGE_RING: Record<ScenarioDefinition["badge"], string> = {
  success: "hover:border-emerald-400/50",
  decline: "hover:border-red-400/50",
  info: "hover:border-amber-400/50",
};

export function ScenarioCard({
  scenario,
  lang,
  selected,
  disabled,
  onSelect,
}: {
  scenario: ScenarioDefinition;
  lang: Lang;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`flex flex-col gap-2 rounded-2xl border p-5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        selected ? "border-khipu bg-khipu/10" : "border-white/10 bg-white/5"
      } ${BADGE_RING[scenario.badge]}`}
    >
      <span className="text-2xl">{scenario.icon}</span>
      <span className="font-medium text-slate-100">{localize(scenario.title, lang)}</span>
      <span className="text-sm text-slate-400">{localize(scenario.description, lang)}</span>
    </button>
  );
}
