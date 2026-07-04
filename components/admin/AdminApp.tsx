"use client";

import { useEffect, useState } from "react";
import { chf, defaultPriceBook, type PriceBook } from "@/lib/engine/pricing";
import {
  loadOrders,
  loadPriceBook,
  ORDER_FLOW,
  QUOTE_FLOW,
  resetPriceBook,
  savePriceBook,
  updateOrderStatus,
  type Order,
  type OrderStatus,
} from "@/lib/store";
import type { Dict } from "@/lib/i18n";

type AdminDict = Dict["admin"];
type Tab = "orders" | "pricing" | "products";

/* ---------- orders tab ---------- */

function OrdersTable({ t, statusLabels, cfgDict }: { t: AdminDict; statusLabels: Dict["portal"]["status"]; cfgDict: Dict["cfg"] }) {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => setOrders(loadOrders()), []);

  const advance = (ref: string, status: OrderStatus) => {
    updateOrderStatus(ref, status);
    setOrders(loadOrders());
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-left">
        <thead>
          <tr className="border-b border-ink/50">
            {[t.table.ref, t.table.date, t.table.customer, t.table.system, t.table.length, t.table.total, t.table.kind, t.table.status].map((h) => (
              <th key={h} className="py-3 pr-4 text-[11px] font-medium uppercase tracking-[0.14em] text-stone">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const flow = o.kind === "order" ? ORDER_FLOW : QUOTE_FLOW;
            return (
              <tr key={o.ref} className="border-b border-hairline align-baseline">
                <td className="py-3 pr-4 text-sm text-ink">{o.ref}</td>
                <td className="py-3 pr-4 text-sm font-light text-graphite">{o.createdAt}</td>
                <td className="py-3 pr-4 text-sm font-light text-graphite">
                  {o.customer.name}
                  <span className="block text-xs text-stone">{o.customer.city}</span>
                </td>
                <td className="py-3 pr-4 text-sm font-light text-graphite">
                  {o.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars}
                </td>
                <td className="py-3 pr-4 text-sm font-light text-graphite">{o.lengthM.toLocaleString("de-CH")} m</td>
                <td className="py-3 pr-4 whitespace-nowrap text-sm font-light text-ink">{chf(o.gross)}</td>
                <td className="py-3 pr-4">
                  <span
                    className={`inline-block border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${
                      o.kind === "order" ? "border-ink/40 text-ink" : "border-steel/50 text-steel"
                    }`}
                  >
                    {t.kind[o.kind]}
                  </span>
                </td>
                <td className="py-3">
                  <select
                    value={o.status}
                    onChange={(e) => advance(o.ref, e.target.value as OrderStatus)}
                    className="border border-hairline bg-paper px-2 py-1.5 text-xs font-light text-ink outline-none focus:border-graphite"
                  >
                    {flow.map((s) => (
                      <option key={s} value={s}>
                        {statusLabels[s]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- pricing tab ---------- */

function PricingEditor({ t }: { t: AdminDict }) {
  const [pb, setPb] = useState<PriceBook>(defaultPriceBook);
  const [saved, setSaved] = useState(false);

  useEffect(() => setPb(loadPriceBook()), []);

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
            savePriceBook(pb);
            setPb(loadPriceBook());
            setSaved(true);
          }}
          className="inline-flex items-center justify-center bg-ink px-6 py-3 text-xs font-medium uppercase tracking-[0.16em] text-paper transition-colors hover:bg-graphite"
        >
          {t.save}
        </button>
        <button
          type="button"
          onClick={() => {
            resetPriceBook();
            setPb(loadPriceBook());
            setSaved(false);
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

/* ---------- products tab ---------- */

function ProductsTab({ t }: { t: AdminDict }) {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { name: t.productBars, spec: t.productBarsSpec },
          { name: t.productGlass, spec: t.productGlassSpec },
        ].map((p) => (
          <div key={p.name} className="flex flex-col gap-2 border border-hairline p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink">{p.name}</span>
              <span className="border border-[#4a7c59] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[#4a7c59]">
                {t.productsActive}
              </span>
            </div>
            <p className="text-xs font-light leading-relaxed text-graphite">{p.spec}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 border border-dashed border-hairline p-5 opacity-80">
        <span className="text-sm text-graphite">+ {t.newType}</span>
        <p className="text-xs font-light leading-relaxed text-stone">{t.newTypeNote}</p>
      </div>
    </div>
  );
}

/* ---------- shell ---------- */

export default function AdminApp({
  t,
  statusLabels,
  cfgDict,
}: {
  t: AdminDict;
  statusLabels: Dict["portal"]["status"];
  cfgDict: Dict["cfg"];
}) {
  const [tab, setTab] = useState<Tab>("orders");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex gap-px self-start bg-hairline">
        {(["orders", "pricing", "products"] as const).map((v) => (
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

      {tab === "orders" && <OrdersTable t={t} statusLabels={statusLabels} cfgDict={cfgDict} />}
      {tab === "pricing" && <PricingEditor t={t} />}
      {tab === "products" && <ProductsTab t={t} />}
    </div>
  );
}
