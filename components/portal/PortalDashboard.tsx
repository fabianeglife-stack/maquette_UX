"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import DrawingSVG from "@/components/configurator/DrawingSVG";
import { downloadDrawingPdf } from "@/components/configurator/pdf";
import { downloadInvoicePdf } from "./invoice";
import { confirmationSummary, downloadConfirmationPdf } from "./confirmation";
import { downloadQuotePdf } from "./quote";
import { deriveRailing } from "@/lib/engine/geometry";
import { chf } from "@/lib/engine/pricing";
import { invoicesFor } from "@/lib/engine/invoicing";
import {
  acceptQuote,
  approvePlans,
  cancelOrder,
  clearSession,
  confirmationNoFor,
  encodeConfig,
  getSession,
  isLate,
  isQuoteExpired,
  loadEvents,
  loadOrders,
  ORDER_FLOW,
  planFor,
  QUOTE_FLOW,
  requestPlanChanges,
  type Order,
  type SavedConfig,
  type TypePlans,
} from "@/lib/store";
import { fetchAllTypes, fetchPageContent, fetchSavedConfigs, removeSavedConfig, resolveType } from "@/lib/data";
import type { TypeProfile } from "@/lib/engine/types";
import { fmt, type Dict } from "@/lib/i18n";
import { api, hasBackend, type ApiOrder } from "@/lib/api";
import { notify } from "@/lib/toast";
import StatusSteps from "@/components/StatusSteps";
import { PlanSketch } from "@/components/configurator/visual";

