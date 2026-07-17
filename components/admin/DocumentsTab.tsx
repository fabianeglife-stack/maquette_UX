"use client";

/*
 * Documents station: the per-order document binder. Pick an order on the left
 * and every document that belongs to it appears on the right, structured by
 * department (sales, finance, production, logistics, technical). Everything is
 * generated on the fly by the existing PDF generators — the binder is a lens
 * over the order, not a second storage.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { chf } from "@/lib/engine/pricing";
import { invoicesFor, reminderLevel } from "@/lib/engine/invoicing";
import { deriveRailing } from "@/lib/engine/geometry";
import { buildBom } from "@/lib/engine/bom";
import type { TypeProfile } from "@/lib/engine/types";
import { fmt, type Dict } from "@/lib/i18n";
import {
  confirmationNoFor,
  deliveryNoFor,
  invoiceNoFor,
  loadEvents,
  planFor,
  quoteNoFor,
  type Order,
  type OrderEvent,
  type TypePlans,
} from "@/lib/store";
import { fetchAllTypes, fetchPageContent, resolveType } from "@/lib/data";
import { hasBackend, type ApiOrder } from "@/lib/api";
import { downloadQuotePdf } from "@/components/portal/quote";
import { confirmationSummary, downloadConfirmationPdf } from "@/components/portal/confirmation";
import { downloadInvoicePdf } from "@/components/portal/invoice";
import { downloadReminderPdf } from "@/components/portal/reminder";
import { downloadDeliveryPdf, downloadFabricationPdf, downloadPickingPdf } from "./docs";
import { downloadDrawingPdf } from "@/components/configurator/pdf";
import DrawingSVG from "@/components/configurator/DrawingSVG";
import { StatusChip, TabSkeleton, inputCls, useOrders, type AdminDict } from "./shared";

/** One binder line: a document that exists or a slot with the reason it doesn't yet. */
function DocRow({
  label,
  no,
  note,
  reason,
  onDownload,
}: {
  label: string;
  no?: string;
  note?: string;
  reason?: string;
  onDownload?: () => void;
}) {
  const available = Boolean(onDownload);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline/70 py-2 first:border-t-0">
      <button
        type="button"
        disabled={!available}
        onClick={onDownload}
        className="border border-hairline px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-graphite transition-colors hover:border-graphite hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
      >
        ↓ PDF
      </button>
      <span className={`text-[13px] ${available ? "text-ink" : "text-stone"}`}>{label}</span>
      {no && <span className="text-xs font-light text-stone">{no}</span>}
      {note && <span className="text-xs font-light text-steel">{note}</span>}
      {!available && reason && <span className="ml-auto text-[11px] font-light italic text-stone">{reason}</span>}
    </div>
  );
}

function Category({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col border border-hairline p-4">
      <span className="pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{title}</span>
      {children}
    </div>
  );
}

