"use client";

/*
 * Shared vocabulary of the admin ERP: status hues, chips, icons, KPI tiles,
 * the tab loading skeleton, and the order-book hook used by every view that
 * lists or mutates orders. Extracted from the former AdminApp monolith.
 */

import { useCallback, useEffect, useState } from "react";
import { api, hasBackend } from "@/lib/api";
import { notify } from "@/lib/toast";
import {
  acceptQuote,
  cancelOrder,
  loadOrders,
  logEvent,
  ORDER_FLOW,
  QUOTE_VALID_DAYS,
  updateOrder,
  updateOrderStatus,
  type Order,
  type OrderStatus,
} from "@/lib/store";
import { paymentPlan } from "@/lib/engine/pricing";
import { paidField } from "@/lib/engine/invoicing";
import type { Dict } from "@/lib/i18n";

export type AdminDict = Dict["admin"];

export const inputCls =
  "border border-hairline bg-paper px-3 py-2 text-sm font-light text-ink outline-none transition-colors placeholder:text-stone focus:border-graphite";

/* ---------- ERP visual vocabulary (branding-free zone) ---------- */

/** One colour per lifecycle status, used across chips, bars and charts. */
export const STATUS_HUES: Record<OrderStatus, string> = {
  quote_requested: "#d97706",
  quoted: "#2563eb",
  new: "#7c3aed",
  confirmed: "#0284c7",
  production: "#ea580c",
  shipped: "#0d9488",
  invoiced: "#4f46e5",
  paid: "#16a34a",
  cancelled: "#6b7280",
};

export function StatusChip({ status, label }: { status: OrderStatus; label: string }) {
  const hue = STATUS_HUES[status] ?? "#6b7280";
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
      style={{ color: hue, borderColor: `${hue}55`, background: `${hue}14` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: hue }} />
      {label}
    </span>
  );
}

/** Minimal stroke icon set for the ERP sidebar and KPI tiles. */
export function NavIcon({ name }: { name: string }) {
  const p: Record<string, React.ReactNode> = {
    dashboard: <path d="M2 2h5v5H2zM9 2h5v3H9zM9 7h5v7H9zM2 9h5v5H2z" />,
    orders: <path d="M3 2h8l2 2v10H3zM6 7h6M6 10h6M6 4h3" />,
    invoices: <path d="M4 1h8v14l-2-1.4L8 15l-2-1.4L4 15zM6 5h4M6 8h4" />,
    customers: <path d="M5.5 6.5a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6zM1.5 14c0-2.7 1.8-4.4 4-4.4s4 1.7 4 4.4M11 6.2a2 2 0 1 0-.6-3.9M10.7 9.8c1.9.2 3.4 1.7 3.4 4.2" />,
    production: <path d="M2 14V8l4 2.5V8l4 2.5V4l4-1.5V14zM2 14h12" />,
    logistics: <path d="M1.5 3.5H9v7H1.5zM9 6h3l2.5 2.5V10.5H9zM4 13.2a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8zM11.5 13.2a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8z" />,
    products: <path d="M8 1.5 14 5v6l-6 3.5L2 11V5zM2 5l6 3.5L14 5M8 8.5V15" />,
    pricing: <path d="M8.5 1.5H14v5.5L7 14.5 1.5 9zM11 5.2a.8.8 0 1 0 0-1.6.8.8 0 0 0 0 1.6z" />,
    content: <path d="M2 2.5h12v11H2zM2 10l3.5-3 3 2.5 2.5-2 3 2.5M10.5 6.2a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />,
  };
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      {p[name] ?? p.dashboard}
    </svg>
  );
}

export function Kpi({ label, value, hue, icon, sub }: { label: string; value: string; hue: string; icon: string; sub?: string }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-[#e4e6ea] bg-white p-4 shadow-sm">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: `${hue}18`, color: hue }}>
        <NavIcon name={icon} />
      </span>
      <div className="min-w-0">
        <span className="block truncate text-[11px] font-medium uppercase tracking-[0.1em] text-[#8a8f98]">{label}</span>
        <span className="block text-xl font-semibold tracking-tight text-[#1b1e24]">{value}</span>
        {sub && <span className="block text-[11px] text-[#8a8f98]">{sub}</span>}
      </div>
    </div>
  );
}

/** Pulse placeholder shown while a tab's chunk loads or its first fetch runs. */
export function TabSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-lg border border-[#e4e6ea] bg-white/60" />
      ))}
    </div>
  );
}

/* ---------- order book ---------- */

/**
 * The order list plus its three lifecycle mutations, shared by the dashboard,
 * orders and ops views (previously duplicated verbatim in two of them).
 * Failures surface through the toast bus; `ready` gates loading skeletons.
 */