/** Customer-facing milestone timeline (answers "where is my order?"). */
function OrderTimeline({ order, t }: { order: Order; t: Dict["portal"] }) {
  const events: { type: string; at: string }[] = hasBackend ? ((order as ApiOrder).events ?? []) : loadEvents(order.ref);
  const at = (type: string) => events.find((e) => e.type === type)?.at?.slice(0, 10);
  const rank = ORDER_FLOW.indexOf(order.status);
  const reached = (s: string) => rank >= ORDER_FLOW.indexOf(s as (typeof ORDER_FLOW)[number]);
  const tl = t.timeline;
  const steps: { label: string; done: boolean; date?: string }[] = [
    { label: tl.paid, done: true, date: order.createdAt },
    { label: tl.plansApproved, done: Boolean(order.plansApprovedAt), date: order.plansApprovedAt },
    { label: tl.confirmed, done: reached("confirmed"), date: at("confirmed") ?? order.deliveryDate },
    { label: tl.production, done: reached("production"), date: at("production") },
    { label: tl.treatment, done: Boolean(order.treatmentSentAt), date: order.treatmentReceivedAt ?? order.treatmentSentAt },
    { label: tl.qc, done: Boolean(order.qcPassedAt), date: order.qcPassedAt },
    { label: tl.ready, done: Boolean(order.palletizedAt), date: order.palletizedAt },
    { label: tl.shipped, done: reached("shipped"), date: at("shipped") },
    { label: tl.delivered, done: Boolean(order.deliveredAt), date: order.deliveredAt },
  ];
  // The first not-done step is the current one (subtle emphasis).
  const currentIdx = steps.findIndex((s) => !s.done);
  return (
    <div className="flex flex-col gap-1 border-t border-hairline pt-3">
      <span className="pb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-steel">{tl.title}</span>
      <ol className="flex flex-col">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${s.done ? "bg-ink" : i === currentIdx ? "bg-steel" : "bg-hairline"}`} />
              {i < steps.length - 1 && <span className={`w-px flex-1 ${s.done ? "bg-ink/40" : "bg-hairline"}`} />}
            </div>
            <div className="pb-2.5">
              <p className={`text-[13px] ${s.done ? "font-light text-graphite" : i === currentIdx ? "font-light text-ink" : "font-light text-stone"}`}>
                {s.done ? "✓ " : ""}
                {s.label}
              </p>
              {s.done && s.date && <p className="text-[11px] text-stone">{s.date}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function OrderCard({
  order,
  t,
  cfgDict,
  locale,
  onRefresh,
}: {
  order: Order;
  t: Dict["portal"];
  cfgDict: Dict["cfg"];
  locale?: string;
  onRefresh: () => void;
}) {
  const flow = order.kind === "order" ? ORDER_FLOW : QUOTE_FLOW;
  const svgRef = useRef<SVGSVGElement>(null);
  const [types, setTypes] = useState<TypeProfile[]>([]);
  const [typePlans, setTypePlans] = useState<TypePlans>({});
  useEffect(() => {
    fetchAllTypes().then(setTypes);
    fetchPageContent<TypePlans>("typeplans", {}).then(setTypePlans);
  }, []);
  const tp = useMemo(
    () => (order.config && types.length > 0 ? resolveType(types, order.config.typeId, order.config.system) : undefined),
    [order.config, types],
  );
  const derived = useMemo(() => {
    if (!order.config || !tp) return null;
    return deriveRailing(order.config, tp);
  }, [order.config, tp]);

  return (
    <div className="flex flex-col gap-3 border border-hairline bg-paper p-5 transition-colors hover:border-graphite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium tracking-[0.06em] text-ink">{order.ref}</span>
        <span className="text-xs font-light text-stone">
          {t.date} {order.createdAt}
        </span>
      </div>
      <p className="text-sm font-light text-graphite">
        {order.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars} · {order.lengthM.toLocaleString("de-CH")} m
      </p>
      <StatusSteps status={order.status} flow={flow} labels={t.status} />
      {isLate(order) && (
        <p className="border-l-2 border-[#dc2626] bg-[#dc2626]/8 px-3 py-2 text-[12px] font-light text-graphite">{t.late}</p>
      )}
      <div className="flex items-baseline justify-between border-t border-hairline pt-3">
        <span className="text-xs font-light text-stone">{t.total}</span>
        <span className="text-base font-light text-ink">{chf(order.gross)}</span>
      </div>
      {order.kind === "quote" && order.status === "quoted" && (
        <div className="flex flex-col gap-2 border-l-2 border-steel bg-mist/70 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-steel">{t.quotedPrice}</span>
            <span className="text-base text-ink">{chf(order.quotedGross ?? order.gross)}</span>
          </div>
          {order.validUntil && (
            <p className={`text-xs font-light ${isQuoteExpired(order) ? "text-alert" : "text-stone"}`}>
              {t.validUntil} {order.validUntil}
            </p>
          )}
          {isQuoteExpired(order) ? (
            <p className="text-[11px] font-light leading-relaxed text-alert">{t.quoteExpired}</p>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  if (hasBackend) {
                    api.patchOrder(order.ref, { accept: true }).then(onRefresh).catch(() => notify("saveFailed"));
                  } else {
                    acceptQuote(order.ref);
                    onRefresh();
                  }
                }}
                className="self-start bg-ink px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-paper transition-colors hover:bg-graphite"
              >
                {t.acceptQuote}
              </button>
              <p className="text-[11px] font-light leading-relaxed text-stone">{t.acceptNote}</p>
            </>
          )}
          <button
            type="button"
            onClick={() =>
              downloadQuotePdf(order, t.quote, order.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars)
            }
            className="self-start text-xs uppercase tracking-[0.12em] text-graphite underline-offset-4 hover:text-ink hover:underline"
          >
            ↓ {t.quotePdf}
          </button>
        </div>
      )}
      {/* Plan approval — while the order is in review the customer signs off
          the detail plans here; the confirmation follows once staff enter the
          delivery date. */}
      {order.kind === "order" &&
        order.status === "new" &&
        (() => {
          const plan = order.config
            ? planFor(typePlans, tp?.id ?? order.config.typeId ?? "", order.config.substrate ?? "concrete_top", order.config.mounting, tp?.planUrl)
            : undefined;
          if (order.plansApprovedAt) {
            return (
              <div className="flex flex-col gap-1 border-l-2 border-steel bg-mist/70 p-3">
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-steel">{t.plans.title}</span>
                <p className="text-sm font-light text-graphite">✓ {fmt(t.plans.approvedOn, { date: order.plansApprovedAt })}</p>
                <p className="text-[11px] font-light leading-relaxed text-stone">{t.plans.afterApproval}</p>
              </div>
            );
          }
          if (!order.plansSentAt) {
            return <p className="border-l-2 border-hairline bg-mist/50 p-3 text-[13px] font-light leading-relaxed text-graphite">{t.plans.waiting}</p>;
          }
          return (
            <div className="flex flex-col gap-2 border-l-2 border-ink bg-mist/70 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink">{t.plans.title}</span>
                <span className="text-xs font-light text-stone">{fmt(t.plans.sentOn, { date: order.plansSentAt })}</span>
              </div>
              <p className="text-[13px] font-light leading-relaxed text-graphite">{t.plans.toApprove}</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                {order.config && derived && (
                  <button
                    type="button"
                    onClick={() => svgRef.current && downloadDrawingPdf(svgRef.current, `axioform-${order.ref}.pdf`)}
                    className="text-xs uppercase tracking-[0.12em] text-graphite underline-offset-4 hover:text-ink hover:underline"
                  >
                    ↓ {t.drawingPdf}
                  </button>
                )}
                {plan && (
                  <a
                    href={plan.startsWith("data:") ? plan : `${process.env.NEXT_PUBLIC_BASE_PATH || ""}${plan}`}
                    {...(plan.startsWith("data:") ? { download: `axioform-plan-${order.ref}.pdf` } : { target: "_blank", rel: "noopener" })}
                    className="text-xs uppercase tracking-[0.12em] text-graphite underline-offset-4 hover:text-ink hover:underline"
                  >
                    ↓ {cfgDict.planPdf}
                  </a>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (hasBackend) {
                      api.patchOrder(order.ref, { approvePlans: true }).then(onRefresh).catch(() => notify("saveFailed"));
                    } else {
                      approvePlans(order.ref);
                      onRefresh();
                    }
                  }}
                  className="bg-ink px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-paper transition-colors hover:bg-graphite"
                >
                  {t.plans.approve}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(t.plans.requestChangeConfirm)) return;
                    if (hasBackend) {
                      api.patchOrder(order.ref, { requestPlanChanges: true }).then(onRefresh).catch(() => notify("saveFailed"));
                    } else {
                      requestPlanChanges(order.ref);
                      onRefresh();
                    }
                  }}
                  className="text-xs uppercase tracking-[0.12em] text-stone underline-offset-4 hover:text-ink hover:underline"
                >
                  {t.plans.requestChange}
                </button>
              </div>
              <p className="text-[11px] font-light leading-relaxed text-stone">{t.plans.approveNote}</p>
            </div>
          );
        })()}
      {/* Order confirmation: visible as soon as the order leaves internal review. */}
      {order.kind === "order" && order.status !== "new" && (
        <div className="flex flex-col gap-2 border-l-2 border-steel bg-mist/70 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-steel">{t.confirmedTitle}</span>
            <span className="text-xs font-light text-stone">
              {t.confirmation.no} {confirmationNoFor(order.ref)}
            </span>
          </div>
          {order.deliveryDate && (
            <p className="text-sm font-light text-graphite">
              {t.deliveryDate} <span className="text-ink">{order.deliveryDate}</span>
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              const systemName = order.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars;
              void downloadConfirmationPdf(order, t.confirmation, cfgDict.payTerms, systemName, {
                svg: svgRef.current,
                summary: confirmationSummary(order, cfgDict, tp?.name?.de ?? systemName),
              });
            }}
            className="self-start bg-ink px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-paper transition-colors hover:bg-graphite"
          >
            ↓ {t.confirmationPdf}
          </button>
        </div>
      )}
      {/* Milestone timeline + shipment: visible once the order is confirmed. */}
      {order.kind === "order" && order.status !== "new" && (
        <>
          <OrderTimeline order={order} t={t} />
          {(order.carrier || order.trackingNo || order.deliveredAt) && (
            <div className="flex flex-col gap-1 border-l-2 border-steel bg-mist/70 p-3">
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-steel">{t.shipment.title}</span>
              {order.carrier && (
                <p className="text-[13px] font-light text-graphite">
                  {t.shipment.carrier}: <span className="text-ink">{order.carrier}</span>
                </p>
              )}
              {order.trackingNo && (
                <p className="text-[13px] font-light text-graphite">
                  {t.shipment.tracking}: <span className="text-ink">{order.trackingNo}</span>
                </p>
              )}
              {order.deliveredAt && (
                <p className="text-[13px] font-light text-[#16a34a]">
                  ✓ {fmt(t.shipment.deliveredOn, { date: order.deliveredAt })}
                  {order.deliveredTo && <span className="block text-xs text-stone">{fmt(t.shipment.receivedBy, { name: order.deliveredTo })}</span>}
                </p>
              )}
            </div>
          )}
        </>
      )}
      {/* Invoices: deposit after confirmation, balance after delivery (or a
          single full invoice for a small order). Only issued ones show. */}
      {order.kind === "order" &&
        (() => {
          const events = hasBackend ? ((order as ApiOrder).events ?? []) : loadEvents(order.ref);
          const invs = invoicesFor(order, events).filter((i) => i.state !== "pending");
          const systemName = order.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars;
          if (invs.length === 0) return null;
          return (
            <div className="flex flex-col gap-1.5 border-t border-hairline pt-3">
              {invs.map((inv) => {
                const label = inv.kind === "deposit" ? t.invoice.deposit : inv.kind === "balance" ? t.invoice.balance : t.invoice.title;
                return (
                  <div key={inv.kind} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <div className="flex items-baseline gap-2">
                      <button
                        type="button"
                        onClick={() => downloadInvoicePdf(order, t.invoice, systemName, inv)}
                        className="text-xs uppercase tracking-[0.12em] text-graphite underline-offset-4 hover:text-ink hover:underline"
                      >
                        ↓ {label}
                      </button>
                      <span className="text-xs text-ink">{chf(inv.amount)}</span>
                    </div>
                    {inv.state === "paid" ? (
                      <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#16a34a]">✓ {t.status.paid}</span>
                    ) : inv.dueDate ? (
                      <span className={`text-[11px] font-light ${inv.state === "overdue" ? "text-alert" : "text-stone"}`}>
                        {t.invoice.due} {inv.dueDate}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })()}
      {order.config && derived && (
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <button
            type="button"
            onClick={() => svgRef.current && downloadDrawingPdf(svgRef.current, `axioform-${order.ref}.pdf`)}
            className="text-xs uppercase tracking-[0.12em] text-graphite underline-offset-4 hover:text-ink hover:underline"
          >
            ↓ {t.drawingPdf}
          </button>
        </div>
      )}
      {/* Withdraw: an order still in review, or an open quote. */}
      {(order.kind === "order" ? order.status === "new" : order.status === "quote_requested" || order.status === "quoted") && (
        <button
          type="button"
          onClick={() => {
            const isOrder = order.kind === "order";
            if (!window.confirm(isOrder ? t.cancelOrderConfirm : t.declineQuoteConfirm)) return;
            if (hasBackend) {
              api.patchOrder(order.ref, { cancel: true }).then(onRefresh).catch(() => notify("saveFailed"));
            } else {
              cancelOrder(order.ref);
              onRefresh();
            }
          }}
          className="self-start text-xs uppercase tracking-[0.12em] text-stone underline-offset-4 hover:text-alert hover:underline"
        >
          {order.kind === "order" ? t.cancelOrder : t.declineQuote}
        </button>
      )}
      {order.config && derived && (
        <div className="hidden">
          <DrawingSVG
            ref={svgRef}
            cfg={order.config}
            derived={derived}
            labels={cfgDict.drawing}
            refNo={order.ref}
            tp={tp}
            locale={locale}
            typeName={tp?.name?.de ?? (order.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars)}
          />
        </div>
      )}
    </div>
  );
}

export default function PortalDashboard({
  locale,
  t,
  cfgDict,
}: {
  locale: string;
  t: Dict["portal"];
  cfgDict: Dict["cfg"];
}) {
  const [session, setSess] = useState<{ email: string; role?: string } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [saved, setSaved] = useState<SavedConfig[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetchSavedConfigs().then(setSaved);
    if (hasBackend) {
      api
        .me()
        .then(async (u) => {
          setSess(u ? { email: u.email, role: u.role } : null);
          if (u) setOrders(await api.listOrders());
        })
        .catch(() => {
          setSess(null);
          notify("loadFailed");
        })
        .finally(() => setReady(true));
    } else {
      setSess(getSession());
      setOrders(loadOrders());
      setReady(true);
    }
  }, []);

  const refresh = () => {
    if (hasBackend) api.listOrders().then(setOrders).catch(() => notify("loadFailed"));
    else setOrders(loadOrders());
  };

  if (!ready) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse border border-hairline bg-mist/50" />
        ))}
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-start gap-5 border border-hairline p-8">
        <p className="text-sm font-light text-graphite">{t.needLogin}</p>
        <Link
          href={`/${locale}/login/`}
          className="inline-flex items-center justify-center bg-ink px-6 py-3 text-xs font-medium uppercase tracking-[0.16em] text-paper transition-colors hover:bg-graphite"
        >
          {t.toLogin}
        </Link>
      </div>
    );
  }

  const myOrders = orders.filter((o) => o.kind === "order");
  const myQuotes = orders.filter((o) => o.kind === "quote");

  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm font-light text-graphite">
          {t.signedInAs} <span className="text-ink">{session.email}</span>
        </p>
        <div className="flex items-center gap-6">
          <Link href={`/${locale}/configurator/`} className="text-xs uppercase tracking-[0.14em] text-graphite underline-offset-4 hover:text-ink hover:underline">
            + {t.newCfg}
          </Link>
          {(!hasBackend || (session.role && session.role !== "customer")) && (
            <Link href={`/${locale}/admin/`} className="text-xs uppercase tracking-[0.14em] text-graphite underline-offset-4 hover:text-ink hover:underline">
              {t.adminLink}
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              if (hasBackend) api.logout().catch(() => notify("saveFailed"));
              clearSession();
              setSess(null);
            }}
            className="text-xs uppercase tracking-[0.14em] text-stone underline-offset-4 hover:text-ink hover:underline"
          >
            {t.logout}
          </button>
        </div>
      </div>

      <section className="flex flex-col gap-5">
        <h2 className="border-t border-ink/60 pt-4 text-lg font-normal text-ink">{t.savedTitle}</h2>
        {saved.length === 0 ? (
          <p className="text-sm font-light text-graphite">
            {t.noSaved}{" "}
            <Link href={`/${locale}/configurator/`} className="text-ink underline underline-offset-4">
              {t.newCfg} →
            </Link>
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {saved.map((s) => {
              const lengthM = s.config.segments.reduce((sum, x) => sum + x.length, 0) / 1000;
              return (
                <div key={s.id} className="flex flex-col gap-3 border border-hairline bg-paper p-5 transition-colors hover:border-graphite">
                  <div className="flex justify-center bg-mist/40 px-5 py-4">
                    <div className="w-full max-w-[220px]">
                      <PlanSketch cfg={s.config} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium tracking-[0.02em] text-ink">{s.name}</span>
                    <span className="text-xs font-light text-stone">
                      {t.date} {s.createdAt}
                    </span>
                  </div>
                  <p className="text-sm font-light text-graphite">
                    {s.config.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars} · {lengthM.toLocaleString("de-CH")} m
                  </p>
                  <div className="flex items-center gap-5 border-t border-hairline pt-3">
                    <Link
                      href={`/${locale}/configurator/?c=${encodeConfig(s.config)}`}
                      className="text-xs uppercase tracking-[0.12em] text-ink underline underline-offset-4"
                    >
                      {t.openCfg} →
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        removeSavedConfig(s.id)
                          .then(() => fetchSavedConfigs())
                          .then(setSaved)
                          .catch(() => notify("saveFailed"));
                      }}
                      className="text-xs uppercase tracking-[0.12em] text-stone underline-offset-4 hover:text-ink hover:underline"
                    >
                      {t.deleteCfg}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="border-t border-ink/60 pt-4 text-lg font-normal text-ink">{t.ordersTitle}</h2>
        {myOrders.length === 0 ? (
          <p className="text-sm font-light text-graphite">
            {t.empty}{" "}
            <Link href={`/${locale}/configurator/`} className="text-ink underline underline-offset-4">
              {t.newCfg} →
            </Link>
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {myOrders.map((o) => (
              <OrderCard key={o.ref} order={o} t={t} cfgDict={cfgDict} locale={locale} onRefresh={refresh} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="border-t border-ink/60 pt-4 text-lg font-normal text-ink">{t.quotesTitle}</h2>
        {myQuotes.length === 0 ? (
          <p className="text-sm font-light text-graphite">
            {t.empty}{" "}
            <Link href={`/${locale}/configurator/`} className="text-ink underline underline-offset-4">
              {t.newCfg} →
            </Link>
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {myQuotes.map((o) => (
              <OrderCard key={o.ref} order={o} t={t} cfgDict={cfgDict} locale={locale} onRefresh={refresh} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