export default function DocumentsTab({
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
  const { orders, ready } = useOrders();
  const [q, setQ] = useState("");
  const [selRef, setSelRef] = useState<string | null>(null);
  const [types, setTypes] = useState<TypeProfile[]>([]);
  const [typePlans, setTypePlans] = useState<TypePlans>({});
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    fetchAllTypes().then(setTypes);
    fetchPageContent<TypePlans>("typeplans", {}).then(setTypePlans);
  }, []);

  const needle = q.trim().toLowerCase();
  const list = useMemo(
    () =>
      orders
        .filter((o) => (needle === "" ? true : `${o.ref} ${o.customer.name} ${o.customer.city}`.toLowerCase().includes(needle)))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [orders, needle],
  );
  const order = orders.find((o) => o.ref === selRef) ?? null;

  // Engine output for the selected order's technical documents.
  const tp = useMemo(
    () => (order?.config && types.length > 0 ? resolveType(types, order.config.typeId, order.config.system) : null),
    [order, types],
  );
  const derived = useMemo(() => (order?.config && tp ? deriveRailing(order.config, tp) : null), [order, tp]);
  const bom = useMemo(() => (order?.config && tp && derived ? buildBom(order.config, derived, tp) : null), [order, tp, derived]);
  const systemName = order ? (order.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars) : "";
  const typeName =
    tp?.name?.[locale as "de" | "fr" | "en"] ?? tp?.name?.de ?? systemName;

  if (!ready) return <TabSkeleton />;

  const events: OrderEvent[] = order ? (hasBackend ? ((order as ApiOrder).events ?? []) : loadEvents(order.ref)) : [];
  const instalments = order ? invoicesFor(order, events) : [];
  const plan = order?.config ? planFor(typePlans, tp?.id ?? order.config.typeId ?? "", order.config.substrate ?? "concrete_top", order.config.mounting, tp?.planUrl) : undefined;

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {/* order picker */}
      <div className="flex w-full shrink-0 flex-col gap-3 lg:w-80">
        <p className="text-sm font-light leading-relaxed text-graphite">{t.docsHub.hint}</p>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.docsHub.search} className={inputCls} />
        <div className="flex max-h-[30vh] flex-col overflow-y-auto border border-hairline lg:max-h-[calc(100vh-220px)]">
          {list.length === 0 ? (
            <p className="p-4 text-sm font-light text-stone">{t.docsHub.empty}</p>
          ) : (
            list.map((o) => (
              <button
                key={o.ref}
                type="button"
                onClick={() => setSelRef(o.ref)}
                className={`flex flex-col gap-1 border-b border-hairline/70 px-3 py-2.5 text-left transition-colors last:border-b-0 ${
                  selRef === o.ref ? "bg-mist/70" : "hover:bg-mist/40"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-ink">{o.ref}</span>
                  <StatusChip status={o.status} label={statusLabels[o.status]} />
                </span>
                <span className="truncate text-xs font-light text-stone">
                  {o.customer.name} · {o.createdAt} · {chf(o.quotedGross ?? o.gross)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* binder */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {!order ? (
          <p className="border border-dashed border-hairline p-10 text-center text-sm font-light text-stone">{t.docsHub.select}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-base text-ink">
                {order.ref} <span className="text-sm font-light text-stone">· {order.customer.name}</span>
              </span>
              <StatusChip status={order.status} label={statusLabels[order.status]} />
            </div>

            {/* sales */}
            <Category title={t.docsHub.sale}>
              <DocRow
                label={quoteDict.title}
                no={quoteNoFor(order.ref)}
                note={order.validUntil ? `${quoteDict.validUntil} ${order.validUntil}` : undefined}
                onDownload={() => downloadQuotePdf(order, quoteDict, systemName)}
              />
              <DocRow
                label={t.docs.confirmation}
                no={confirmationNoFor(order.ref)}
                reason={t.docsHub.needConfirm}
                onDownload={
                  order.kind === "order" && order.deliveryDate
                    ? () =>
                        void downloadConfirmationPdf(order, confirmationDict, cfgDict.payTerms, systemName, {
                          svg: svgRef.current,
                          summary: confirmationSummary(order, cfgDict, typeName),
                        })
                    : undefined
                }
              />
            </Category>

            {/* finance */}
            {order.kind === "order" && (
              <Category title={t.docsHub.finance}>
                {instalments.length === 0 && <p className="text-xs font-light text-stone">{t.docsHub.noneYet}</p>}
                {instalments.map((inv) => (
                  <DocRow
                    key={inv.kind}
                    label={t.finance.types[inv.kind]}
                    no={inv.no}
                    note={inv.paidAt ? fmt(t.docsHub.paidOn, { date: inv.paidAt }) : inv.dueDate ? `${t.finance.colDue} ${inv.dueDate}` : undefined}
                    reason={t.docsHub.needShipped}
                    onDownload={inv.state !== "pending" ? () => downloadInvoicePdf(order, invoiceDict, systemName, inv) : undefined}
                  />
                ))}
                {instalments.flatMap((inv) =>
                  inv.reminders.map((date, i) => (
                    <DocRow
                      key={`${inv.kind}-r${i}`}
                      label={t.finance.reminderLevels[Math.min(i + 1, 3) as 1 | 2 | 3]}
                      no={inv.no}
                      note={date}
                      onDownload={() => downloadReminderPdf(order, inv, Math.min(i + 1, 3) as 1 | 2 | 3, date, reminderDict)}
                    />
                  )),
                )}
              </Category>
            )}

            {/* production */}
            {order.kind === "order" && (
              <Category title={t.docsHub.production}>
                <DocRow
                  label={t.docs.fabrication}
                  reason={t.docs.needConfig}
                  onDownload={
                    order.config && tp && derived && bom
                      ? () => downloadFabricationPdf(order, order.config!, tp, derived, bom, typeName, t.docs, t.bom, cfgDict, svgRef.current)
                      : undefined
                  }
                />
                <DocRow
                  label={t.docs.picking}
                  reason={t.docs.needConfig}
                  onDownload={derived && bom ? () => downloadPickingPdf(order, derived, bom, t.docs, t.bom) : undefined}
                />
              </Category>
            )}

            {/* logistics */}
            {order.kind === "order" && (
              <Category title={t.docsHub.logistics}>
                <DocRow label={t.docs.delivery} no={deliveryNoFor(order.ref)} onDownload={() => downloadDeliveryPdf(order, typeName, t.docs, derived)} />
              </Category>
            )}

            {/* technical */}
            <Category title={t.docsHub.technical}>
              <DocRow
                label={cfgDict.downloadPdf}
                reason={t.docs.needConfig}
                onDownload={
                  order.config && derived ? () => svgRef.current && downloadDrawingPdf(svgRef.current, `axioform-${order.ref}.pdf`) : undefined
                }
              />
              {plan ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline/70 py-2">
                  <a
                    href={plan.startsWith("data:") ? plan : `${process.env.NEXT_PUBLIC_BASE_PATH || ""}${plan}`}
                    {...(plan.startsWith("data:") ? { download: `axioform-plan-${order.ref}.pdf` } : { target: "_blank", rel: "noopener" })}
                    className="border border-hairline px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-graphite transition-colors hover:border-graphite hover:text-ink"
                  >
                    ↓ PDF
                  </a>
                  <span className="text-[13px] text-ink">{cfgDict.planPdf}</span>
                </div>
              ) : (
                <DocRow label={cfgDict.planPdf} reason={t.docsHub.noPlan} />
              )}
            </Category>

            {/* offscreen principle drawing feeding the PDFs above */}
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
          </>
        )}
      </div>
    </div>
  );
}
