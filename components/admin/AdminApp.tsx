"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { chf, defaultPriceBook, type PriceBook } from "@/lib/engine/pricing";
import { deriveRailing } from "@/lib/engine/geometry";
import { buildBom } from "@/lib/engine/bom";
import { type TypeProfile } from "@/lib/engine/types";
import {
  acceptQuote,
  invoiceNoFor,
  loadEvents,
  loadOrders,
  loadTiers,
  logEvent,
  mergedAbout,
  ORDER_FLOW,
  projectImages,
  QUOTE_FLOW,
  setTier,
  updateOrder,
  updateOrderStatus,
  type AboutContent,
  type ContentState,
  type HomeContent,
  type Order,
  type OrderEvent,
  type OrderStatus,
  type RefProject,
  type Tier,
  type TypePlans,
} from "@/lib/store";
import {
  fetchAllTypes,
  fetchContent,
  fetchPageContent,
  fetchPriceBook,
  publishPriceBook,
  putContent,
  putPageContent,
  removeType,
  resetPriceBookAll,
  resolveType,
  saveType,
} from "@/lib/data";
import type { Dict } from "@/lib/i18n";
import { api, hasBackend, type ApiOrder } from "@/lib/api";
import Link from "next/link";
import StatusSteps from "@/components/StatusSteps";
import { downloadInvoicePdf } from "@/components/portal/invoice";
import { downloadDeliveryPdf, downloadFabricationPdf, downloadPickingPdf } from "./docs";
import DrawingSVG from "@/components/configurator/DrawingSVG";
import TypeDesigner from "./TypeDesigner";

type AdminDict = Dict["admin"];
type Tab = "dashboard" | "orders" | "customers" | "pricing" | "products" | "content";

/** Fill {placeholders} in an i18n template. */
function fmt(tpl: string, params: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ""));
}

/* ---------- dashboard tab ---------- */

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-2 border border-hairline p-5">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{label}</span>
      <span className="text-2xl font-light tracking-tight text-ink">{value}</span>
    </div>
  );
}

function BarRow({ label, value, max, display }: { label: string; value: number; max: number; display: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-[12px] font-light text-graphite">{label}</span>
      <div className="h-4 flex-1 bg-mist">
        <div className="h-full bg-graphite" style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="w-24 shrink-0 text-right text-[12px] font-light text-ink">{display}</span>
    </div>
  );
}

