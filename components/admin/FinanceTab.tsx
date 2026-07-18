"use client";

/*
 * Finance station: the money view over the order book. Every order fans out
 * into its invoice instalments (deposit + balance, or a single full invoice)
 * via the invoicing engine; the ledger tracks each one's issue/due date and
 * payment state, and staff record payments here. KPIs sum billed, collected,
 * outstanding and overdue across all instalments.
 */

import { useMemo, useState } from "react";
import { chf } from "@/lib/engine/pricing";
import { agingBuckets, invoicesFor, reminderLevel, type Instalment, type InstalmentState } from "@/lib/engine/invoicing";
import { loadEvents, type Order, type OrderEvent } from "@/lib/store";
import { hasBackend, type ApiOrder } from "@/lib/api";
import type { Dict } from "@/lib/i18n";
import { downloadInvoicePdf } from "@/components/portal/invoice";
import { downloadReminderPdf } from "@/components/portal/reminder";
import OrderDrawer from "./OrderDrawer";
import { inputCls, Kpi, TabSkeleton, useOrders, type AdminDict } from "./shared";

const STATE_HUE: Record<InstalmentState, string> = {
  pending: "#8a8f98",
  sent: "#4f46e5",
  paid: "#16a34a",
  overdue: "#dc2626",
};

