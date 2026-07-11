"use client";

/* Overview tab: KPIs, revenue chart, status/system breakdowns, recent orders. */

import { chf } from "@/lib/engine/pricing";
import { ORDER_FLOW, type Order } from "@/lib/store";
import type { Dict } from "@/lib/i18n";
import { Kpi, StatusChip, STATUS_HUES, TabSkeleton, useOrders, type AdminDict } from "./shared";

function BarRow({ label, value, max, display, hue }: { label: string; value: number; max: number; display: string; hue?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 truncate text-[12px] text-[#5b6069]">{label}</span>
      <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-[#eef0f3]">
        <div className="h-full rounded-full" style={{ width: `${(value / max) * 100}%`, background: hue ?? "#45453f" }} />
      </div>
      <span className="w-24 shrink-0 text-right text-[12px] font-medium text-[#1b1e24]">{display}</span>
    </div>
  );
}

/** Revenue per month (last 6), simple SVG column chart. */
function RevenueChart({ orders, title }: { orders: Order[]; title: string }) {
  const months: { key: string; label: string; v: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toISOString().slice(0, 7);
    months.push({ key, label: key.slice(5), v: 0 });
  }
  orders.forEach((o) => {
    const m = months.find((x) => x.key === o.createdAt.slice(0, 7));
    if (m) m.v += o.gross;
  });
  const max = Math.max(1, ...months.map((m) => m.v));
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[#e4e6ea] bg-white p-5 shadow-sm">
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8a8f98]">{title}</span>
      <svg viewBox="0 0 300 120" className="h-auto w-full">
        {months.map((m, i) => {
          const h = Math.max(2, (m.v / max) * 88);
          const x = 14 + i * 48;
          return (
            <g key={m.key}>
              <rect x={x} y={100 - h} width={30} height={h} rx="3" fill={m.v > 0 ? "#2563eb" : "#e5e7eb"} opacity={m.v > 0 ? 0.9 : 1} />
              {m.v > 0 && (
                <text x={x + 15} y={95 - h} fontSize="8" textAnchor="middle" fill="#5b6069">
                  {Math.round(m.v / 1000)}k
                </text>
              )}
              <text x={x + 15} y={113} fontSize="8.5" textAnchor="middle" fill="#8a8f98">
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function DashboardTab({
  t,
  statusLabels,
  cfgDict,
}: {
  t: AdminDict;
  statusLabels: Dict["portal"]["status"];
  cfgDict: Dict["cfg"];
}) {
  const { orders, ready } = useOrders();
  if (!ready) return <TabSkeleton />;

  const real = orders.filter((o) => o.kind === "order");
  const quotes = orders.filter((o) => o.kind === "quote");
  const revenue = real.reduce((s, o) => s + o.gross, 0);
  const openOrders = real.filter((o) => !["shipped", "invoiced", "paid"].includes(o.status)).length;

  const byStatus = ORDER_FLOW.map((s) => ({ s, n: real.filter((o) => o.status === s).length }));
  const maxN = Math.max(1, ...byStatus.map((x) => x.n));
  const bySystem = (["bars", "glass"] as const).map((sys) => ({
    sys,
    v: real.filter((o) => o.system === sys).reduce((s, o) => s + o.gross, 0),
  }));
  const maxV = Math.max(1, ...bySystem.map((x) => x.v));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={t.dash.revenue} value={chf(revenue)} hue="#16a34a" icon="invoices" />
        <Kpi label={t.dash.openOrders} value={String(openOrders)} hue="#ea580c" icon="production" />
        <Kpi label={t.dash.openQuotes} value={String(quotes.length)} hue="#2563eb" icon="orders" />
        <Kpi label={t.dash.avgOrder} value={real.length ? chf(revenue / real.length) : "—"} hue="#7c3aed" icon="pricing" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <RevenueChart orders={real} title={t.dash.months} />
        <div className="flex flex-col gap-3 rounded-lg border border-[#e4e6ea] bg-white p-5 shadow-sm">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8a8f98]">{t.dash.byStatus}</span>
          {byStatus.map((x) => (
            <BarRow key={x.s} label={statusLabels[x.s]} value={x.n} max={maxN} display={String(x.n)} hue={STATUS_HUES[x.s]} />
          ))}
        </div>
        <div className="flex flex-col gap-3 rounded-lg border border-[#e4e6ea] bg-white p-5 shadow-sm">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8a8f98]">{t.dash.bySystem}</span>
          {bySystem.map((x) => (
            <BarRow
              key={x.sys}
              label={x.sys === "glass" ? cfgDict.systemGlass : cfgDict.systemBars}
              value={x.v}
              max={maxV}
              display={chf(x.v)}
              hue={x.sys === "glass" ? "#0d9488" : "#2563eb"}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col rounded-lg border border-[#e4e6ea] bg-white p-5 shadow-sm">
        <span className="pb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8a8f98]">{t.dash.recent}</span>
        {orders.slice(0, 6).map((o) => (
          <div key={o.ref} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-[#eef0f3] py-2.5">
            <span className="w-24 text-[13px] font-semibold text-[#1b1e24]">{o.ref}</span>
            <span className="flex-1 truncate text-[13px] text-[#5b6069]">
              {o.customer.name} · {o.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars} · {o.lengthM.toLocaleString("de-CH")} m
            </span>
            <StatusChip status={o.status} label={statusLabels[o.status]} />
            <span className="w-28 text-right text-[13px] font-medium text-[#1b1e24]">{chf(o.gross)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