function DashboardTab({
  t,
  statusLabels,
  cfgDict,
}: {
  t: AdminDict;
  statusLabels: Dict["portal"]["status"];
  cfgDict: Dict["cfg"];
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  useEffect(() => {
    if (hasBackend) api.listOrders().then(setOrders).catch(() => setOrders([]));
    else setOrders(loadOrders());
  }, []);

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
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t.dash.revenue} value={chf(revenue)} />
        <Kpi label={t.dash.openOrders} value={String(openOrders)} />
        <Kpi label={t.dash.openQuotes} value={String(quotes.length)} />
        <Kpi label={t.dash.avgOrder} value={real.length ? chf(revenue / real.length) : "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3 border border-hairline p-5">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{t.dash.byStatus}</span>
          {byStatus.map((x) => (
            <BarRow key={x.s} label={statusLabels[x.s]} value={x.n} max={maxN} display={String(x.n)} />
          ))}
        </div>
        <div className="flex flex-col gap-3 border border-hairline p-5">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{t.dash.bySystem}</span>
          {bySystem.map((x) => (
            <BarRow
              key={x.sys}
              label={x.sys === "glass" ? cfgDict.systemGlass : cfgDict.systemBars}
              value={x.v}
              max={maxV}
              display={chf(x.v)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col border border-hairline p-5">
        <span className="pb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{t.dash.recent}</span>
        {orders.slice(0, 5).map((o) => (
          <div key={o.ref} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-hairline/70 py-2">
            <span className="text-sm text-ink">{o.ref}</span>
            <span className="flex-1 text-sm font-light text-graphite">
              {o.customer.name} · {o.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars} · {o.lengthM.toLocaleString("de-CH")} m
            </span>
            <span className="text-xs font-light text-stone">{statusLabels[o.status]}</span>
            <span className="text-sm font-light text-ink">{chf(o.gross)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- orders tab ---------- */

/** Vertical event timeline (order lifecycle + transactional-email hooks). */
function EventTimeline({ order, t, statusLabels }: { order: Order; t: AdminDict; statusLabels: Dict["portal"]["status"] }) {
  const events = hasBackend ? ((order as ApiOrder).events ?? []) : loadEvents(order.ref);
  const label = (e: OrderEvent) =>
    e.type === "created" ? t.events.created : e.type === "quote_accepted" ? t.events.quote_accepted : statusLabels[e.type];

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{t.events.title}</span>
      {events.length === 0 ? (
        <p className="text-xs font-light text-stone">{t.events.none}</p>
      ) : (
        <ol className="flex flex-col">
          {events.map((e, i) => (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${i === events.length - 1 ? "bg-ink" : "bg-stone"}`} />
                {i < events.length - 1 && <span className="w-px flex-1 bg-hairline" />}
              </div>
              <div className="pb-4">
                <p className="text-[13px] font-light text-graphite">{label(e)}</p>
                <p className="text-xs text-stone">{e.at}</p>
                {e.emailTo && (
                  <p className="text-xs font-light text-steel">
                    ✉ {t.events.emailTo} {e.emailTo}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** BOM list for the order drawer (server-resolved type → geometry → parts). */
function OrderBom({ order, t }: { order: Order; t: AdminDict }) {
  const [types, setTypes] = useState<TypeProfile[]>([]);
  useEffect(() => {
    fetchAllTypes().then(setTypes);
  }, []);
  const tp = order.config && types.length > 0 ? resolveType(types, order.config.typeId, order.config.system) : null;
  const derived = order.config && tp ? deriveRailing(order.config, tp) : null;
  const bom = order.config && tp && derived ? buildBom(order.config, derived, tp) : null;
  const parts: Record<string, string> = t.bom.parts;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{t.bom.title}</span>
      {!bom ? (
        <p className="text-sm font-light text-stone">{t.bom.noBom}</p>
      ) : (
        bom.map((l, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4 border-t border-hairline/70 py-1.5">
            <span className="text-[13px] font-light text-graphite">
              {parts[l.id] ?? l.id}
              {l.detail && <span className="text-stone"> · {l.detail}</span>}
            </span>
            <span className="whitespace-nowrap text-[13px] font-light text-ink">
              {l.qty.toLocaleString("de-CH")} {t.bom.units[l.unit]}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

/** Slide-over order/quote detail: status pipeline + actions, customer, BOM, timeline. */
function OrderDrawer({
  order,
  t,
  statusLabels,
  cfgDict,
  invoiceDict,
  locale,
  onClose,
  advance,
  sendQuote,
  markAccepted,
}: {
  order: Order;
  t: AdminDict;
  statusLabels: Dict["portal"]["status"];
  cfgDict: Dict["cfg"];
  invoiceDict: Dict["portal"]["invoice"];
  locale?: string;
  onClose: () => void;
  advance: (ref: string, status: OrderStatus) => void;
  sendQuote: (o: Order, value: number) => void;
  markAccepted: (o: Order) => void;
}) {
  const [quote, setQuote] = useState(String(Math.round(order.quotedGross ?? order.gross)));
  const flow = order.kind === "order" ? ORDER_FLOW : QUOTE_FLOW;
  const idx = flow.indexOf(order.status);

  // Engine output for the production/logistics documents.
  const svgRef = useRef<SVGSVGElement>(null);
  const [types, setTypes] = useState<TypeProfile[]>([]);
  useEffect(() => {
    fetchAllTypes().then(setTypes);
  }, []);
  const tp = useMemo(
    () => (order.config && types.length > 0 ? resolveType(types, order.config.typeId, order.config.system) : null),
    [order.config, types],
  );
  const derived = useMemo(() => (order.config && tp ? deriveRailing(order.config, tp) : null), [order.config, tp]);
  const bom = useMemo(
    () => (order.config && tp && derived ? buildBom(order.config, derived, tp) : null),
    [order.config, tp, derived],
  );
  const typeName =
    tp?.name?.[locale as "de" | "fr" | "en"] ??
    tp?.name?.de ??
    (order.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars);

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
            <div className="flex items-center gap-2">
              <span className="text-lg tracking-[0.04em] text-ink">{order.ref}</span>
              <span
                className={`border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${
                  order.kind === "order" ? "border-ink/40 text-ink" : "border-steel/50 text-steel"
                }`}
              >
                {t.kind[order.kind]}
              </span>
            </div>
            <span className="text-xs font-light text-stone">{order.createdAt}</span>
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

        {/* status pipeline + action */}
        <div className="flex flex-col gap-3 border border-hairline p-4">
          <StatusSteps status={order.status} flow={flow} labels={statusLabels} />
          {order.kind === "order" ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={idx <= 0}
                onClick={() => advance(order.ref, flow[idx - 1])}
                className="border border-hairline px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-graphite transition-colors hover:border-graphite disabled:opacity-30"
              >
                ‹ {t.orders.stepBack}
              </button>
              <button
                type="button"
                disabled={idx >= flow.length - 1}
                onClick={() => advance(order.ref, flow[idx + 1])}
                className="flex-1 bg-ink px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-paper transition-colors hover:bg-graphite disabled:opacity-30"
              >
                {t.orders.advance} ›
              </button>
            </div>
          ) : order.status === "quote_requested" ? (
            <div className="flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.12em] text-stone">{t.quotedPriceLabel}</span>
                <input
                  type="number"
                  min={1}
                  value={quote}
                  onChange={(e) => setQuote(e.target.value)}
                  className="w-full border border-hairline bg-paper px-2 py-1.5 text-sm font-light text-ink outline-none focus:border-graphite"
                />
              </label>
              <button
                type="button"
                onClick={() => sendQuote(order, Number(quote))}
                className="bg-ink px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-paper transition-colors hover:bg-graphite"
              >
                {t.sendQuote}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-light text-graphite">
                {statusLabels[order.status]} · <span className="text-ink">{chf(order.quotedGross ?? order.gross)}</span>
              </p>
              {order.status === "quoted" && (
                <button
                  type="button"
                  onClick={() => markAccepted(order)}
                  className="border border-ink/40 px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper"
                >
                  {t.orders.markAccepted}
                </button>
              )}
            </div>
          )}
        </div>

        {/* summary line */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="block text-[10px] uppercase tracking-[0.12em] text-stone">{t.table.system}</span>
            <span className="font-light text-graphite">{order.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars} · {order.lengthM.toLocaleString("de-CH")} m</span>
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-[0.12em] text-stone">{t.table.total}</span>
            <span className="text-ink">{chf(order.gross)}</span>
          </div>
        </div>

        {/* customer */}
        <div>
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{t.bom.address}</span>
          <p className="pt-1 text-sm font-light text-graphite">
            {order.customer.name} · {order.customer.street}, {order.customer.city}
            <span className="block text-xs text-stone">{order.customer.email}</span>
          </p>
          {order.payment && <p className="pt-1 text-xs font-light uppercase text-stone">{t.bom.payment}: {order.payment}</p>}
        </div>

        {order.kind === "order" && (order.status === "invoiced" || order.status === "paid") && (
          <div className="flex flex-wrap items-center justify-between gap-3 border border-hairline p-4">
            <div>
              <span className="block text-[10px] uppercase tracking-[0.12em] text-stone">{t.orders.invoiceNo}</span>
              <span className="text-sm text-ink">{invoiceNoFor(order.ref)}</span>
            </div>
            <button
              type="button"
              onClick={() =>
                downloadInvoicePdf(order, invoiceDict, order.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars)
              }
              className="bg-ink px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-paper transition-colors hover:bg-graphite"
            >
              ↓ {t.orders.invoicePdf}
            </button>
          </div>
        )}

        {/* production / logistics / transport documents */}
        {order.kind === "order" && (
          <div className="flex flex-col gap-2 border border-hairline p-4">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{t.docs.title}</span>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={!order.config || !tp || !derived || !bom}
                onClick={() =>
                  order.config &&
                  tp &&
                  derived &&
                  bom &&
                  downloadFabricationPdf(order, order.config, tp, derived, bom, typeName, t.docs, t.bom, cfgDict, svgRef.current)
                }
                className="border border-hairline px-3 py-2 text-left text-[11px] uppercase tracking-[0.12em] text-graphite transition-colors hover:border-graphite hover:text-ink disabled:opacity-35"
              >
                ↓ {t.docs.fabrication}
              </button>
              <button
                type="button"
                disabled={!derived || !bom}
                onClick={() => derived && bom && downloadPickingPdf(order, derived, bom, t.docs, t.bom)}
                className="border border-hairline px-3 py-2 text-left text-[11px] uppercase tracking-[0.12em] text-graphite transition-colors hover:border-graphite hover:text-ink disabled:opacity-35"
              >
                ↓ {t.docs.picking}
              </button>
              <button
                type="button"
                onClick={() => downloadDeliveryPdf(order, typeName, t.docs, derived)}
                className="border border-hairline px-3 py-2 text-left text-[11px] uppercase tracking-[0.12em] text-graphite transition-colors hover:border-graphite hover:text-ink"
              >
                ↓ {t.docs.delivery}
              </button>
            </div>
            {!order.config && <p className="text-xs font-light text-stone">{t.docs.needConfig}</p>}
          </div>
        )}

        <OrderBom order={order} t={t} />
        <EventTimeline order={order} t={t} statusLabels={statusLabels} />

        {/* offscreen principle drawing feeding the fabrication order's plan page */}
        {order.config && derived && tp && (
          <div className="hidden" aria-hidden>
            <DrawingSVG
              ref={svgRef}
              cfg={order.config}
              derived={derived}
              labels={cfgDict.drawing}
              refNo={order.ref}
              tp={tp}
              locale={locale}
              typeName={typeName}
            />
          </div>
        )}
      </div>
    </div>
  );
}

type KindFilter = "all" | "order" | "quote";
type SortKey = "newest" | "value";

function OrdersTable({ t, statusLabels, cfgDict, invoiceDict, locale }: { t: AdminDict; statusLabels: Dict["portal"]["status"]; cfgDict: Dict["cfg"]; invoiceDict: Dict["portal"]["invoice"]; locale?: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [kindF, setKindF] = useState<KindFilter>("all");
  const [statusF, setStatusF] = useState<OrderStatus | "all">("all");
  const [sort, setSort] = useState<SortKey>("newest");

  const refresh = () => {
    if (hasBackend) api.listOrders().then(setOrders).catch(() => setOrders([]));
    else setOrders(loadOrders());
  };
  useEffect(refresh, []);

  const advance = (ref: string, status: OrderStatus) => {
    if (hasBackend) {
      api.patchOrder(ref, { status }).then(refresh).catch(() => {});
      return;
    }
    updateOrderStatus(ref, status);
    setOrders(loadOrders());
  };

  const sendQuote = (o: Order, value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    if (hasBackend) {
      api.patchOrder(o.ref, { quotedGross: value }).then(refresh).catch(() => {});
      return;
    }
    updateOrder(o.ref, { status: "quoted", quotedGross: value });
    logEvent(o.ref, "quoted", o.customer.email);
    setOrders(loadOrders());
  };

  // Admin accepts a binding quote on the customer's behalf (e.g. by phone).
  const markAccepted = (o: Order) => {
    if (hasBackend) {
      api.patchOrder(o.ref, { accept: true }).then(refresh).catch(() => {});
      return;
    }
    acceptQuote(o.ref);
    setOrders(loadOrders());
  };

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

  const inputCls =
    "border border-hairline bg-paper px-3 py-2 text-sm font-light text-ink outline-none transition-colors placeholder:text-stone focus:border-graphite";

  return (
    <div className="flex flex-col gap-6">
      {/* summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label={t.orders.openOrders} value={String(stats.open)} />
        <Kpi label={t.orders.inProduction} value={String(stats.production)} />
        <Kpi label={t.orders.openInvoices} value={String(stats.invoices)} />
        <Kpi label={t.orders.openQuotes} value={String(stats.quotes)} />
        <Kpi label={t.orders.pipelineValue} value={chf(stats.pipeline)} />
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
      </div>

      {/* rows */}
      {filtered.length === 0 ? (
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
      )}

      {selected && (
        <OrderDrawer
          order={selected}
          t={t}
          statusLabels={statusLabels}
          cfgDict={cfgDict}
          invoiceDict={invoiceDict}
          locale={locale}
          onClose={() => setOpenRef(null)}
          advance={advance}
          sendQuote={sendQuote}
          markAccepted={markAccepted}
        />
      )}
    </div>
  );
}

/* ---------- customers tab ---------- */

function CustomersTab({ t }: { t: AdminDict }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [tiers, setTiers] = useState<Record<string, Tier>>({});
  const [apiCustomers, setApiCustomers] = useState<{ name: string; city: string; email: string; orders: number; quotes: number; revenue: number; tier: Tier }[]>([]);

  const refresh = () => {
    if (hasBackend) {
      api
        .listCustomers()
        .then((cs) => {
          setApiCustomers(cs);
          setTiers(Object.fromEntries(cs.map((c) => [c.email.toLowerCase(), c.tier])));
        })
        .catch(() => setApiCustomers([]));
    } else {
      setOrders(loadOrders());
      setTiers(loadTiers());
    }
  };
  useEffect(refresh, []);

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
      api.setTier(email, tier).then(refresh).catch(() => {});
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

/* ---------- pricing tab ---------- */

function PricingEditor({ t }: { t: AdminDict }) {
  const [pb, setPb] = useState<PriceBook>(defaultPriceBook);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchPriceBook().then(setPb);
  }, []);

  const fields: { key: string; label: string; get: () => number; set: (v: number) => void }[] = [
    { key: "basePerM", label: t.fields.basePerM, get: () => pb.basePerM, set: (v) => setPb({ ...pb, basePerM: v }) },
    { key: "glassBasePerM", label: t.fields.glassBasePerM, get: () => pb.glassBasePerM, set: (v) => setPb({ ...pb, glassBasePerM: v }) },
    { key: "glassFreeEdgePerM", label: t.fields.glassFreeEdgePerM, get: () => pb.glassFreeEdgePerM, set: (v) => setPb({ ...pb, glassFreeEdgePerM: v }) },
    { key: "glassSatin", label: t.fields.glassSatin, get: () => pb.glassTypePerM.satin, set: (v) => setPb({ ...pb, glassTypePerM: { ...pb.glassTypePerM, satin: v } }) },
    { key: "glassTinted", label: t.fields.glassTinted, get: () => pb.glassTypePerM.tinted, set: (v) => setPb({ ...pb, glassTypePerM: { ...pb.glassTypePerM, tinted: v } }) },
    { key: "hrFlat", label: t.fields.hrFlat, get: () => pb.handrailPerM.flat_steel, set: (v) => setPb({ ...pb, handrailPerM: { ...pb.handrailPerM, flat_steel: v } }) },
    { key: "hrInox", label: t.fields.hrInox, get: () => pb.handrailPerM.round_inox, set: (v) => setPb({ ...pb, handrailPerM: { ...pb.handrailPerM, round_inox: v } }) },
    { key: "colorCustom", label: t.fields.colorCustom, get: () => pb.colorPerM.custom, set: (v) => setPb({ ...pb, colorPerM: { ...pb.colorPerM, custom: v } }) },
    { key: "stairPerM", label: t.fields.stairPerM, get: () => pb.stairPerM, set: (v) => setPb({ ...pb, stairPerM: v }) },
    { key: "sideMountPerM", label: t.fields.sideMountPerM, get: () => pb.sideMountPerM, set: (v) => setPb({ ...pb, sideMountPerM: v }) },
    { key: "publicPerM", label: t.fields.publicPerM, get: () => pb.publicUsagePerM, set: (v) => setPb({ ...pb, publicUsagePerM: v }) },
    { key: "cornerEach", label: t.fields.cornerEach, get: () => pb.cornerEach, set: (v) => setPb({ ...pb, cornerEach: v }) },
    { key: "cornerEachGlass", label: t.fields.cornerEachGlass, get: () => pb.cornerEachGlass, set: (v) => setPb({ ...pb, cornerEachGlass: v }) },
    { key: "setupFee", label: t.fields.setupFee, get: () => pb.setupFee, set: (v) => setPb({ ...pb, setupFee: v }) },
    { key: "shippingFlat", label: t.fields.shippingFlat, get: () => pb.shippingFlat, set: (v) => setPb({ ...pb, shippingFlat: v }) },
    { key: "freeShippingFrom", label: t.fields.freeShippingFrom, get: () => pb.freeShippingFrom, set: (v) => setPb({ ...pb, freeShippingFrom: v }) },
    { key: "vatPct", label: t.fields.vatPct, get: () => Math.round(pb.vatRate * 1000) / 10, set: (v) => setPb({ ...pb, vatRate: v / 100 }) },
  ];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <p className="text-sm font-light leading-relaxed text-graphite">{t.pricingHint}</p>
      <p className="text-xs font-light text-stone">
        {t.version}: <span className="text-ink">{pb.version}</span>
      </p>

      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
        {fields.map((f) => (
          <label key={f.key} className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">{f.label}</span>
            <span className="flex items-center border border-hairline bg-paper focus-within:border-graphite">
              <input
                type="number"
                value={f.get()}
                step={1}
                min={0}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= 0) {
                    f.set(n);
                    setSaved(false);
                  }
                }}
                className="w-full bg-transparent px-3 py-2 text-sm font-light text-ink outline-none"
              />
              <span className="pr-3 text-xs text-stone">{f.key === "vatPct" ? "%" : "CHF"}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            publishPriceBook(pb)
              .then((next) => {
                setPb(next);
                setSaved(true);
              })
              .catch(() => {});
          }}
          className="inline-flex items-center justify-center bg-ink px-6 py-3 text-xs font-medium uppercase tracking-[0.16em] text-paper transition-colors hover:bg-graphite"
        >
          {t.save}
        </button>
        <button
          type="button"
          onClick={() => {
            resetPriceBookAll()
              .then((next) => {
                setPb(next);
                setSaved(false);
              })
              .catch(() => {});
          }}
          className="inline-flex items-center justify-center border border-ink/25 px-6 py-3 text-xs font-medium uppercase tracking-[0.16em] text-ink transition-colors hover:border-ink"
        >
          {t.reset}
        </button>
      </div>
      {saved && (
        <p role="status" className="border-l-2 border-steel bg-mist/70 p-3 text-sm font-light text-graphite">
          {t.savedMsg}
        </p>
      )}
    </div>
  );
}

/* ---------- principle plans per type × fixing (admin uploads) ---------- */

/** Read an uploaded principle-drawing PDF as a data URL (≤ 3 MB). */
function readPdfFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.type !== "application/pdf") return reject(new Error("not_pdf"));
    if (file.size > 3 * 1024 * 1024) return reject(new Error("too_big"));
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read_failed"));
    r.readAsDataURL(file);
  });
}

function PlanCell({
  t,
  typeId,
  mounting,
  current,
  hasDefault,
  onChange,
}: {
  t: AdminDict;
  typeId: string;
  mounting: "top" | "side";
  current?: string;
  hasDefault: boolean;
  onChange: (value?: string) => void;
  onError?: () => void;
}) {
  const [err, setErr] = useState(false);
  const pick = (
    <label className="cursor-pointer border border-hairline px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-graphite transition-colors hover:border-graphite hover:text-ink">
      {current ? t.plans.replace : t.plans.upload}
      <input
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            setErr(false);
            onChange(await readPdfFile(f));
          } catch {
            setErr(true);
          }
        }}
      />
    </label>
  );
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {current && (
          <>
            <a
              href={current}
              download={`axioform-plan-${typeId}-${mounting}.pdf`}
              className="border border-ink/40 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-ink transition-colors hover:bg-ink hover:text-paper"
            >
              ↓ {t.plans.view}
            </a>
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="px-1 text-[10px] uppercase tracking-[0.12em] text-alert underline-offset-2 hover:underline"
            >
              {t.plans.remove}
            </button>
          </>
        )}
        {pick}
      </div>
      {!current && hasDefault && <span className="text-[10px] font-light text-stone">{t.plans.defaultNote}</span>}
      {err && (
        <span role="alert" className="text-[10px] text-alert">
          {t.plans.tooBig}
        </span>
      )}
    </div>
  );
}

/** Upload a principle drawing (PDF) per type × fixing situation. */
function PlansSection({ t, types }: { t: AdminDict; types: TypeProfile[] }) {
  const [plans, setPlans] = useState<TypePlans>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    fetchPageContent<TypePlans>("typeplans", {}).then(setPlans);
  }, []);

  const set = (typeId: string, mounting: "top" | "side", value?: string) => {
    const entry = { ...(plans[typeId] ?? {}) };
    if (value) entry[mounting] = value;
    else delete entry[mounting];
    const next = { ...plans, [typeId]: entry };
    setPlans(next);
    putPageContent("typeplans", next)
      .then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      })
      .catch(() => {});
  };

  const active = types.filter((x) => x.active);
  return (
    <div className="flex max-w-3xl flex-col gap-4 border border-hairline p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-ink">{t.plans.title}</span>
        {saved && (
          <span role="status" className="text-[11px] font-light text-steel">
            {t.plans.saved}
          </span>
        )}
      </div>
      <p className="text-xs font-light leading-relaxed text-stone">{t.plans.hint}</p>
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-[1fr_1fr_1fr]">
        <span className="hidden text-[10px] uppercase tracking-[0.12em] text-stone sm:block" />
        <span className="hidden text-[10px] uppercase tracking-[0.12em] text-stone sm:block">{t.plans.colTop}</span>
        <span className="hidden text-[10px] uppercase tracking-[0.12em] text-stone sm:block">{t.plans.colSide}</span>
        {active.map((x) => (
          <div key={x.id} className="contents">
            <span className="self-center border-t border-hairline/60 pt-3 text-sm font-light text-ink sm:border-t-0 sm:pt-0">
              {x.name?.de ?? x.id}
            </span>
            <PlanCell t={t} typeId={x.id} mounting="top" current={plans[x.id]?.top} hasDefault={!!x.planUrl} onChange={(v) => set(x.id, "top", v)} />
            <PlanCell t={t} typeId={x.id} mounting="side" current={plans[x.id]?.side} hasDefault={!!x.planUrl} onChange={(v) => set(x.id, "side", v)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- products tab: parametric type designer ---------- */

function ProductsTab({ t, cfgDict }: { t: AdminDict; cfgDict: Dict["cfg"] }) {
  const [types, setTypes] = useState<TypeProfile[]>([]);
  const [designer, setDesigner] = useState<"new" | TypeProfile | null>(null);
  const [created, setCreated] = useState(false);

  useEffect(() => {
    fetchAllTypes().then(setTypes);
  }, []);
  const refresh = () => fetchAllTypes().then(setTypes);

  const specFor = (x: TypeProfile) =>
    x.recipe
      ? `${
          x.recipe.infill.kind === "vertical_flats"
            ? `${cfgDict.infillKinds.vertical_flats} ${x.recipe.infill.angleDeg ? `${x.recipe.infill.angleDeg}°` : cfgDict.infillStraight}`
            : cfgDict.infillKinds[x.recipe.infill.kind]
        } · ≤ ${x.maxSlope}° · CHF ${x.basePerM}/m`
      : x.builtin
        ? x.template === "bars"
          ? t.productBarsSpec
          : t.productGlassSpec
        : x.template === "bars"
          ? `Ø ${x.barDia} mm · ≤ ${x.maxSlope}° · CHF ${x.basePerM}/m`
          : `VSG · ≤ ${x.maxPanelWidth} mm · CHF ${x.basePerM}/m`;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        {types.map((x) => (
          <div key={x.id} className={`flex flex-col gap-2 border border-hairline p-5 ${x.active ? "" : "opacity-60"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-ink">
                {x.name?.de ?? (x.builtin ? (x.template === "bars" ? t.productBars : t.productGlass) : x.id)}
              </span>
              <span
                className={`border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${
                  x.active ? "border-[#4a7c59] text-[#4a7c59]" : "border-stone text-stone"
                }`}
              >
                {x.active ? t.productsActive : t.typesForm.inactive}
              </span>
            </div>
            <p className="text-xs font-light leading-relaxed text-graphite">{specFor(x)}</p>
            {!x.builtin && (
              <div className="flex gap-4 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setCreated(false);
                    setDesigner(x);
                  }}
                  className="text-[11px] uppercase tracking-[0.12em] text-ink underline underline-offset-2"
                >
                  {t.designer.edit}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    saveType({ ...x, active: !x.active }).then(refresh).catch(() => {});
                  }}
                  className="text-[11px] uppercase tracking-[0.12em] text-graphite underline-offset-2 hover:text-ink hover:underline"
                >
                  {x.active ? t.typesForm.inactive : t.productsActive}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    removeType(x.id).then(refresh).catch(() => {});
                  }}
                  className="text-[11px] uppercase tracking-[0.12em] text-alert underline-offset-2 hover:underline"
                >
                  {t.typesForm.delete}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {designer ? (
        <TypeDesigner
          t={t}
          cfgDict={cfgDict}
          initial={designer === "new" ? undefined : designer}
          onCancel={() => setDesigner(null)}
          onSave={(tp) => {
            saveType(tp)
              .then(() => {
                refresh();
                setDesigner(null);
                setCreated(true);
              })
              .catch(() => {});
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setCreated(false);
            setDesigner("new");
          }}
          className="flex max-w-3xl flex-col gap-2 border border-dashed border-hairline p-5 text-left transition-colors hover:border-graphite"
        >
          <span className="text-sm text-graphite">+ {t.newType}</span>
          <p className="text-xs font-light leading-relaxed text-stone">{t.newTypeNote}</p>
        </button>
      )}

      {created && (
        <p role="status" className="border-l-2 border-steel bg-mist/70 p-3 text-sm font-light text-graphite">
          {t.typesForm.created}
        </p>
      )}

      <PlansSection t={t} types={types} />
    </div>
  );
}

/* ---------- content tab: references CMS ---------- */

const emptyProject: RefProject = { name: "", place: "", system: "", length: "", mounting: "", desc: "" };

/** Read a photo and downscale it to a compact JPEG data URL (≤1280 px). */
function readProjectImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

const MAX_GALLERY = 8;

/** Multi-photo gallery editor: append, remove, reorder; first image is the cover. */
function GalleryEditor({
  c,
  images,
  onChange,
  max = MAX_GALLERY,
  label,
}: {
  c: AdminDict["content"];
  images: string[];
  onChange: (images: string[]) => void;
  max?: number;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">
        {label ?? c.image}
        {images.length > 0 && <span className="ml-2 text-stone/70">· {fmt(c.photoCount, { n: images.length })}</span>}
      </span>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((src, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-20 w-28 border border-hairline object-cover" />
              {i === 0 && (
                <span className="absolute left-0 top-0 bg-ink/85 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] text-paper">
                  {c.cover}
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-ink/70 px-1 py-0.5 text-paper">
                <button
                  type="button"
                  aria-label={c.moveLeft}
                  disabled={i === 0}
                  onClick={() => {
                    const n = [...images];
                    [n[i - 1], n[i]] = [n[i], n[i - 1]];
                    onChange(n);
                  }}
                  className="px-1 text-sm leading-none disabled:opacity-30"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label={c.imageRemove}
                  onClick={() => onChange(images.filter((_, j) => j !== i))}
                  className="px-1 text-sm leading-none hover:text-alert"
                >
                  ×
                </button>
                <button
                  type="button"
                  aria-label={c.moveRight}
                  disabled={i === images.length - 1}
                  onClick={() => {
                    const n = [...images];
                    [n[i + 1], n[i]] = [n[i], n[i + 1]];
                    onChange(n);
                  }}
                  className="px-1 text-sm leading-none disabled:opacity-30"
                >
                  ›
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {images.length < max && (
        <label className="cursor-pointer self-start border border-hairline px-4 py-2.5 text-xs uppercase tracking-[0.12em] text-graphite transition-colors hover:border-graphite">
          {images.length === 0 ? c.imagePick : c.imagesAdd}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []).slice(0, max - images.length);
              e.target.value = "";
              const added: string[] = [];
              for (const f of files) {
                try {
                  added.push(await readProjectImage(f));
                } catch {
                  /* skip unreadable file */
                }
              }
              if (added.length) onChange([...images, ...added]);
            }}
          />
        </label>
      )}
    </div>
  );
}

/** Inhalte tab: section switcher over the three CMS-editable pages. */
function ContentSection({
  t,
  refsDict,
  aboutDict,
  locale,
}: {
  t: AdminDict;
  refsDict: Dict["references"];
  aboutDict: Dict["about"];
  locale: string;
}) {
  const [section, setSection] = useState<"references" | "about" | "home">("references");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-px self-start bg-hairline">
        {(["references", "about", "home"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setSection(v)}
            className={`px-4 py-2 text-[11px] uppercase tracking-[0.12em] transition-colors ${
              section === v ? "bg-ink text-paper" : "bg-paper text-graphite hover:text-ink"
            }`}
          >
            {t.content.sections[v]}
          </button>
        ))}
      </div>
      {section === "references" && <ContentTab t={t} refsDict={refsDict} locale={locale} />}
      {section === "about" && <AboutEditor t={t} aboutDict={aboutDict} />}
      {section === "home" && <HomeEditor t={t} />}
    </div>
  );
}

/** About page editor: every text field + the photo gallery, dict values as placeholders. */
function AboutEditor({ t, aboutDict }: { t: AdminDict; aboutDict: Dict["about"] }) {
  const c = t.content;
  const [o, setO] = useState<AboutContent>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    fetchPageContent<AboutContent>("about", {}).then(setO);
  }, []);

  const merged = mergedAbout(aboutDict, o);
  const inputCls =
    "w-full border border-hairline bg-paper px-3 py-2 text-sm font-light text-ink outline-none transition-colors placeholder:text-stone focus:border-graphite";
  const lbl = "text-[11px] font-medium uppercase tracking-[0.14em] text-stone";

  const persist = (next: AboutContent) => {
    putPageContent("about", next)
      .then(() => {
        setO(next);
        setSaved(true);
      })
      .catch(() => {});
  };

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <p className="text-sm font-light leading-relaxed text-graphite">{c.aboutHint}</p>

      <label className="flex flex-col gap-1.5">
        <span className={lbl}>{c.fKicker}</span>
        <input value={o.kicker ?? ""} placeholder={aboutDict.kicker} onChange={(e) => setO({ ...o, kicker: e.target.value })} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={lbl}>{c.fTitle}</span>
        <input value={o.title ?? ""} placeholder={aboutDict.title} onChange={(e) => setO({ ...o, title: e.target.value })} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={lbl}>{c.fLead}</span>
        <textarea rows={2} value={o.lead ?? ""} placeholder={aboutDict.lead} onChange={(e) => setO({ ...o, lead: e.target.value })} className={inputCls} />
      </label>

      {aboutDict.story.map((def, i) => (
        <label key={i} className="flex flex-col gap-1.5">
          <span className={lbl}>{fmt(c.fStory, { n: i + 1 })}</span>
          <textarea
            rows={3}
            value={merged.story[i] ?? ""}
            onChange={(e) => {
              const story = [...merged.story];
              story[i] = e.target.value;
              setO({ ...o, story });
            }}
            className={inputCls}
          />
        </label>
      ))}

      <div className="flex flex-col gap-3">
        <span className={lbl}>{c.fValues}</span>
        {merged.values.map((v, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr]">
            <input
              value={v.t}
              onChange={(e) => {
                const values = merged.values.map((x, j) => (j === i ? { ...x, t: e.target.value } : x));
                setO({ ...o, values });
              }}
              className={inputCls}
            />
            <input
              value={v.d}
              onChange={(e) => {
                const values = merged.values.map((x, j) => (j === i ? { ...x, d: e.target.value } : x));
                setO({ ...o, values });
              }}
              className={inputCls}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <span className={lbl}>{c.fNumbers}</span>
        {merged.numbers.map((n, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr]">
            <input
              value={n.v}
              onChange={(e) => {
                const numbers = merged.numbers.map((x, j) => (j === i ? { ...x, v: e.target.value } : x));
                setO({ ...o, numbers });
              }}
              className={inputCls}
            />
            <input
              value={n.d}
              onChange={(e) => {
                const numbers = merged.numbers.map((x, j) => (j === i ? { ...x, d: e.target.value } : x));
                setO({ ...o, numbers });
              }}
              className={inputCls}
            />
          </div>
        ))}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={lbl}>{c.fQuote}</span>
        <textarea rows={2} value={o.quote ?? ""} placeholder={aboutDict.quote} onChange={(e) => setO({ ...o, quote: e.target.value })} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={lbl}>{c.fQuoteAuthor}</span>
        <input value={o.quoteAuthor ?? ""} placeholder={aboutDict.quoteAuthor} onChange={(e) => setO({ ...o, quoteAuthor: e.target.value })} className={inputCls} />
      </label>

      <GalleryEditor c={c} label={c.fGallery} images={o.images ?? []} onChange={(images) => setO({ ...o, images })} />

      <div className="flex flex-wrap gap-3 pt-1">
        <button
          type="button"
          onClick={() => persist(o)}
          className="inline-flex items-center justify-center bg-ink px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-paper transition-colors hover:bg-graphite"
        >
          {t.save}
        </button>
        <button
          type="button"
          onClick={() => persist({})}
          className="inline-flex items-center justify-center border border-hairline px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-graphite transition-colors hover:border-graphite"
        >
          {c.resetPage}
        </button>
      </div>
      {saved && (
        <p role="status" className="border-l-2 border-steel bg-mist/70 p-3 text-sm font-light text-graphite">
          {c.savedMsg}
        </p>
      )}
    </div>
  );
}

/** Home page editor: hero photo (references photos flow to the teaser automatically). */
function HomeEditor({ t }: { t: AdminDict }) {
  const c = t.content;
  const [o, setO] = useState<HomeContent>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    fetchPageContent<HomeContent>("home", {}).then(setO);
  }, []);

  const persist = (next: HomeContent) => {
    putPageContent("home", next)
      .then(() => {
        setO(next);
        setSaved(true);
      })
      .catch(() => {});
  };

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <p className="text-sm font-light leading-relaxed text-graphite">{c.homeHint}</p>
      <GalleryEditor
        c={c}
        label={c.heroImage}
        max={1}
        images={o.heroImage ? [o.heroImage] : []}
        onChange={(images) => setO({ ...o, heroImage: images[0] })}
      />
      <div className="flex flex-wrap gap-3 pt-1">
        <button
          type="button"
          onClick={() => persist(o)}
          className="inline-flex items-center justify-center bg-ink px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-paper transition-colors hover:bg-graphite"
        >
          {t.save}
        </button>
        <button
          type="button"
          onClick={() => persist({})}
          className="inline-flex items-center justify-center border border-hairline px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-graphite transition-colors hover:border-graphite"
        >
          {c.resetPage}
        </button>
      </div>
      {saved && (
        <p role="status" className="border-l-2 border-steel bg-mist/70 p-3 text-sm font-light text-graphite">
          {c.savedMsg}
        </p>
      )}
    </div>
  );
}

function ContentTab({ t, refsDict, locale }: { t: AdminDict; refsDict: Dict["references"]; locale: string }) {
  const c = t.content;
  const [content, setContent] = useState<ContentState>({ projects: {}, added: [] });
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<RefProject>(emptyProject);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchContent().then(setContent);
  }, []);

  const base = refsDict.projects as RefProject[];
  const combined: RefProject[] = [...base.map((p, i) => ({ ...p, ...(content.projects[i] ?? {}) })), ...content.added];

  const persist = (next: ContentState) => {
    putContent(next)
      .then(() => fetchContent())
      .then((c) => {
        setContent(c);
        setEditing(null);
        setSaved(true);
      })
      .catch(() => {});
  };

  const submit = () => {
    if (editing === "new") {
      persist({ ...content, added: [...content.added, draft] });
    } else if (typeof editing === "number" && editing < base.length) {
      persist({ ...content, projects: { ...content.projects, [editing]: draft } });
    } else if (typeof editing === "number") {
      const added = [...content.added];
      added[editing - base.length] = draft;
      persist({ ...content, added });
    }
  };

  const inputCls =
    "w-full border border-hairline bg-paper px-3 py-2 text-sm font-light text-ink outline-none transition-colors placeholder:text-stone focus:border-graphite";

  const form = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-3 border border-ink/60 p-5"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <input required placeholder={c.name} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} />
        <input required placeholder={c.place} value={draft.place} onChange={(e) => setDraft({ ...draft, place: e.target.value })} className={inputCls} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <input required placeholder={c.system} value={draft.system} onChange={(e) => setDraft({ ...draft, system: e.target.value })} className={inputCls} />
        <input required placeholder={c.length} value={draft.length} onChange={(e) => setDraft({ ...draft, length: e.target.value })} className={inputCls} />
        <input required placeholder={c.mounting} value={draft.mounting} onChange={(e) => setDraft({ ...draft, mounting: e.target.value })} className={inputCls} />
      </div>
      <textarea
        required
        rows={2}
        placeholder={c.desc}
        value={draft.desc}
        onChange={(e) => setDraft({ ...draft, desc: e.target.value })}
        className={inputCls}
      />
      <GalleryEditor c={c} images={projectImages(draft)} onChange={(images) => setDraft((d) => ({ ...d, images, image: undefined }))} />
      <div className="flex gap-3">
        <button type="submit" className="inline-flex items-center justify-center bg-ink px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-paper transition-colors hover:bg-graphite">
          {c.save}
        </button>
        <button type="button" onClick={() => setEditing(null)} className="inline-flex items-center justify-center border border-hairline px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-graphite transition-colors hover:border-graphite">
          {c.cancel}
        </button>
      </div>
    </form>
  );

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="max-w-2xl text-sm font-light leading-relaxed text-graphite">{c.hint}</p>
        <Link href={`/${locale}/references/`} className="whitespace-nowrap text-xs uppercase tracking-[0.12em] text-graphite underline-offset-4 hover:text-ink hover:underline">
          {c.viewPage} →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {combined.map((p, i) =>
          editing === i ? (
            <div key={i} className="sm:col-span-2">
              {form}
            </div>
          ) : (
            <div key={i} className="flex flex-col gap-2 border border-hairline p-5">
              {projectImages(p).length > 0 && (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={projectImages(p)[0]} alt={p.name} className="aspect-[16/9] w-full border border-hairline object-cover" />
                  {projectImages(p).length > 1 && (
                    <span className="absolute bottom-2 right-2 bg-ink/80 px-2 py-0.5 text-[10px] font-light text-paper">
                      {fmt(c.photoCount, { n: projectImages(p).length })}
                    </span>
                  )}
                </div>
              )}
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-ink">{p.name}</span>
                {i >= base.length && (
                  <span className="border border-steel/50 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-steel">{c.customBadge}</span>
                )}
              </div>
              <p className="text-xs font-light text-stone">
                {p.place} · {p.system} · {p.length}
              </p>
              <p className="text-xs font-light leading-relaxed text-graphite">{p.desc}</p>
              <div className="flex gap-4 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(p);
                    setEditing(i);
                    setSaved(false);
                  }}
                  className="text-[11px] uppercase tracking-[0.12em] text-graphite underline-offset-2 hover:text-ink hover:underline"
                >
                  {c.edit}
                </button>
                {i >= base.length && (
                  <button
                    type="button"
                    onClick={() => persist({ ...content, added: content.added.filter((_, j) => j !== i - base.length) })}
                    className="text-[11px] uppercase tracking-[0.12em] text-alert underline-offset-2 hover:underline"
                  >
                    {c.delete}
                  </button>
                )}
              </div>
            </div>
          ),
        )}
      </div>

      {editing === "new" ? (
        form
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(emptyProject);
            setEditing("new");
            setSaved(false);
          }}
          className="self-start border border-dashed border-hairline px-5 py-3 text-left text-sm text-graphite transition-colors hover:border-graphite"
        >
          + {c.addProject}
        </button>
      )}

      {saved && (
        <p role="status" className="border-l-2 border-steel bg-mist/70 p-3 text-sm font-light text-graphite">
          {c.savedMsg}
        </p>
      )}
    </div>
  );
}

