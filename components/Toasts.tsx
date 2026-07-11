"use client";

import { useEffect, useState } from "react";
import { subscribe, type Toast, type ToastKind } from "@/lib/toast";

const EXPIRE_MS = 6000;

/**
 * Fixed bottom-right stack of dismissible failure notices fed by lib/toast.
 * Mounted once per app surface (admin, portal) with labels localized by the
 * server component that renders it.
 */
export default function Toasts({ labels }: { labels: Record<ToastKind, string> & { close: string } }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const off = subscribe((t) => {
      setToasts((xs) => [...xs, t]);
      timers.push(setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== t.id)), EXPIRE_MS));
    });
    return () => {
      off();
      timers.forEach(clearTimeout);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex w-72 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          className="flex items-start justify-between gap-3 border border-alert/40 bg-paper p-3 shadow-lg"
        >
          <p className="text-xs font-light leading-relaxed text-ink">
            <span className="font-medium text-alert">{labels[t.kind]}</span>
            {t.detail && <span className="mt-0.5 block text-stone">{t.detail}</span>}
          </p>
          <button
            type="button"
            aria-label={labels.close}
            onClick={() => setToasts((xs) => xs.filter((x) => x.id !== t.id))}
            className="text-sm leading-none text-stone transition-colors hover:text-ink"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
