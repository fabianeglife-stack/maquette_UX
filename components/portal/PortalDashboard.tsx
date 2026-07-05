"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import DrawingSVG from "@/components/configurator/DrawingSVG";
import { downloadDrawingPdf } from "@/components/configurator/pdf";
import { downloadInvoicePdf } from "./invoice";
import { deriveRailing } from "@/lib/engine/geometry";
import { chf } from "@/lib/engine/pricing";
import { findType } from "@/lib/store";
import {
  acceptQuote,
  clearSession,
  deleteSavedConfig,
  encodeConfig,
  getSession,
  loadOrders,
  loadSavedConfigs,
  ORDER_FLOW,
  QUOTE_FLOW,
  type Order,
  type OrderStatus,
  type SavedConfig,
} from "@/lib/store";
import type { Dict } from "@/lib/i18n";
import { api, hasBackend } from "@/lib/api";

function StatusSteps({
  status,
  flow,
  labels,
}: {
  status: OrderStatus;
  flow: OrderStatus[];
  labels: Dict["portal"]["status"];
}) {
  const idx = flow.indexOf(status);
  return (
    <div className="flex items-center gap-1.5">
      {flow.map((s, i) => (
        <div key={s} className="flex items-center gap-1.5">
          <span
            title={labels[s]}
            className={`h-2 w-2 rounded-full ${i <= idx ? "bg-ink" : "bg-hairline"}`}
          />
          {i < flow.length - 1 && <span className={`h-px w-5 ${i < idx ? "bg-ink" : "bg-hairline"}`} />}
        </div>
      ))}
      <span className="pl-2 text-xs font-light text-graphite">{labels[status]}</span>
    </div>
  );
}

function OrderCard({
  order,
  t,
  cfgDict,
  onRefresh,
}: {
  order: Order;
  t: Dict["portal"];
  cfgDict: Dict["cfg"];
  onRefresh: () => void;
}) {
  const flow = order.kind === "order" ? ORDER_FLOW : QUOTE_FLOW;
  const svgRef = useRef<SVGSVGElement>(null);
  const derived = useMemo(() => {
    if (!order.config) return null;
    return deriveRailing(order.config, findType(order.config.typeId, order.config.system));
  }, [order.config]);

  return (
    <div className="flex flex-col gap-3 border border-hairline bg-paper p-5">
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
          <button
            type="button"
            onClick={() => {
              if (hasBackend) {
                api.patchOrder(order.ref, { accept: true }).then(onRefresh).catch(() => {});
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
        </div>
      )}
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
        {order.kind === "order" && (
          <button
            type="button"
            onClick={() =>
              downloadInvoicePdf(order, t.invoice, order.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars)
            }
            className="text-xs uppercase tracking-[0.12em] text-graphite underline-offset-4 hover:text-ink hover:underline"
          >
            ↓ {t.invoicePdf}
          </button>
        )}
      </div>
      {order.config && derived && (
        <div className="hidden">
          <DrawingSVG ref={svgRef} cfg={order.config} derived={derived} labels={cfgDict.drawing} refNo={order.ref} />
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
  const [session, setSess] = useState<{ email: string } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [saved, setSaved] = useState<SavedConfig[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSaved(loadSavedConfigs());
    if (hasBackend) {
      api
        .me()
        .then(async (u) => {
          setSess(u ? { email: u.email } : null);
          if (u) setOrders(await api.listOrders());
        })
        .catch(() => setSess(null))
        .finally(() => setReady(true));
    } else {
      setSess(getSession());
      setOrders(loadOrders());
      setReady(true);
    }
  }, []);

  const refresh = () => {
    if (hasBackend) api.listOrders().then(setOrders).catch(() => {});
    else setOrders(loadOrders());
  };

  if (!ready) return null;

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
          <Link href={`/${locale}/admin/`} className="text-xs uppercase tracking-[0.14em] text-graphite underline-offset-4 hover:text-ink hover:underline">
            {t.adminLink}
          </Link>
          <button
            type="button"
            onClick={() => {
              if (hasBackend) api.logout().catch(() => {});
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
          <p className="text-sm font-light text-stone">{t.noSaved}</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {saved.map((s) => {
              const lengthM = s.config.segments.reduce((sum, x) => sum + x.length, 0) / 1000;
              return (
                <div key={s.id} className="flex flex-col gap-3 border border-hairline bg-paper p-5">
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
                        deleteSavedConfig(s.id);
                        setSaved(loadSavedConfigs());
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
          <p className="text-sm font-light text-stone">{t.empty}</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {myOrders.map((o) => (
              <OrderCard key={o.ref} order={o} t={t} cfgDict={cfgDict} onRefresh={refresh} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="border-t border-ink/60 pt-4 text-lg font-normal text-ink">{t.quotesTitle}</h2>
        {myQuotes.length === 0 ? (
          <p className="text-sm font-light text-stone">{t.empty}</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {myQuotes.map((o) => (
              <OrderCard key={o.ref} order={o} t={t} cfgDict={cfgDict} onRefresh={refresh} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