/* ---------- shell ---------- */

export default function AdminApp({
  t,
  statusLabels,
  cfgDict,
  refsDict,
  aboutDict,
  invoiceDict,
  locale,
}: {
  t: AdminDict;
  statusLabels: Dict["portal"]["status"];
  cfgDict: Dict["cfg"];
  refsDict: Dict["references"];
  aboutDict: Dict["about"];
  invoiceDict: Dict["portal"]["invoice"];
  locale: string;
}) {
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap gap-px self-start bg-hairline">
        {(["dashboard", "orders", "customers", "pricing", "products", "content"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setTab(v)}
            className={`px-5 py-2.5 text-xs uppercase tracking-[0.14em] transition-colors ${
              tab === v ? "bg-ink text-paper" : "bg-paper text-graphite hover:text-ink"
            }`}
          >
            {t.tabs[v]}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <DashboardTab t={t} statusLabels={statusLabels} cfgDict={cfgDict} />}
      {tab === "orders" && <OrdersTable t={t} statusLabels={statusLabels} cfgDict={cfgDict} invoiceDict={invoiceDict} locale={locale} />}
      {tab === "customers" && <CustomersTab t={t} />}
      {tab === "pricing" && <PricingEditor t={t} />}
      {tab === "products" && <ProductsTab t={t} cfgDict={cfgDict} />}
      {tab === "content" && <ContentSection t={t} refsDict={refsDict} aboutDict={aboutDict} locale={locale} />}
    </div>
  );
}
