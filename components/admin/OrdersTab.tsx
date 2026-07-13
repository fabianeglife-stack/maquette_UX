"use client";

/* Orders tab: KPI strip, search/filter toolbar, Kanban board or list, drawer. */

import { useState } from "react";
import { chf } from "@/lib/engine/pricing";
import { ORDER_FLOW, QUOTE_FLOW, type Order, type OrderStatus } from "@/lib/store";
import { fmt, type Dict } from "@/lib/i18n";
import StatusSteps from "@/components/StatusSteps";
import OrderDrawer from "./OrderDrawer";
import { inputCls, Kpi, STATUS_HUES, TabSkeleton, useOrders, type AdminDict } from "./shared";

type KindFilter = "all" | "order" | "quote";
type SortKey = "newest" | "value";
type OrdersViewMode = "kanban" | "list";

/** Drag-and-drop order board: one column per lifecycle status. */
function KanbanBoard({
  orders,
  statusLabels,
  cfgDict,
  onDrop,
  onOpen,
}: {
  orders: Order[];
  statusLabels: Dict["portal"]["status"];
  cfgDict: Dict["cfg"];
  onDrop: (ref: string, status: OrderStatus) => void;
  onOpen: (ref: string) => void;
}) {
  const [dragRef, setDragRef] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<OrderStatus | null>(null);

  return (
    <div className="flex items-start gap-3 overflow-x-auto pb-2">
      {ORDER_FLOW.map((s) => {
        const col = orders.filter((o) => o.status === s);
        const hue = STATUS_HUES[s];
        const sum = col.reduce((a, o) => a + o.gross, 0);
        return (
          <div
            key={s}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(s);
            }}
            onDragLeave={() => setOverCol((c) => (c === s ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragRef) onDrop(dragRef, s);
              setDragRef(null);
              setOverCol(null);
            }}
            className={`flex w-56 shrink-0 flex-col gap-2 rounded-lg p-2.5 pt-2 transition-colors ${
              overCol === s && dragRef ? "bg-[#dbe3ec] ring-2 ring-inset" : "bg-[#eceef1]"
            }`}
            style={{ borderTop: `3px solid ${hue}`, ...(overCol === s && dragRef ? ({ ["--tw-ring-color" as string]: `${hue}66` } as React.CSSProperties) : {}) }}
          >
            <div className="flex items-baseline justify-between gap-2 px-1 pb-1">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: hue }}>
                {statusLabels[s]}
                <span className="rounded-full bg-white px-1.5 text-[10px] font-bold text-[#5b6069]">{col.length}</span>
              </span>
              {sum > 0 && <span className="whitespace-nowrap text-[10px] text-[#8a8f98]">{Math.round(sum / 1000)}k</span>}
            </div>
            {col.map((o) => (
              <div
                key={o.ref}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  setDragRef(o.ref);
                }}
                onDragEnd={() => {
                  setDragRef(null);
                  setOverCol(null);
                }}
                onClick={() => onOpen(o.ref)}
                className={`cursor-grab rounded-md border border-[#e4e6ea] bg-white p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing ${
                  dragRef === o.ref ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-semibold text-[#1b1e24]">{o.ref}</span>
                  <span className="whitespace-nowrap text-[11px] font-medium text-[#1b1e24]">{chf(o.gross)}</span>
                </div>
                <span className="mt-0.5 block truncate text-[11.5px] text-[#5b6069]">{o.customer.name}</span>
                <span className="block truncate text-[10.5px] text-[#9aa1ac]">
                  {o.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars} · {o.lengthM.toLocaleString("de-CH")} m
                </span>
              </div>
            ))}
            {col.length === 0 && (
              <div className="rounded-md border border-dashed border-[#c9cdd4] py-4 text-center text-[11px] text-[#a8adb6]">—</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OrdersTab({ t, statusLabels, cfgDict, invoiceDict, confirmationDict, locale }: { t: AdminDict; statusLabels: Dict["portal"]["status"]; cfgDict: Dict["cfg"]; invoiceDict: Dict["portal"]["invoice"]; confirmationDict: Dict["portal"]["confirmation"]; locale?: string }) {
  const { orders, ready, advance, sendQuote, markAccepted, setDeliveryDate } = useOrders();
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<OrdersViewMode>("kanban");
  const [kindF, setKindF] = useState<KindFilter>("all");
  const [statusF, setStatusF] = useState<OrderStatus | "all">("all");
  const [sort, setSort] = useState<SortKey>("newest");

  if (!ready) return <TabSkeleton />;

  // summary metrics over all orders (independent of the active filter)
  const orderList = orders.filter((o) => o.kind === "order");
  const quoteList = orders.filter((o) => o.kind === "quote");
  const done = new Set(["shipped", "invoiced", "paid"]);
  const stats = {
    open: orderList.filter((o) => !done.has(o.status)).length,
    production: orderList.filter((o) => o.status === "production").length,
    invoices: orderList.filter((o) => o.status === "invoiced").length,
    quotes: quoteList.length,
    pipeline:
      orderList.filter((o) => o.status !== "paid").reduce((s, o) => s + o.gross, 0) +
      quoteList.reduce((s, o) => s + (o.quotedGross ?? o.gross), 0),
  };

  const q = search.trim().toLowerCase();
  const filtered = orders
    .filter((o) => (kindF === "all" ? true : o.kind === kindF))
    .filter((o) => (statusF === "all" ? true : o.status === statusF))
    .filter((o) =>
      q === "" ? true : `${o.ref} ${o.customer.name} ${o.customer.city}`.toLowerCase().includes(q),
    )
    .sort((a, b) => (sort === "value" ? b.gross - a.gross : a.createdAt < b.createdAt ? 1 : -1));

  const allStatuses = [...ORDER_FLOW, ...QUOTE_FLOW];
  const selected = orders.find((o) => o.ref === openRef) ?? null;

  return (
    <div className="flex flex-col gap-6">
      {/* summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label={t.orders.openOrders} value={String(stats.open)} hue="#7c3aed" icon="orders" />
        <Kpi label={t.orders.inProduction} value={String(stats.production)} hue="#ea580c" icon="production" />
        <Kpi label={t.orders.openInvoices} value={String(stats.invoices)} hue="#4f46e5" icon="invoices" />
        <Kpi label={t.orders.openQuotes} value={String(stats.quotes)} hue="#2563eb" icon="pricing" />
        <Kpi label={t.orders.pipelineValue} value={chf(stats.pipeline)} hue="#16a34a" icon="dashboard" />
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.orders.search}
          className={`${inputCls} min-w-[200px] flex-1`}
        />
        <div className="flex gap-px bg-hairline">
          {(
            [
              { v: "all", l: t.orders.filterAll },
              { v: "order", l: t.orders.filterOrders },
              { v: "quote", l: t.orders.filterQuotes },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setKindF(o.v)}
              className={`px-3 py-2 text-[11px] uppercase tracking-[0.12em] transition-colors ${
                kindF === o.v ? "bg-ink text-paper" : "bg-paper text-graphite hover:text-ink"
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>
        <select value={statusF} onChange={(e) => setStatusF(e.target.value as OrderStatus | "all")} className={inputCls}>
          <option value="all">{t.orders.allStatuses}</option>
          {allStatuses.map((s) => (
            <option key={s} value={s}>
              {statusLabels[s]}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={inputCls}>
          <option value="newest">{t.orders.sortNewest}</option>
          <option value="value">{t.orders.sortValue}</option>
        </select>
        <div className="flex overflow-hidden rounded-md border border-[#d6d9de]">
          {(
            [
              { v: "kanban", l: t.orders.viewKanban },
              { v: "list", l: t.orders.viewList },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setView(o.v)}
              className={`px-3 py-2 text-[11px] font-medium uppercase tracking-[0.1em] transition-colors ${
                view === o.v ? "bg-[#1b1e24] text-white" : "bg-white text-[#5b6069] hover:text-[#1b1e24]"
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {/* board: drag a card into the next column to advance the order */}
      {view === "kanban" && kindF !== "quote" && (
        <>
          <KanbanBoard
            orders={filtered.filter((o) => o.kind === "order")}
            statusLabels={statusLabels}
            cfgDict={cfgDict}
            onDrop={advance}
            onOpen={setOpenRef}
          />
          {filtered.some((o) => o.kind === "quote") && (
            <button
              type="button"
              onClick={() => setKindF("quote")}
              className="self-start text-[12px] text-[#2563eb] underline-offset-4 hover:underline"
            >
              {fmt(t.orders.kanbanQuotes, { n: filtered.filter((o) => o.kind === "quote").length })} ›
            </button>
          )}
        </>
      )}

      {/* rows */}
      {(view === "list" || kindF === "quote") && (filtered.length === 0 ? (
        <p className="border border-dashed border-hairline p-8 text-center text-sm font-light text-stone">{t.orders.empty}</p>
      ) : (
        <div className="flex flex-col border-t border-hairline">
          {filtered.map((o) => {
            const flow = o.kind === "order" ? ORDER_FLOW : QUOTE_FLOW;
            return (
              <button
                key={o.ref}
                type="button"
                onClick={() => setOpenRef(o.ref)}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline py-3.5 pr-2 text-left transition-colors hover:bg-mist/50"
              >
                <span className="flex w-[112px] shrink-0 flex-col gap-1">
                  <span className="whitespace-nowrap text-sm text-ink">{o.ref}</span>
                  <span
                    className={`w-fit border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] ${
                      o.kind === "order" ? "border-ink/40 text-ink" : "border-steel/50 text-steel"
                    }`}
                  >
                    {t.kind[o.kind]}
                  </span>
                </span>
                <span className="min-w-[130px] flex-1 text-sm font-light text-graphite">
                  {o.customer.name}
                  <span className="block text-xs text-stone">{o.customer.city}</span>
                </span>
                <span className="hidden w-[170px] text-sm font-light text-graphite lg:block">
                  {o.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars} · {o.lengthM.toLocaleString("de-CH")} m
                </span>
                <span className="w-[100px] whitespace-nowrap text-sm text-ink">{chf(o.gross)}</span>
                <span className="ml-auto shrink-0">
                  <StatusSteps status={o.status} flow={flow} labels={statusLabels} showLabel={false} />
                </span>
              </button>
            );
          })}
        </div>
      ))}

      {selected && (
        <OrderDrawer
          order={selected}
          t={t}
          statusLabels={statusLabels}
          cfgDict={cfgDict}
          invoiceDict={invoiceDict}
          confirmationDict={confirmationDict}
          locale={locale}
          onClose={() => setOpenRef(null)}
          advance={advance}
          sendQuote={sendQuote}
          markAccepted={markAccepted}
          setDeliveryDate={setDeliveryDate}
        />
      )}
    </div>
  );
}
