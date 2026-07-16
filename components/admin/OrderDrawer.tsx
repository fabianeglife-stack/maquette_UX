"use client";

/*
 * Slide-over order/quote detail: status pipeline + actions, customer block,
 * production/logistics documents, BOM and event timeline. Opened from the
 * orders board and every ops station view.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { chf, paymentPlan } from "@/lib/engine/pricing";
import { invoicesFor } from "@/lib/engine/invoicing";
import { deriveRailing } from "@/lib/engine/geometry";
import { buildBom } from "@/lib/engine/bom";
import type { TypeProfile } from "@/lib/engine/types";
import {
  isQuoteExpired,
  loadEvents,
  ORDER_FLOW,
  QUOTE_FLOW,
  type Order,
  type OrderEvent,
  type OrderStatus,
} from "@/lib/store";
import { fetchAllTypes, resolveType } from "@/lib/data";
import { fmt, type Dict } from "@/lib/i18n";
import { api, hasBackend, type ApiOrder } from "@/lib/api";
import StatusSteps from "@/components/StatusSteps";
import { downloadInvoicePdf } from "@/components/portal/invoice";
import { confirmationSummary, downloadConfirmationPdf } from "@/components/portal/confirmation";
import { downloadQuotePdf } from "@/components/portal/quote";
import { downloadDeliveryPdf, downloadFabricationPdf, downloadPickingPdf } from "./docs";
import DrawingSVG from "@/components/configurator/DrawingSVG";
import type { AdminDict } from "./shared";

/** Vertical event timeline (order lifecycle + transactional-email hooks). */
function EventTimeline({ order, t, statusLabels }: { order: Order; t: AdminDict; statusLabels: Dict["portal"]["status"] }) {
  const events = hasBackend ? ((order as ApiOrder).events ?? []) : loadEvents(order.ref);
  const label = (e: OrderEvent) => {
    switch (e.type) {
      case "created":
        return t.events.created;
      case "quote_accepted":
        return t.events.quote_accepted;
      case "deposit_sent":
        return t.events.deposit_sent;
      case "balance_sent":
        return t.events.balance_sent;
      case "invoice_sent":
        return t.events.invoice_sent;
      case "deposit_paid":
        return t.events.deposit_paid;
      case "reminder_sent":
        return t.events.reminder_sent;
      default:
        return statusLabels[e.type];
    }
  };

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

export default function OrderDrawer({
  order,
  t,
  statusLabels,
  cfgDict,
  invoiceDict,
  confirmationDict,
  quoteDict,
  locale,
  onClose,
  advance,
  sendQuote,
  markAccepted,
  setDeliveryDate,
  cancel,
}: {
  order: Order;
  t: AdminDict;
  statusLabels: Dict["portal"]["status"];
  cfgDict: Dict["cfg"];
  invoiceDict: Dict["portal"]["invoice"];
  confirmationDict: Dict["portal"]["confirmation"];
  quoteDict: Dict["portal"]["quote"];
  locale?: string;
  onClose: () => void;
  advance: (ref: string, status: OrderStatus) => Promise<boolean>;
  sendQuote: (o: Order, value: number) => void;
  markAccepted: (o: Order) => void;
  setDeliveryDate: (ref: string, date: string) => Promise<boolean>;
  cancel: (o: Order) => void;
}) {
  const [quote, setQuote] = useState(String(Math.round(order.quotedGross ?? order.gross)));
  // Set right after a successful confirm: the order confirmation went out to
  // this address (the transactional-email hook fired with the delivery date).
  const [sentTo, setSentTo] = useState<string | null>(null);
  const flow = order.kind === "order" ? ORDER_FLOW : QUOTE_FLOW;
  const idx = flow.indexOf(order.status);
  // Instalments for the internal review / order confirmation (≤ threshold:
  // 100 % at order; above: deposit + delivery balance; net 30).
  const plan = paymentPlan(order.quotedGross ?? order.gross);

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
          {order.status === "cancelled" ? null : order.kind === "order" ? (
            <>
              {/* Estimated delivery date — entering it on an order in review
                  confirms the order and sends the confirmation right away. */}
              <label className="flex items-center gap-3">
                <span className="text-[10px] uppercase tracking-[0.12em] text-stone">{t.orders.deliveryDate}</span>
                <input
                  type="date"
                  value={order.deliveryDate ?? ""}
                  onChange={(e) =>
                    e.target.value &&
                    void setDeliveryDate(order.ref, e.target.value).then((sent) => {
                      if (sent) setSentTo(order.customer.email);
                    })
                  }
                  className="flex-1 border border-hairline bg-paper px-2 py-1.5 text-sm font-light text-ink outline-none focus:border-graphite"
                />
              </label>
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
                  disabled={idx >= flow.length - 1 || (flow[idx + 1] === "confirmed" && !order.deliveryDate)}
                  onClick={() => {
                    const next = flow[idx + 1];
                    void advance(order.ref, next).then((ok) => {
                      if (ok && next === "confirmed") setSentTo(order.customer.email);
                    });
                  }}
                  className="flex-1 bg-ink px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-paper transition-colors hover:bg-graphite disabled:opacity-30"
                >
                  {t.orders.advance} ›
                </button>
              </div>
              {flow[idx + 1] === "confirmed" && !order.deliveryDate && (
                <p className="text-xs font-light text-alert">{t.orders.deliveryRequired}</p>
              )}
              {sentTo && (
                <p role="status" className="border-l-2 border-steel bg-mist/70 p-3 text-sm font-light text-graphite">
                  {fmt(t.orders.confirmationSent, { email: sentTo })}
                </p>
              )}
            </>
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
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-light text-graphite">
                  {statusLabels[order.status]} · <span className="text-ink">{chf(order.quotedGross ?? order.gross)}</span>
                </p>
                {order.status === "quoted" && !isQuoteExpired(order) && (
                  <button
                    type="button"
                    onClick={() => markAccepted(order)}
                    className="border border-ink/40 px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper"
                  >
                    {t.orders.markAccepted}
                  </button>
                )}
              </div>
              {order.status === "quoted" && order.validUntil && (
                <p className={`text-xs font-light ${isQuoteExpired(order) ? "text-alert" : "text-stone"}`}>
                  {quoteDict.validUntil}: {order.validUntil}
                </p>
              )}
              {order.status === "quoted" && (
                <button
                  type="button"
                  onClick={() => downloadQuotePdf(order, quoteDict, order.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars)}
                  className="self-start border border-hairline px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-graphite transition-colors hover:border-graphite hover:text-ink"
                >
                  ↓ {quoteDict.title} (PDF)
                </button>
              )}
            </>
          )}
          {/* Terminal exit: withdraw an order in review / a confirmed order, or an open quote. */}
          {(order.kind === "order"
            ? order.status === "new" || order.status === "confirmed"
            : order.status === "quote_requested" || order.status === "quoted") && (
            <button
              type="button"
              onClick={() => window.confirm(t.orders.cancelConfirm) && cancel(order)}
              className="self-start text-[11px] uppercase tracking-[0.12em] text-stone underline-offset-4 transition-colors hover:text-alert hover:underline"
            >
              {t.orders.cancel}
            </button>
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

        {/* payment terms for the order confirmation */}
        {order.kind === "order" && (
          <div className="flex flex-col gap-1 border border-hairline p-4">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{cfgDict.payTerms.title}</span>
            <p className="text-[13px] font-light text-graphite">
              {plan.split
                ? fmt(cfgDict.payTerms.split, { deposit: chf(plan.deposit), balance: chf(plan.balance) })
                : fmt(cfgDict.payTerms.fullUpfront, { amount: chf(plan.deposit) })}
            </p>
            <p className="text-xs font-light text-stone">{fmt(cfgDict.payTerms.net, { days: plan.netDays })}</p>
          </div>
        )}

        {/* customer */}
        <div>
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{t.bom.address}</span>
          <p className="pt-1 text-sm font-light text-graphite">
            {order.customer.name} · {order.customer.street}, {order.customer.city}
            <span className="block text-xs text-stone">{order.customer.email}</span>
          </p>
          {order.payment && <p className="pt-1 text-xs font-light uppercase text-stone">{t.bom.payment}: {order.payment}</p>}
        </div>

        {/* all client + production documents in one place */}
        {order.kind === "order" && (
          <div className="flex flex-col gap-2 border border-hairline p-4">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{t.docs.title}</span>
            <div className="flex flex-col gap-2">
              {/* Order confirmation — previewable as soon as the estimated
                  delivery date is set, so staff can check the document during
                  review before confirming and sending it to the customer. */}
              <button
                type="button"
                disabled={!order.deliveryDate}
                title={!order.deliveryDate ? t.orders.deliveryRequired : undefined}
                onClick={() =>
                  order.deliveryDate &&
                  void downloadConfirmationPdf(order, confirmationDict, cfgDict.payTerms, order.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars, {
                    svg: svgRef.current,
                    summary: confirmationSummary(order, cfgDict, typeName),
                  })
                }
                className="border border-hairline px-3 py-2 text-left text-[11px] uppercase tracking-[0.12em] text-graphite transition-colors hover:border-graphite hover:text-ink disabled:opacity-35"
              >
                ↓ {t.docs.confirmation}
              </button>
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
              {/* Invoices — deposit at confirmation, balance at delivery, or a
                  single full invoice for a small order. Only issued ones show. */}
              {invoicesFor(order, hasBackend ? ((order as ApiOrder).events ?? []) : loadEvents(order.ref))
                .filter((inv) => inv.state !== "pending")
                .map((inv) => (
                  <button
                    key={inv.kind}
                    type="button"
                    onClick={() => downloadInvoicePdf(order, invoiceDict, order.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars, inv)}
                    className="border border-hairline px-3 py-2 text-left text-[11px] uppercase tracking-[0.12em] text-graphite transition-colors hover:border-graphite hover:text-ink"
                  >
                    ↓ {t.finance.types[inv.kind]}
                  </button>
                ))}
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