function StateChip({ state, label }: { state: InstalmentState; label: string }) {
  const hue = STATE_HUE[state];
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

type Filter = "all" | "toCollect" | "overdue" | "paid";

export default function FinanceTab({
  t,
  statusLabels,
  cfgDict,
  invoiceDict,
  confirmationDict,
  quoteDict,
  reminderDict,
  locale,
}: {
  t: AdminDict;
  statusLabels: Dict["portal"]["status"];
  cfgDict: Dict["cfg"];
  invoiceDict: Dict["portal"]["invoice"];
  confirmationDict: Dict["portal"]["confirmation"];
  quoteDict: Dict["portal"]["quote"];
  reminderDict: Dict["portal"]["reminder"];
  locale?: string;
}) {
  const { orders, ready, advance, sendQuote, markAccepted, sendPlans, setDeliveryDate, markPaid, cancel, remind } = useOrders();
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  // Inline payment-date capture: key of the instalment being collected.
  const [payKey, setPayKey] = useState<string | null>(null);
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));

  const eventsOf = (o: Order): OrderEvent[] => (hasBackend ? ((o as ApiOrder).events ?? []) : loadEvents(o.ref));

  // Flatten the order book into invoice instalments.
  const rows = useMemo(
    () =>
      orders
        .filter((o) => o.kind === "order")
        .flatMap((o) => invoicesFor(o, eventsOf(o)).map((inv) => ({ order: o, inv })))
        .sort((a, b) => {
          const rank = (s: InstalmentState) => (s === "overdue" ? 0 : s === "sent" ? 1 : s === "pending" ? 2 : 3);
          const dr = rank(a.inv.state) - rank(b.inv.state);
          return dr !== 0 ? dr : (a.inv.dueDate ?? "9999") < (b.inv.dueDate ?? "9999") ? -1 : 1;
        }),
    [orders],
  );

  if (!ready) return <TabSkeleton />;

  const issued = rows.filter((r) => r.inv.state !== "pending");
  const kpis = {
    billed: issued.reduce((s, r) => s + r.inv.amount, 0),
    collected: rows.filter((r) => r.inv.state === "paid").reduce((s, r) => s + r.inv.amount, 0),
    outstanding: issued.filter((r) => r.inv.state !== "paid").reduce((s, r) => s + r.inv.amount, 0),
    overdue: rows.filter((r) => r.inv.state === "overdue").reduce((s, r) => s + r.inv.amount, 0),
  };

  // Receivables aging over the whole book (independent of the active filter).
  const aging = agingBuckets(rows.map((r) => r.inv));
  const agingHue: Record<string, string> = { current: "#4f46e5", d30: "#d97706", d60: "#ea580c", d90: "#dc2626", d90plus: "#991b1b" };

  const needle = q.trim().toLowerCase();
  const shown = rows
    .filter((r) =>
      filter === "all"
        ? true
        : filter === "paid"
          ? r.inv.state === "paid"
          : filter === "overdue"
            ? r.inv.state === "overdue"
            : r.inv.state === "sent" || r.inv.state === "overdue",
    )
    .filter((r) => (needle === "" ? true : `${r.inv.no} ${r.order.ref} ${r.order.customer.name}`.toLowerCase().includes(needle)));

  // Ledger export (the filtered view) as CSV, for accounting hand-off.
  const exportCsv = () => {
    const head = [t.finance.colState, t.finance.colNo, t.finance.colOrder, t.customers.name, t.finance.colType, t.finance.colAmount, t.finance.colIssued, t.finance.colDue, t.finance.paidAtCol, t.finance.colReminders];
    const lines = shown.map(({ order, inv }) =>
      [t.finance.states[inv.state], inv.no, order.ref, order.customer.name, t.finance.types[inv.kind], inv.amount.toFixed(2), inv.issuedAt ?? "", inv.dueDate ?? "", inv.paidAt ?? "", inv.reminders.join(" ")]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob(["﻿" + [head.map((h) => `"${h}"`).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `axioform-finance-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selected = orders.find((o) => o.ref === openRef) ?? null;
  const systemName = (o: Order) => (o.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars);

  return (
    <div className="flex flex-col gap-6">
      {/* money KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t.finance.kpiBilled} value={chf(kpis.billed)} hue="#4f46e5" icon="invoices" />
        <Kpi label={t.finance.kpiCollected} value={chf(kpis.collected)} hue="#16a34a" icon="pricing" />
        <Kpi label={t.finance.kpiOutstanding} value={chf(kpis.outstanding)} hue="#d97706" icon="orders" />
        <Kpi label={t.finance.kpiOverdue} value={chf(kpis.overdue)} hue="#dc2626" icon="dashboard" />
      </div>

      {/* receivables aging — the classic AR report, at a glance */}
      <div className="flex flex-col gap-2 rounded-lg border border-[#e4e6ea] bg-white p-4 shadow-sm">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8a8f98]">{t.finance.agingTitle}</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {aging.map((b) => (
            <div key={b.id} className="flex flex-col gap-0.5 rounded-md border border-[#eceef1] p-2.5" style={{ borderTop: `3px solid ${agingHue[b.id]}` }}>
              <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#8a8f98]">{t.finance.aging[b.id]}</span>
              <span className="text-sm font-semibold text-[#1b1e24]">{chf(b.amount)}</span>
              <span className="text-[10px] text-[#8a8f98]">{b.count} {t.finance.agingCount}</span>
            </div>
          ))}
        </div>
      </div>

      {/* filters + search + export */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-px bg-hairline">
          {(
            [
              { v: "all", l: t.finance.filterAll },
              { v: "toCollect", l: t.finance.filterToCollect },
              { v: "overdue", l: t.finance.filterOverdue },
              { v: "paid", l: t.finance.filterPaid },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setFilter(o.v)}
              className={`px-3 py-2 text-[11px] uppercase tracking-[0.12em] transition-colors ${
                filter === o.v ? "bg-ink text-paper" : "bg-paper text-graphite hover:text-ink"
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.finance.search}
          className={`${inputCls} min-w-[180px] flex-1`}
        />
        <button
          type="button"
          onClick={exportCsv}
          className="border border-hairline px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-graphite transition-colors hover:border-graphite hover:text-ink"
        >
          ↓ {t.finance.exportCsv}
        </button>
      </div>

      {/* invoice ledger */}
      {shown.length === 0 ? (
        <p className="border border-dashed border-hairline p-8 text-center text-sm font-light text-stone">{t.finance.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-[10px] uppercase tracking-[0.12em] text-stone">
                <th className="py-2 pr-3 font-medium">{t.finance.colState}</th>
                <th className="py-2 pr-3 font-medium">{t.finance.colNo}</th>
                <th className="py-2 pr-3 font-medium">{t.finance.colOrder}</th>
                <th className="py-2 pr-3 font-medium">{t.finance.colType}</th>
                <th className="py-2 pr-3 text-right font-medium">{t.finance.colAmount}</th>
                <th className="hidden py-2 pr-3 font-medium sm:table-cell">{t.finance.colIssued}</th>
                <th className="py-2 pr-3 font-medium">{t.finance.colDue}</th>
                <th className="py-2 pr-3 font-medium">{t.finance.colReminders}</th>
                <th className="py-2 font-medium">{t.finance.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ order, inv }) => (
                <tr key={`${order.ref}-${inv.kind}`} className="border-b border-hairline/70 align-middle">
                  <td className="py-2.5 pr-3">
                    <StateChip state={inv.state} label={t.finance.states[inv.state]} />
                  </td>
                  <td className="py-2.5 pr-3 whitespace-nowrap font-light text-graphite">{inv.no}</td>
                  <td className="py-2.5 pr-3">
                    <button
                      type="button"
                      onClick={() => setOpenRef(order.ref)}
                      className="whitespace-nowrap text-ink underline-offset-4 hover:underline"
                    >
                      {order.ref}
                    </button>
                    <span className="block max-w-[160px] truncate text-xs text-stone">{order.customer.name}</span>
                  </td>
                  <td className="py-2.5 pr-3 whitespace-nowrap font-light text-graphite">{t.finance.types[inv.kind]}</td>
                  <td className="py-2.5 pr-3 whitespace-nowrap text-right text-ink">{chf(inv.amount)}</td>
                  <td className="hidden py-2.5 pr-3 whitespace-nowrap font-light text-stone sm:table-cell">{inv.issuedAt ?? "—"}</td>
                  <td className={`py-2.5 pr-3 whitespace-nowrap font-light ${inv.state === "overdue" ? "text-[#dc2626]" : "text-stone"}`}>
                    {inv.dueDate ?? "—"}
                  </td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">
                    {inv.reminders.length === 0 ? (
                      <span className="text-stone">—</span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
                        style={{
                          color: reminderLevel(inv.reminders) >= 3 ? "#dc2626" : "#d97706",
                          borderColor: reminderLevel(inv.reminders) >= 3 ? "#dc262655" : "#d9770655",
                          background: reminderLevel(inv.reminders) >= 3 ? "#dc262614" : "#d9770614",
                        }}
                        title={inv.reminders.join(" · ")}
                      >
                        {t.finance.reminderLevels[reminderLevel(inv.reminders) as 1 | 2 | 3]}
                        <span className="font-normal normal-case text-[#8a8f98]">{inv.reminders[inv.reminders.length - 1]}</span>
                        <button
                          type="button"
                          title={t.finance.reminderLetter}
                          onClick={() =>
                            downloadReminderPdf(
                              order,
                              inv,
                              reminderLevel(inv.reminders) as 1 | 2 | 3,
                              inv.reminders[inv.reminders.length - 1],
                              reminderDict,
                            )
                          }
                          className="font-normal underline-offset-2 hover:underline"
                        >
                          ↓
                        </button>
                      </span>
                    )}
                  </td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={inv.state === "pending"}
                        onClick={() => downloadInvoicePdf(order, invoiceDict, systemName(order), inv)}
                        className="border border-hairline px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-graphite transition-colors hover:border-graphite hover:text-ink disabled:opacity-35"
                      >
                        ↓ {t.finance.download}
                      </button>
                      {(inv.state === "sent" || inv.state === "overdue") &&
                        (payKey === `${order.ref}|${inv.kind}` ? (
                          // Record the payment at its bank value date.
                          <span className="flex items-center gap-1.5">
                            <input
                              type="date"
                              value={payDate}
                              max={new Date().toISOString().slice(0, 10)}
                              onChange={(e) => setPayDate(e.target.value)}
                              className="border border-hairline bg-paper px-1.5 py-0.5 text-[11px] font-light text-ink outline-none focus:border-graphite"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                markPaid(order, inv.kind === "balance" ? "balance" : "deposit", payDate || undefined);
                                setPayKey(null);
                              }}
                              className="border border-[#16a34a]/50 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-[#16a34a] transition-colors hover:bg-[#16a34a] hover:text-white"
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              onClick={() => setPayKey(null)}
                              className="px-1 text-[12px] text-stone hover:text-ink"
                              aria-label={t.orders.close}
                            >
                              ×
                            </button>
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setPayDate(new Date().toISOString().slice(0, 10));
                                setPayKey(`${order.ref}|${inv.kind}`);
                              }}
                              className="border border-[#16a34a]/50 px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-[#16a34a] transition-colors hover:bg-[#16a34a] hover:text-white"
                            >
                              ✓ {t.finance.markPaid}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                window.confirm(t.finance.remindConfirm) && remind(order, inv.kind === "balance" ? "balance" : "deposit")
                              }
                              className="border border-[#d97706]/50 px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-[#d97706] transition-colors hover:bg-[#d97706] hover:text-white"
                            >
                              ✉ {t.finance.remind}
                            </button>
                          </>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <OrderDrawer
          order={selected}
          t={t}
          statusLabels={statusLabels}
          cfgDict={cfgDict}
          invoiceDict={invoiceDict}
          confirmationDict={confirmationDict}
          quoteDict={quoteDict}
          locale={locale}
          onClose={() => setOpenRef(null)}
          advance={advance}
          sendQuote={sendQuote}
          markAccepted={markAccepted}
          sendPlans={sendPlans}
          setDeliveryDate={setDeliveryDate}
          cancel={cancel}
        />
      )}
    </div>
  );
}
