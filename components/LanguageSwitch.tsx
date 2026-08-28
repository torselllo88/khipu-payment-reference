"use client";

import { useLang } from "@/lib/i18n/LanguageProvider";
import type { Lang } from "@/lib/i18n/dictionary";

const OPTIONS: Lang[] = ["en", "ru"];

export function LanguageSwitch() {
  const { lang, setLang } = useLang();
  return (
    <div className="inline-flex overflow-hidden rounded-full border border-white/10 text-xs">
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setLang(option)}
          className={`px-3 py-1 uppercase transition ${
            lang === option ? "bg-khipu text-white" : "bg-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
