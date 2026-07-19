"use client";

/*
 * A filtered lens on the order book for one operational role (production,
 * logistics, invoicing): which orders need work in this station, their value,
 * and one-click access to the documents and the next lifecycle step.
 */

import { useState } from "react";
import { chf } from "@/lib/engine/pricing";
import { isLate, milestoneReady, ORDER_FLOW, type Milestone, type OrderStatus } from "@/lib/store";
import type { Dict } from "@/lib/i18n";
import OrderDrawer from "./OrderDrawer";
import { LateBadge, StatusChip, TabSkeleton, useOrders, type AdminDict } from "./shared";

export default function OpsView({
  t,
  statusLabels,
  cfgDict,
  invoiceDict,
  confirmationDict,
  quoteDict,
  locale,
  statuses,
  accent,
  hint,
  stationSteps,
}: {
  t: AdminDict;
  statusLabels: Dict["portal"]["status"];
  cfgDict: Dict["cfg"];
  invoiceDict: Dict["portal"]["invoice"];
  confirmationDict: Dict["portal"]["confirmation"];
  quoteDict: Dict["portal"]["quote"];
  locale?: string;
  statuses: OrderStatus[];
  accent: string;
  hint: string;
  /** Station-owned milestones surfaced as inline actions (next ready one). */
  stationSteps?: Milestone[];
}) {
  const { orders, ready, advance, sendQuote, markAccepted, sendPlans, markMilestone, setShipping, setDeliveryDate, cancel } = useOrders();
  const [openRef, setOpenRef] = useState<string | null>(null);

  if (!ready) return <TabSkeleton />;

  const list = orders
    .filter((o) => o.kind === "order" && statuses.includes(o.status))
    .sort((a, b) => statuses.indexOf(a.status) - statuses.indexOf(b.status));
  const total = list.reduce((s, o) => s + o.gross, 0);
  const selected = list.find((o) => o.ref === openRef) ?? orders.find((o) => o.ref === openRef) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-[#e4e6ea] bg-white px-5 py-3.5 shadow-sm">
        <span className="flex items-center gap-2 text-sm font-semibold text-[#1b1e24]">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
          {list.length} {t.ops.count}
        </span>
        <span className="text-sm text-[#5b6069]">
          {t.ops.value}: <span className="font-medium text-[#1b1e24]">{chf(total)}</span>
        </span>
        <span className="ml-auto text-[11px] text-[#8a8f98]">{hint}</span>
      </div>

      {list.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#d6d9de] p-8 text-center text-sm text-[#8a8f98]">{t.ops.empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((o) => {
            const idx = ORDER_FLOW.indexOf(o.status);
            const next = idx >= 0 && idx < ORDER_FLOW.length - 1 ? ORDER_FLOW[idx + 1] : null;
            // Mirror the API gates: fabrication needs both POs + goods receipt,
            // shipping needs the treatment return + palletizing (configured orders).
            const blockedNote =
              next === "confirmed" && !o.deliveryDate
                ? t.orders.deliveryRequired
                : next === "production" && Boolean(o.config) && !(o.materialOrderedAt && o.treatmentOrderedAt && o.materialReceivedAt)
                  ? t.purchase.procurementRequired
                  : next === "shipped" && Boolean(o.config) && !(o.treatmentReceivedAt && o.palletizedAt)
                    ? t.purchase.logisticsRequired
                    : undefined;
            // The station's next milestone ready to record (inline action).
            const nextLog = stationSteps?.find((m) => milestoneReady(o, m));
            return (
              <div key={o.ref} className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-[#e4e6ea] bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md">
                <StatusChip status={o.status} label={statusLabels[o.status]} />
                {isLate(o) && <LateBadge label={t.orders.late} />}
                <button type="button" onClick={() => setOpenRef(o.ref)} className="text-[13px] font-semibold text-[#1b1e24] underline-offset-4 hover:underline">
                  {o.ref}
                </button>
                <span className="min-w-0 flex-1 truncate text-[13px] text-[#5b6069]">
                  {o.customer.name} · {o.customer.city} · {o.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars} · {o.lengthM.toLocaleString("de-CH")} m
                </span>
                <span className="text-[13px] font-medium text-[#1b1e24]">{chf(o.gross)}</span>
                {nextLog && (
                  <button
                    type="button"
                    // QC needs the three-point sign-off in the drawer; the other
                    // movements are a one-click record from the station row.
                    onClick={() => (nextLog === "qc_passed" ? setOpenRef(o.ref) : markMilestone(o, nextLog))}
                    className="rounded-md border px-3 py-1.5 text-[11px] font-semibold transition-colors hover:text-white"
                    style={{ borderColor: accent, color: accent }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = accent)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {t.purchase.steps[nextLog]}{nextLog === "qc_passed" ? " ›" : " ✓"}
                  </button>
                )}
                {next && (
                  <button
                    type="button"
                    disabled={Boolean(blockedNote)}
                    title={blockedNote}
                    onClick={() => advance(o.ref, next)}
                    className="rounded-md px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: accent }}
                  >
                    {statusLabels[next]} ›
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpenRef(o.ref)}
                  className="rounded-md border border-[#d6d9de] px-3 py-1.5 text-[11px] font-medium text-[#5b6069] transition-colors hover:border-[#8a8f98] hover:text-[#1b1e24]"
                >
                  {t.ops.open}
                </button>
              </div>
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
