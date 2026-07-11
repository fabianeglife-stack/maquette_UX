"use client";

/* Customers tab: aggregated order book per customer + trade-tier assignment. */

import { useEffect, useState } from "react";
import { chf } from "@/lib/engine/pricing";
import { loadOrders, loadTiers, setTier, type Order, type Tier } from "@/lib/store";
import { api, hasBackend } from "@/lib/api";
import { notify } from "@/lib/toast";
import { TabSkeleton, type AdminDict } from "./shared";

export default function CustomersTab({ t }: { t: AdminDict }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [tiers, setTiers] = useState<Record<string, Tier>>({});
  const [apiCustomers, setApiCustomers] = useState<{ name: string; city: string; email: string; orders: number; quotes: number; revenue: number; tier: Tier }[]>([]);
  const [ready, setReady] = useState(false);

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

  const byEmail = new Map<string, { name: string; city: string; email: string; orders: number; quotes: number; revenue: number }>();
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
                  {c.name}
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
    </div>
  );
}
