"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, hasBackend } from "@/lib/api";
import { setSession } from "@/lib/store";
import type { Dict } from "@/lib/i18n";

export default function LoginForm({ dict, locale }: { dict: Dict["login"]; locale: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const demoSignIn = () => {
    setSession(email || "demo@axioform.ch");
    router.push(`/${locale}/portal/`);
  };

  const submit = async () => {
    if (!hasBackend) return demoSignIn();
    setBusy(true);
    setError(null);
    try {
      const session = mode === "signup" ? await api.signup(email, password, name) : await api.login(email, password);
      setSession(session.email);
      // Company accounts land on the company portal, customers on theirs.
      router.push(`/${locale}/${session.role === "customer" ? "portal" : "admin"}/`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const errorText = (code: string) =>
    code === "email_taken"
      ? dict.errTaken
      : code === "invalid_input"
        ? dict.errInput
        : code === "account_disabled"
          ? dict.errDisabled
          : dict.errCredentials;

  const inputCls =
    "w-full border border-hairline bg-paper px-4 py-3 text-sm font-light text-ink outline-none transition-colors placeholder:text-stone focus:border-graphite";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4"
    >
      {hasBackend && mode === "signup" && (
        <label className="flex flex-col gap-1.5">
          <span className="label">{dict.name}</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Anna Muster" className={inputCls} />
        </label>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="label">{dict.email}</span>
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="name@example.ch"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label">{dict.password}</span>
        <input
          type="password"
          required
          minLength={hasBackend ? 8 : undefined}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
        />
      </label>

      {error && (
        <p role="alert" className="border-l-2 border-alert bg-mist/70 p-3 text-sm font-light text-alert">
          {errorText(error)}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-2 inline-flex items-center justify-center bg-ink px-7 py-3.5 text-xs font-medium uppercase tracking-[0.16em] text-paper transition-colors hover:bg-graphite disabled:opacity-50"
      >
        {busy ? "…" : mode === "signup" ? dict.registerCta : dict.submit}
      </button>
      {!hasBackend && (
        <button
          type="button"
          onClick={demoSignIn}
          className="text-left text-xs font-light text-graphite underline underline-offset-4 hover:text-ink"
        >
          {dict.magic}
        </button>
      )}

      <div className="mt-2 flex flex-col gap-1.5 border-l-2 border-steel bg-mist/70 p-4">
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-steel">{dict.demoTitle}</span>
        <p className="text-sm font-light leading-relaxed text-graphite">{hasBackend ? dict.demoTextBackend : dict.demoText}</p>
      </div>

      <p className="pt-2 text-xs font-light text-graphite">
        {mode === "login" ? dict.noAccount : dict.haveAccount}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
          }}
          className="text-graphite underline underline-offset-4 hover:text-ink"
        >
          {mode === "login" ? dict.register : dict.submit}
        </button>
      </p>
    </form>
  );
}
