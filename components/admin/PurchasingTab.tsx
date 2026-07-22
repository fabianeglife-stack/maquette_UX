"use client";

/*
 * Purchasing station: the work queue for supplier purchase orders. Every
 * plan-approved order shows its two POs — material (BM-) and surface
 * treatment (BT-) — with the PDF and a "record as sent" action. The physical
 * movements (goods receipt, treatment round-trip, palletizing) live in the
 * logistics station; production is gated on both POs + the goods receipt.
 */

import { useEffect, useMemo, useState } from "react";
import { deriveRailing } from "@/lib/engine/geometry";
import { materialOrderFor, treatmentOrderFor } from "@/lib/engine/procurement";
import type { TypeProfile } from "@/lib/engine/types";
import { fetchAllTypes, fetchPageContent, resolveType } from "@/lib/data";
import { api } from "@/lib/api";
import { notify } from "@/lib/toast";
import { buildXlsx } from "@/lib/export/xlsx";
import { buildInventorWorkbook } from "@/lib/export/inventorParams";
import {
  DEFAULT_SUPPLIERS,
  materialNoFor,
  treatmentNoFor,
  type Milestone,
  type Order,
  type Suppliers,
} from "@/lib/store";
import type { Dict } from "@/lib/i18n";
import { buildMaterialOrderDoc, buildTreatmentOrderDoc } from "./purchase";
import { StatusChip, TabSkeleton, useOrders, type AdminDict } from "./shared";

const PO_STEPS: { m: Milestone; field: "materialOrderedAt" | "treatmentOrderedAt" }[] = [
  { m: "material_ordered", field: "materialOrderedAt" },
  { m: "treatment_ordered", field: "treatmentOrderedAt" },
];

