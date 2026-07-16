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
import { invoicesFor, reminderLevel, type Instalment, type InstalmentState } from "@/lib/engine/invoicing";
import { loadEvents, type Order, type OrderEvent } from "@/lib/store";
import { hasBackend, type ApiOrder } from "@/lib/api";
import type { Dict } from "@/lib/i18n";
import { downloadInvoicePdf } from "@/components/portal/invoice";
import OrderDrawer from "./OrderDrawer";
import { Kpi, TabSkeleton, useOrders, type AdminDict } from "./shared";

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
  locale,
}: {
  t: AdminDict;
  statusLabels: Dict["portal"]["status"];
  cfgDict: Dict["cfg"];
  invoiceDict: Dict["portal"]["invoice"];
  confirmationDict: Dict["portal"]["confirmation"];
  quoteDict: Dict["portal"]["quote"];
  locale?: string;
}) {
  const { orders, ready, advance, sendQuote, markAccepted, setDeliveryDate, markPaid, cancel, remind } = useOrders();
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

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

  const shown = rows.filter((r) =>
    filter === "all"
      ? true
      : filter === "paid"
        ? r.inv.state === "paid"
        : filter === "overdue"
          ? r.inv.state === "overdue"
          : r.inv.state === "sent" || r.inv.state === "overdue",
  );

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

      {/* filters */}
      <div className="flex gap-px self-start bg-hairline">
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
                      {(inv.state === "sent" || inv.state === "overdue") && (
                        <>
                          <button
                            type="button"
                            onClick={() => markPaid(order, inv.kind === "balance" ? "balance" : "deposit")}
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
                      )}
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
          setDeliveryDate={setDeliveryDate}
          cancel={cancel}
        />
      )}
    </div>
  );
}
