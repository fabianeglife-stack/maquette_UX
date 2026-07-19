"use client";

/* Orders tab: KPI strip, search/filter toolbar, Kanban board or list, drawer. */

import { useState } from "react";
import { chf } from "@/lib/engine/pricing";
import { isLate, MILESTONE_FIELD, ORDER_FLOW, QUOTE_FLOW, type Order, type OrderStatus } from "@/lib/store";
import { fmt, type Dict } from "@/lib/i18n";
import StatusSteps from "@/components/StatusSteps";
import OrderDrawer from "./OrderDrawer";
import { inputCls, Kpi, LateBadge, STATUS_HUES, TabSkeleton, useOrders, type AdminDict } from "./shared";

type KindFilter = "all" | "order" | "quote";
type SortKey = "newest" | "value";
type OrdersViewMode = "kanban" | "list";

/** Hue of the derived procurement (Achats) column — distinct from the statuses. */
const PROCUREMENT_HUE = "#0e7490";

/** Small ✓/⌛ progress pill for a procurement milestone on a board card. */
function ProgressPill({ label, done }: { label: string; done: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-sm px-1 py-px text-[9px] font-medium ${
        done ? "bg-[#0e7490]/12 text-[#0e7490]" : "bg-[#eceef1] text-[#9aa1ac]"
      }`}
    >
      {done ? "✓" : "⌛"} {label}
    </span>
  );
}

/**
 * Drag-and-drop order board. Columns follow the process phases: the linear
 * statuses plus a derived "procurement" (Achats) column between Confirmée and
 * En production, so the material/treatment purchasing phase is visible. The
 * procurement column is driven by milestones (not a status), so it is a
 * display column — not a drop target; its cards still drag on to production
 * (the server gate enforces the prerequisites).
 */
function KanbanBoard({
  orders,
  t,
  statusLabels,
  cfgDict,
  lateLabel,
  onDrop,
  onOpen,
}: {
  orders: Order[];
  t: AdminDict;
  statusLabels: Dict["portal"]["status"];
  cfgDict: Dict["cfg"];
  lateLabel: string;
  onDrop: (ref: string, status: OrderStatus) => void;
  onOpen: (ref: string) => void;
}) {
  const [dragRef, setDragRef] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  // Procurement is under way once a supplier PO has gone out but the order has
  // not yet advanced to production.
  const inProcurement = (o: Order) => o.status === "confirmed" && Boolean(o.materialOrderedAt || o.treatmentOrderedAt);

  type Column = { key: string; label: string; hue: string; match: (o: Order) => boolean; dropStatus?: OrderStatus };
  const columns: Column[] = [
    { key: "new", label: statusLabels.new, hue: STATUS_HUES.new, match: (o) => o.status === "new", dropStatus: "new" },
    { key: "confirmed", label: statusLabels.confirmed, hue: STATUS_HUES.confirmed, match: (o) => o.status === "confirmed" && !inProcurement(o), dropStatus: "confirmed" },
    { key: "procurement", label: t.tabs.purchasing, hue: PROCUREMENT_HUE, match: inProcurement },
    { key: "production", label: statusLabels.production, hue: STATUS_HUES.production, match: (o) => o.status === "production", dropStatus: "production" },
    { key: "shipped", label: statusLabels.shipped, hue: STATUS_HUES.shipped, match: (o) => o.status === "shipped", dropStatus: "shipped" },
    { key: "invoiced", label: statusLabels.invoiced, hue: STATUS_HUES.invoiced, match: (o) => o.status === "invoiced", dropStatus: "invoiced" },
    { key: "paid", label: statusLabels.paid, hue: STATUS_HUES.paid, match: (o) => o.status === "paid", dropStatus: "paid" },
  ];

  return (
    <div className="flex items-start gap-3 overflow-x-auto pb-2">
      {columns.map((c) => {
        const col = orders.filter(c.match);
        const sum = col.reduce((a, o) => a + o.gross, 0);
        const isTarget = Boolean(c.dropStatus);
        return (
          <div
            key={c.key}
            onDragOver={isTarget ? (e) => { e.preventDefault(); setOverCol(c.key); } : undefined}
            onDragLeave={isTarget ? () => setOverCol((x) => (x === c.key ? null : x)) : undefined}
            onDrop={
              isTarget
                ? (e) => {
                    e.preventDefault();
                    if (dragRef && c.dropStatus) onDrop(dragRef, c.dropStatus);
                    setDragRef(null);
                    setOverCol(null);
                  }
                : undefined
            }
            className={`flex w-56 shrink-0 flex-col gap-2 rounded-lg p-2.5 pt-2 transition-colors ${
              overCol === c.key && dragRef ? "bg-[#dbe3ec] ring-2 ring-inset" : "bg-[#eceef1]"
            }`}
            style={{ borderTop: `3px solid ${c.hue}`, ...(overCol === c.key && dragRef ? ({ ["--tw-ring-color" as string]: `${c.hue}66` } as React.CSSProperties) : {}) }}
          >
            <div className="flex items-baseline justify-between gap-2 px-1 pb-1">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: c.hue }}>
                {c.label}
                <span className="rounded-full bg-white px-1.5 text-[10px] font-bold text-[#5b6069]">{col.length}</span>
              </span>
              {sum > 0 && <span className="whitespace-nowrap text-[10px] text-[#8a8f98]">{Math.round(sum / 1000)}k</span>}
            </div>
            {col.map((o) => {
              const showProgress = c.key === "confirmed" || c.key === "procurement";
              return (
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
                  {isLate(o) && <span className="mt-1 inline-block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#dc2626]">⚠ {lateLabel}</span>}
                  <span className="mt-0.5 block truncate text-[11.5px] text-[#5b6069]">{o.customer.name}</span>
                  <span className="block truncate text-[10.5px] text-[#9aa1ac]">
                    {o.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars} · {o.lengthM.toLocaleString("de-CH")} m
                  </span>
                  {showProgress && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <ProgressPill label={t.orders.boardMaterial} done={Boolean(o[MILESTONE_FIELD.material_ordered])} />
                      <ProgressPill label={t.orders.boardTreatment} done={Boolean(o[MILESTONE_FIELD.treatment_ordered])} />
                      <ProgressPill label={t.orders.boardReceipt} done={Boolean(o[MILESTONE_FIELD.material_received])} />
                    </div>
                  )}
                </div>
              );
            })}
            {col.length === 0 && (
              <div className="rounded-md border border-dashed border-[#c9cdd4] py-4 text-center text-[11px] text-[#a8adb6]">—</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OrdersTab({ t, statusLabels, cfgDict, invoiceDict, confirmationDict, quoteDict, locale }: { t: AdminDict; statusLabels: Dict["portal"]["status"]; cfgDict: Dict["cfg"]; invoiceDict: Dict["portal"]["invoice"]; confirmationDict: Dict["portal"]["confirmation"]; quoteDict: Dict["portal"]["quote"]; locale?: string }) {
  const { orders, ready, advance, sendQuote, markAccepted, sendPlans, markMilestone, setShipping, setDeliveryDate, cancel } = useOrders();
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<OrdersViewMode>("kanban");
  const [kindF, setKindF] = useState<KindFilter>("all");
  const [statusF, setStatusF] = useState<OrderStatus | "all">("all");
  const [sort, setSort] = useState<SortKey>("newest");

  if (!ready) return <TabSkeleton />;

  // summary metrics over all orders (independent of the active filter);
  // cancelled records don't count towards workload or pipeline value
  const orderList = orders.filter((o) => o.kind === "order" && o.status !== "cancelled");
  const quoteList = orders.filter((o) => o.kind === "quote" && o.status !== "cancelled");
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

  const allStatuses: OrderStatus[] = [...ORDER_FLOW, ...QUOTE_FLOW, "cancelled"];
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
            t={t}
            statusLabels={statusLabels}
            cfgDict={cfgDict}
            lateLabel={t.orders.late}
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
                  <span className="flex flex-wrap items-center gap-1">
                    <span
                      className={`w-fit border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] ${
                        o.kind === "order" ? "border-ink/40 text-ink" : "border-steel/50 text-steel"
                      }`}
                    >
                      {t.kind[o.kind]}
                    </span>
                    {isLate(o) && <LateBadge label={t.orders.late} />}
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
          quoteDict={quoteDict}
          locale={locale}
          onClose={() => setOpenRef(null)}
          advance={advance}
          sendQuote={sendQuote}
          markAccepted={markAccepted}
          sendPlans={sendPlans}
          markMilestone={markMilestone}
          setShipping={setShipping}
          setDeliveryDate={setDeliveryDate}
          cancel={cancel}
        />
      )}
    </div>
  );
}