export default function PurchasingTab({
  t,
  statusLabels,
  cfgDict,
}: {
  t: AdminDict;
  statusLabels: Dict["portal"]["status"];
  cfgDict: Dict["cfg"];
}) {
  const { orders, ready, markMilestone } = useOrders();
  const [types, setTypes] = useState<TypeProfile[]>([]);
  const [suppliers, setSuppliers] = useState<Suppliers>(DEFAULT_SUPPLIERS);
  const [stepBusy, setStepBusy] = useState<string | null>(null);
  useEffect(() => {
    fetchAllTypes().then(setTypes);
    fetchPageContent<Suppliers>("suppliers", DEFAULT_SUPPLIERS).then(setSuppliers);
  }, []);

  // The purchasing queue: plan-approved orders that are not shipped yet.
  const queue = useMemo(
    () =>
      orders.filter(
        (o) => o.kind === "order" && Boolean(o.plansApprovedAt) && ["new", "confirmed", "production"].includes(o.status),
      ),
    [orders],
  );
  const openPos = queue.reduce((s, o) => s + PO_STEPS.filter(({ field }) => !o[field]).length, 0);
  const awaitingReceipt = queue.filter((o) => o.materialOrderedAt && o.treatmentOrderedAt && !o.materialReceivedAt).length;

  if (!ready) return <TabSkeleton />;

  // Per-piece tube-laser STEP bundle: generated + persisted server-side, then
  // downloaded here. 409 no_templates means no Inventor template for the type.
  const downloadStep = async (o: Order) => {
    setStepBusy(o.ref);
    try {
      const res = await fetch(api.stepUrl(o.ref), { credentials: "same-origin" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        notify("loadFailed", body?.error === "no_templates" ? t.stepTpl.needTemplates : t.stepTpl.genFailed);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `axioform-${o.ref}-step.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      notify("loadFailed", t.stepTpl.genFailed);
    } finally {
      setStepBusy(null);
    }
  };

  // Inventor parameter table (.xlsx) — built client-side from the config, like
  // the Finance CSV. Drives the user's Inventor master model via a linked sheet.
  const downloadXlsx = (o: Order) => {
    if (!o.config) return;
    const tp = resolveType(types, o.config.typeId, o.config.system);
    if (!tp) return;
    const derived = deriveRailing(o.config, tp);
    const bytes = buildXlsx(buildInventorWorkbook(o.ref, o.config, derived, tp));
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `axioform-${o.ref}-inventor.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadPo = (o: Order, m: Milestone) => {
    if (!o.config) return;
    const tp = resolveType(types, o.config.typeId, o.config.system);
    if (!tp) return;
    const derived = deriveRailing(o.config, tp);
    if (m === "material_ordered") {
      const { doc, filename } = buildMaterialOrderDoc(o, materialOrderFor(o.config, derived, tp), suppliers, t.purchase, t.bom.parts);
      doc.save(filename);
    } else {
      const treat = treatmentOrderFor(o.config, derived);
      const { doc, filename } = buildTreatmentOrderDoc(o, treat, suppliers, t.purchase, treat.ral ? cfgDict.colors[treat.ral] : undefined);
      doc.save(filename);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-lg border border-[#e4e6ea] bg-white px-4 py-3 shadow-sm">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a8f98]">{t.purchasing.kpiToOrder}</span>
          <span className="text-xl font-semibold text-[#1b1e24]">{openPos}</span>
        </div>
        <div className="rounded-lg border border-[#e4e6ea] bg-white px-4 py-3 shadow-sm">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a8f98]">{t.purchasing.kpiAwaitingReceipt}</span>
          <span className="text-xl font-semibold text-[#1b1e24]">{awaitingReceipt}</span>
        </div>
        <span className="ml-auto max-w-md text-[11px] leading-relaxed text-[#8a8f98]">{t.purchasing.hint}</span>
      </div>

      {queue.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#d6d9de] p-8 text-center text-sm text-[#8a8f98]">{t.purchasing.empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {queue.map((o) => (
            <div key={o.ref} className="flex flex-col gap-2 rounded-lg border border-[#e4e6ea] bg-white px-4 py-3 shadow-sm">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <StatusChip status={o.status} label={statusLabels[o.status]} />
                <span className="text-[13px] font-semibold text-[#1b1e24]">{o.ref}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-[#5b6069]">
                  {o.customer.name} · {o.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars} · {o.lengthM.toLocaleString("de-CH")} m
                </span>
                {o.materialOrderedAt && o.treatmentOrderedAt && !o.materialReceivedAt && (
                  <span className="text-[11px] text-[#8a8f98]">{t.purchasing.awaitingReceipt}</span>
                )}
                <span className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!o.config}
                    onClick={() => downloadXlsx(o)}
                    title={t.stepTpl.xlsxHint}
                    className="rounded-md border border-[#d6d9de] px-2.5 py-1 text-[10.5px] font-medium text-[#5b6069] transition-colors hover:border-[#8a8f98] hover:text-[#1b1e24] disabled:opacity-40"
                  >
                    ↓ {t.stepTpl.xlsxButton}
                  </button>
                  <button
                    type="button"
                    disabled={!o.config || stepBusy === o.ref}
                    onClick={() => downloadStep(o)}
                    title={t.stepTpl.zipHint}
                    className="rounded-md border border-[#d6d9de] px-2.5 py-1 text-[10.5px] font-medium text-[#5b6069] transition-colors hover:border-[#8a8f98] hover:text-[#1b1e24] disabled:opacity-40"
                  >
                    {stepBusy === o.ref ? t.stepTpl.generating : `↓ ${t.stepTpl.zipButton}`}
                  </button>
                </span>
              </div>
              <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-6">
                {PO_STEPS.map(({ m, field }) => {
                  const done = o[field];
                  const label = m === "material_ordered" ? t.purchase.materialTitle : t.purchase.treatmentTitle;
                  const no = m === "material_ordered" ? materialNoFor(o.ref) : treatmentNoFor(o.ref);
                  return (
                    <div key={m} className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-[#f7f8f9] px-3 py-2">
                      <span className={`text-[12.5px] ${done ? "text-[#1b1e24]" : "text-[#5b6069]"}`}>
                        {done ? "✓ " : ""}
                        {label}
                      </span>
                      <span className="text-[11px] text-[#8a8f98]">{no}</span>
                      <span className="ml-auto flex items-center gap-2">
                        {o.config && (
                          <button
                            type="button"
                            onClick={() => downloadPo(o, m)}
                            className="rounded-md border border-[#d6d9de] px-2.5 py-1 text-[10.5px] font-medium text-[#5b6069] transition-colors hover:border-[#8a8f98] hover:text-[#1b1e24]"
                          >
                            ↓ PDF
                          </button>
                        )}
                        {done ? (
                          <span className="text-[11px] text-[#8a8f98]">{done}</span>
                        ) : (
                          <button
                            type="button"
                            disabled={!o.config}
                            onClick={() => markMilestone(o, m)}
                            className="rounded-md bg-[#1b1e24] px-2.5 py-1 text-[10.5px] font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-40"
                          >
                            {t.purchase.mark}
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
