"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { dictionaries } from "@/lib/i18n/dictionary";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { LanguageSwitch } from "@/components/LanguageSwitch";

function LoginForm() {
  const { lang } = useLang();
  const dict = dictionaries[lang];
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const code = data.error as string | undefined;
      setError((code && dict.login.errors[code as keyof typeof dict.login.errors]) || dict.login.errors.generic);
      return;
    }
    router.push(params.get("from") || "/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 shadow-xl backdrop-blur"
      >
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="mb-1 text-xl font-semibold">Khipu × Unlimit</h1>
            <p className="text-sm text-slate-400">{dict.login.subtitle}</p>
          </div>
          <LanguageSwitch />
        </div>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={dict.login.placeholder}
          className="mb-3 w-full rounded-lg border border-white/10 bg-slate-900 px-4 py-2.5 text-sm outline-none focus:border-khipu"
        />
        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-khipu px-4 py-2.5 text-sm font-medium text-white transition hover:bg-khipu-dark disabled:opacity-50"
        >
          {loading ? dict.login.submitLoading : dict.login.submit}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
