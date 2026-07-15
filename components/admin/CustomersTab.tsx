"use client";

/*
 * Customers tab: aggregated order book per customer + trade-tier assignment.
 * Clicking a customer opens a read-only detail drawer with their full order
 * and quote history (the staff order book filtered by email).
 */

import { useEffect, useState } from "react";
import { chf } from "@/lib/engine/pricing";
import { loadOrders, loadTiers, setTier, type Order, type Tier } from "@/lib/store";
import { api, hasBackend } from "@/lib/api";
import { notify } from "@/lib/toast";
import type { Dict } from "@/lib/i18n";
import { StatusChip, TabSkeleton, useOrders, type AdminDict } from "./shared";

interface CustomerRowVM {
  name: string;
  city: string;
  email: string;
  orders: number;
  quotes: number;
  revenue: number;
}

/** Read-only customer sheet: identity, tier, KPIs and order history. */
function CustomerDrawer({
  customer,
  history,
  tier,
  onAssign,
  t,
  statusLabels,
  cfgDict,
  onClose,
}: {
  customer: CustomerRowVM;
  history: Order[];
  tier: Tier;
  onAssign: (tier: Tier) => void;
  t: AdminDict;
  statusLabels: Dict["portal"]["status"];
  cfgDict: Dict["cfg"];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[90] flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col gap-6 overflow-y-auto border-l border-hairline bg-paper p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-lg tracking-[0.02em] text-ink">{customer.name}</span>
            <span className="text-xs font-light text-stone">{customer.city}</span>
            <span className="text-xs font-light text-steel">{customer.email}</span>
          </div>
          <button
            type="button"
            aria-label={t.orders.close}
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center text-xl font-light text-stone transition-colors hover:text-ink"
          >
            ×
          </button>
        </div>

        {/* tier + aggregates */}
        <div className="grid grid-cols-2 gap-3 border border-hairline p-4 text-sm">
          <div>
            <span className="block text-[10px] uppercase tracking-[0.12em] text-stone">{t.customers.tier}</span>
            <select
              value={tier}
              onChange={(e) => onAssign(e.target.value as Tier)}
              className="mt-1 border border-hairline bg-paper px-2 py-1.5 text-xs font-light text-ink outline-none focus:border-graphite"
            >
              {(["standard", "partner", "pro"] as const).map((v) => (
                <option key={v} value={v}>
                  {t.customers.tiers[v]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-[0.12em] text-stone">{t.customers.revenue}</span>
            <span className="text-ink">{chf(customer.revenue)}</span>
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-[0.12em] text-stone">{t.customers.orders}</span>
            <span className="font-light text-graphite">{customer.orders}</span>
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-[0.12em] text-stone">{t.customers.quotes}</span>
            <span className="font-light text-graphite">{customer.quotes}</span>
          </div>
        </div>

        {/* order & quote history */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{t.customers.history}</span>
          {history.length === 0 ? (
            <p className="text-sm font-light text-stone">{t.customers.historyEmpty}</p>
          ) : (
            history.map((o) => (
              <div key={o.ref} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline/70 py-2">
                <StatusChip status={o.status} label={statusLabels[o.status]} />
                <span className="text-[13px] text-ink">{o.ref}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-light text-graphite">
                  {o.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars} · {o.lengthM.toLocaleString("de-CH")} m
                </span>
                <span className="whitespace-nowrap text-[13px] text-ink">{chf(o.quotedGross ?? o.gross)}</span>
                <span className="w-full text-xs font-light text-stone">{o.createdAt} · {t.kind[o.kind]}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function CustomersTab({
  t,
  statusLabels,
  cfgDict,
}: {
  t: AdminDict;
  statusLabels: Dict["portal"]["status"];
  cfgDict: Dict["cfg"];
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [tiers, setTiers] = useState<Record<string, Tier>>({});
  const [apiCustomers, setApiCustomers] = useState<CustomerRowVM[]>([]);
  const [ready, setReady] = useState(false);
  const [openEmail, setOpenEmail] = useState<string | null>(null);
  // Full staff order book, used for the per-customer history drawer.
  const { orders: book } = useOrders();

  const refresh = () => {
    if (hasBackend) {
      api
        .listCustomers()
        .then((cs) => {
          setApiCustomers(cs);
          setTiers(Object.fromEntries(cs.map((c) => [c.email.toLowerCase(), c.tier])));
        })
        .catch(() => {
          setApiCustomers([]);
          notify("loadFailed");
        })
        .finally(() => setReady(true));
    } else {
      setOrders(loadOrders());
      setTiers(loadTiers());
      setReady(true);
    }
  };
  useEffect(refresh, []);

  if (!ready) return <TabSkeleton />;

  const byEmail = new Map<string, CustomerRowVM>();
  orders.forEach((o) => {
    const key = o.customer.email.toLowerCase();
    const c = byEmail.get(key) ?? { name: o.customer.name, city: o.customer.city, email: o.customer.email, orders: 0, quotes: 0, revenue: 0 };
    if (o.kind === "order") {
      c.orders += 1;
      c.revenue += o.gross;
    } else {
      c.quotes += 1;
    }
    byEmail.set(key, c);
  });
  const customers = hasBackend ? apiCustomers : [...byEmail.values()].sort((a, b) => b.revenue - a.revenue);

  const assign = (email: string, tier: Tier) => {
    if (hasBackend) {
      api.setTier(email, tier).then(refresh).catch(() => notify("saveFailed"));
      return;
    }
    setTier(email, tier);
    setTiers(loadTiers());
  };

  const selected = customers.find((c) => c.email.toLowerCase() === openEmail) ?? null;
  const history = selected
    ? book
        .filter((o) => o.customer.email.toLowerCase() === selected.email.toLowerCase())
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-sm font-light leading-relaxed text-graphite">{t.customers.hint}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-ink/50">
              {[t.customers.name, t.customers.contact, t.customers.orders, t.customers.quotes, t.customers.revenue, t.customers.tier].map((h, i) => (
                <th key={i} className="py-3 pr-4 text-[11px] font-medium uppercase tracking-[0.14em] text-stone">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.email} className="border-b border-hairline align-baseline">
                <td className="py-3 pr-4 text-sm text-ink">
                  <button
                    type="button"
                    onClick={() => setOpenEmail(c.email.toLowerCase())}
                    className="text-left underline-offset-4 hover:underline"
                  >
                    {c.name}
                  </button>
                  <span className="block text-xs font-light text-stone">{c.city}</span>
                </td>
                <td className="py-3 pr-4 text-sm font-light text-graphite">{c.email}</td>
                <td className="py-3 pr-4 text-sm font-light text-graphite">{c.orders}</td>
                <td className="py-3 pr-4 text-sm font-light text-graphite">{c.quotes}</td>
                <td className="py-3 pr-4 whitespace-nowrap text-sm font-light text-ink">{chf(c.revenue)}</td>
                <td className="py-3 pr-4">
                  <select
                    value={tiers[c.email.toLowerCase()] ?? "standard"}
                    onChange={(e) => assign(c.email, e.target.value as Tier)}
                    className="border border-hairline bg-paper px-2 py-1.5 text-xs font-light text-ink outline-none focus:border-graphite"
                  >
                    {(["standard", "partner", "pro"] as const).map((v) => (
                      <option key={v} value={v}>
                        {t.customers.tiers[v]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <CustomerDrawer
          customer={selected}
          history={history}
          tier={tiers[selected.email.toLowerCase()] ?? "standard"}
          onAssign={(tier) => assign(selected.email, tier)}
          t={t}
          statusLabels={statusLabels}
          cfgDict={cfgDict}
          onClose={() => setOpenEmail(null)}
        />
      )}
    </div>
  );
}