export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    if (hasBackend) {
      api
        .listOrders()
        .then(setOrders)
        .catch(() => {
          setOrders([]);
          notify("loadFailed");
        })
        .finally(() => setReady(true));
    } else {
      setOrders(loadOrders());
      setReady(true);
    }
  }, []);
  useEffect(refresh, [refresh]);

  /** Resolves true when the transition was applied (drives success notices). */
  const advance = (ref: string, status: OrderStatus): Promise<boolean> => {
    if (hasBackend) {
      return api
        .patchOrder(ref, { status })
        .then(() => {
          refresh();
          return true;
        })
        .catch(() => {
          notify("saveFailed");
          return false;
        });
    }
    const o = loadOrders().find((x) => x.ref === ref);
    updateOrderStatus(ref, status);
    // Mirror the backend's invoice-dispatch hooks in the static prototype.
    if (o && o.kind === "order") {
      const split = paymentPlan(o.quotedGross ?? o.gross).split;
      if (status === "confirmed") logEvent(ref, split ? "deposit_sent" : "invoice_sent", o.customer.email);
      if (status === "shipped" && split) logEvent(ref, "balance_sent", o.customer.email);
    }
    refresh();
    return Promise.resolve(true);
  };

  const sendQuote = (o: Order, value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    if (hasBackend) {
      api.patchOrder(o.ref, { quotedGross: value }).then(refresh).catch(() => notify("saveFailed"));
      return;
    }
    // The binding quote carries a validity window from the day it is sent.
    const validUntil = new Date(Date.now() + QUOTE_VALID_DAYS * 86400000).toISOString().slice(0, 10);
    updateOrder(o.ref, { status: "quoted", quotedGross: value, validUntil });
    logEvent(o.ref, "quoted", o.customer.email);
    refresh();
  };

  // Withdraw an order in review / decline a quote (terminal "cancelled").
  const cancel = (o: Order) => {
    if (hasBackend) {
      api.patchOrder(o.ref, { cancel: true }).then(refresh).catch(() => notify("saveFailed"));
      return;
    }
    cancelOrder(o.ref);
    refresh();
  };

  // Admin accepts a binding quote on the customer's behalf (e.g. by phone).
  const markAccepted = (o: Order) => {
    if (hasBackend) {
      api.patchOrder(o.ref, { accept: true }).then(refresh).catch(() => notify("saveFailed"));
      return;
    }
    acceptQuote(o.ref);
    refresh();
  };

  // Estimated delivery date. Entering it on an order in review IS the
  // confirmation: the order moves to "confirmed" and the confirmation goes
  // out to the customer. Resolves true when that dispatch happened.
  const setDeliveryDate = (ref: string, deliveryDate: string): Promise<boolean> => {
    const o = orders.find((x) => x.ref === ref);
    const confirmNow = o?.kind === "order" && o.status === "new";
    if (hasBackend) {
      return api
        .patchOrder(ref, { deliveryDate })
        .then(() => {
          refresh();
          return confirmNow ?? false;
        })
        .catch(() => {
          notify("saveFailed");
          return false;
        });
    }
    updateOrder(ref, { deliveryDate, ...(confirmNow ? { status: "confirmed" as OrderStatus } : {}) });
    if (confirmNow && o) logEvent(ref, "confirmed", o.customer.email);
    refresh();
    return Promise.resolve(confirmNow ?? false);
  };

  // Record a payment on the deposit/full or balance invoice; once fully
  // collected and delivered, the order reaches "paid".
  const markPaid = (o: Order, which: "deposit" | "balance") => {
    if (hasBackend) {
      api.patchOrder(o.ref, { markPaid: which }).then(refresh).catch(() => notify("saveFailed"));
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const patch: Partial<Order> = { [paidField(which)]: today };
    const split = paymentPlan(o.quotedGross ?? o.gross).split;
    const allPaid = split
      ? (which === "deposit" || Boolean(o.depositPaidAt)) && (which === "balance" || Boolean(o.balancePaidAt))
      : which === "deposit" || Boolean(o.depositPaidAt);
    const delivered = ORDER_FLOW.indexOf(o.status) >= ORDER_FLOW.indexOf("shipped");
    if (allPaid && delivered) patch.status = "paid";
    updateOrder(o.ref, patch);
    if (allPaid && delivered) logEvent(o.ref, "paid", o.customer.email);
    refresh();
  };

  // Dunning: record a payment reminder for an issued, unpaid instalment.
  const remind = (o: Order, which: "deposit" | "balance") => {
    if (hasBackend) {
      api.patchOrder(o.ref, { remind: which }).then(refresh).catch(() => notify("saveFailed"));
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const reminders = { ...o.reminders, [which]: [...(o.reminders?.[which] ?? []), today] };
    updateOrder(o.ref, { reminders });
    logEvent(o.ref, "reminder_sent", o.customer.email);
    refresh();
  };

  return { orders, ready, refresh, advance, sendQuote, markAccepted, setDeliveryDate, markPaid, cancel, remind };
}
