"use client";

import { useState } from "react";
import type { Dict } from "@/lib/i18n";

export default function LoginForm({ dict }: { dict: Dict["login"] }) {
  const [notice, setNotice] = useState(false);

  const inputCls =
    "w-full border border-hairline bg-paper px-4 py-3 text-sm font-light text-ink outline-none transition-colors placeholder:text-stone focus:border-graphite";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setNotice(true);
      }}
      className="flex flex-col gap-4"
    >
      <label className="flex flex-col gap-1.5">
        <span className="label">{dict.email}</span>
        <input type="email" required autoComplete="email" placeholder="name@example.ch" className={inputCls} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label">{dict.password}</span>
        <input type="password" required autoComplete="current-password" placeholder="••••••••" className={inputCls} />
      </label>

      <button
        type="submit"
        className="mt-2 inline-flex items-center justify-center bg-ink px-7 py-3.5 text-xs font-medium uppercase tracking-[0.16em] text-paper transition-colors hover:bg-graphite"
      >
        {dict.submit}
      </button>
      <button
        type="button"
        onClick={() => setNotice(true)}
        className="text-left text-xs font-light text-graphite underline underline-offset-4 hover:text-ink"
      >
        {dict.magic}
      </button>

      {notice && (
        <div role="status" className="mt-2 flex flex-col gap-1.5 border-l-2 border-steel bg-mist/70 p-4">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-steel">{dict.demoTitle}</span>
          <p className="text-sm font-light leading-relaxed text-graphite">{dict.demoText}</p>
        </div>
      )}

      <p className="pt-2 text-xs font-light text-stone">
        {dict.noAccount}{" "}
        <span className="cursor-default text-graphite underline underline-offset-4">{dict.register}</span>
      </p>
    </form>
  );
}
